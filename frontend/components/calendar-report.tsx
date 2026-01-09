import type { CalendarDay } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

type CalendarType =
    | "COMMITTEE_REPORT"
    | "THIRD_READING"
    | "SPECIAL_ORDER"
    | "LAID_OVER"
    | (string & {})

type FloorCalendarItem = {
    id: number
    position: number | null
    billNumber: string | null
    notes?: string | null
    actionText?: string | null
    bill?: {
        id: number
        billNumber: string
        shortTitle?: string | null
        statusDesc?: string | null
    } | null
}

type FloorCalendar = {
    id: number
    calendarType: CalendarType
    calendarNumber: number | null // used as "Report No." for committee reports, and "Calendar Number" otherwise
    calendarDate: string | Date
    dataSource?: {
        header?: {
            consentCalendar?: number | boolean | null // sometimes present
        }
    } | null
    committee?: {
        abbreviation?: string | null
        name?: string | null
    } | null
    items: FloorCalendarItem[]
}

type OrganizedGroup = {
    /** Stable key for React + grouping */
    key: string
    heading: string
    committeeName?: string | null
    committeeAbbrev?: string | null
    reportNumber?: number | null
    consentCalendarNumber?: number | null
    /** All calendars that fell into this "report" bucket */
    // calendars: Array<{
    //     calendarId: number
    //     calendarNumber: number | null
    //     items: FloorCalendarItem[]
    // }>
    /** Flattened items (optional convenience) */
    items: FloorCalendarItem[]
}

type OrganizedSection = {
    title: string
    groups: OrganizedGroup[]
}

// Shorten the name of the sponsor
const shortenSponsor = ( name: string ) => {
    return name.replace('Senator ', 'Sen. ').replace('Delegate ', 'Del. ').replace(' Committee', '').trim()
}

const toDate = (d: string | Date) => (d instanceof Date ? d : new Date(d))

function sectionDateLabel(rawCalendars: FloorCalendar[], calendarType: CalendarType) {
    const dates = rawCalendars
        .filter((c) => c.calendarType === calendarType)
        .map((c) => toDate(c.calendarDate))
        .filter((d) => !Number.isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())

    if (dates.length === 0) return ""

    const fmt = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    })

    const first = dates[0]
    const last = dates[dates.length - 1]

    // same day?
    if (first.toDateString() === last.toDateString()) return fmt.format(first)

    return `${fmt.format(first)} – ${fmt.format(last)}`
}


function organizeFloorCalendars(raw: FloorCalendar[] | undefined | null): { sections: OrganizedSection[] } {
    const safeRaw: FloorCalendar[] = Array.isArray(raw) ? raw : []

    const sectionDefs: Array<{ title: string; match: (t: CalendarType) => boolean }> = [
        { title: "Second Reading Calendar", match: (t) => t === "COMMITTEE_REPORT" },
        { title: "Third Reading Calendar", match: (t) => t === "THIRD_READING" },
        { title: "Special Order Calendar", match: (t) => t === "SPECIAL_ORDER" },
        { title: "Laid Over Bills Calendar", match: (t) => t === "LAID_OVER" },
        { title: "Vetoed Bills Calendar", match: (t) => t === "VETOED" },
    ]

    const getConsentNumber = (c: FloorCalendar): number | null => {
        const v = c.dataSource?.header?.consentCalendar
        if (typeof v === "number") return v
        // if API ever sends boolean true, we can't infer a number, so treat as null
        return null
    }

    const committeeLabel = (c: FloorCalendar) =>
        c.committee?.name?.trim() ||
        c.committee?.abbreviation?.trim() ||
        "Committee"

    const groupKeyFor = (c: FloorCalendar): string => {
        if (c.calendarType === "COMMITTEE_REPORT") {
            const committee = committeeLabel(c)
            const reportNo = c.calendarNumber ?? -1
            const consentNo = getConsentNumber(c)
            return `COMMITTEE_REPORT|${committee}|report:${reportNo}|consent:${consentNo ?? "none"}`
        }

        // Non-committee calendars are grouped by calendar number
        const n = c.calendarNumber ?? -1
        return `${c.calendarType}|calendar:${n}`
    }

    const headingFor = (c: FloorCalendar): string => {
        if (c.calendarType === "COMMITTEE_REPORT") {
            const committee = committeeLabel(c)
            const reportNo = c.calendarNumber ?? ""
            const consentNo = getConsentNumber(c)

            // matches the required "committee name, report X, consent calendar Z" variant when present
            return consentNo != null
                ? `${committee} - Report ${reportNo}, Consent Calendar ${consentNo}`
                : `${committee} - Report ${reportNo}`
        }

        return `Calendar Number ${c.calendarNumber ?? ""}`
    }

    const sortItems = (items: FloorCalendarItem[]) =>
        (items ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    const buildSection = (title: string, calendars: FloorCalendar[]): OrganizedSection => {
        const map = new Map<string, OrganizedGroup>()

        for (const cal of calendars) {
            const key = groupKeyFor(cal)

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    heading: headingFor(cal),
                    committeeName: cal.committee?.name ?? null,
                    committeeAbbrev: cal.committee?.abbreviation ?? null,
                    reportNumber: cal.calendarType === "COMMITTEE_REPORT" ? cal.calendarNumber ?? null : null,
                    consentCalendarNumber: cal.calendarType === "COMMITTEE_REPORT" ? getConsentNumber(cal) : null,
                    items: [],
                })
            }

            //                     calendars: [],

            const group = map.get(key)!

            const sorted = sortItems(cal.items ?? [])
            // group.calendars.push({
            //     calendarId: cal.id,
            //     calendarNumber: cal.calendarNumber ?? null,
            //     items: sorted,
            // })

            // convenience: flatten all items into one list for the table with each of the bills in the report
            group.items.push(...sorted)
        }

        // Sort groups in a predictable way:
        // - Committee reports: by reportNumber, then consentCalendarNumber
        // - Others: by calendarNumber
        const groups = [...map.values()].sort((a, b) => {
            const ar = a.reportNumber ?? Number.MAX_SAFE_INTEGER
            const br = b.reportNumber ?? Number.MAX_SAFE_INTEGER
            if (ar !== br) return ar - br

            const ac = a.consentCalendarNumber ?? Number.MAX_SAFE_INTEGER
            const bc = b.consentCalendarNumber ?? Number.MAX_SAFE_INTEGER
            if (ac !== bc) return ac - bc

            // Always return a number (stable fallback)
            return a.heading.localeCompare(b.heading)
        })

        return { title, groups }
    }

    const sections: OrganizedSection[] = sectionDefs.map((def) => {
        const calendars = safeRaw.filter((c) => def.match(c.calendarType))
        return buildSection(def.title, calendars)
    })

    return { sections }
}

const COLS = {
    flag: "w-[28px]",
    bill: "w-[92px]",
    sponsor: "w-[140px] print:w-[100px]",
    title: "w-[520px] print:w-[250px]",
    committee: "w-[160px]",
    vote: "w-[160px]",
    action: "w-[180px]",
    notes: "w-[260px]",
} as const

const cellBase = "align-top whitespace-normal"

export async function CalendarReport({ calendarData }: { calendarData: CalendarDay }) {
    // Show the filter by date, checkbox to show all bills or split votes only, show alert bills

    // @TODO fix this eventually. Need central/correct type decs
    const rawCalendars = ((calendarData as any).calendars ?? []) as FloorCalendar[]
    const calendars = organizeFloorCalendars(rawCalendars)
    
    return (
        <>
            {calendars.sections.map(( section, index ) => {
                const isLast = index === calendars.sections.length - 1

                return (
                    <div key={`${index}-${section.title}`} className={!isLast ? 'page-break-after' : undefined}>
                        <h2 className="text-2xl font-bold tracking-tight text-center">
                            {section.title}
                        </h2>
                        <p className="text-xl font-medium tracking-tight text-center mb-4">
                            {(() => {
                                // map section title -> calendarType used in your organizer defs
                                const typeByTitle: Record<string, CalendarType> = {
                                    "Second Reading Calendar": "COMMITTEE_REPORT",
                                    "Third Reading Calendar": "THIRD_READING",
                                    "Special Order Calendar": "SPECIAL_ORDER",
                                    "Laid Over Bills Calendar": "LAID_OVER",
                                    "Vetoed Bills Calendar": "VETOED",
                                }

                                const t = typeByTitle[section.title]
                                return t ? sectionDateLabel(rawCalendars, t) : ""
                            })()}
                        </p>

                        {(section.groups.length == 0) && (
                            <div className="mb-6">No Bills on this calendar</div>
                        )}

                        {section.groups.map(( group, groupIndex ) => (
                            <div key={`${groupIndex}-${group.key}`}>
                                <div className="mb-8 w-full no-print-scroll overflow-x-auto">
                                    <Table className="min-w-[980px] table-fixed print-friendly">
                                        <colgroup>
                                            <col className={COLS.flag} />
                                            <col className={COLS.bill} />
                                            <col className={`hidden md:table-column print:!table-column ${COLS.sponsor}`} />
                                            <col className={COLS.title} />
                                            <col className={`hidden md:table-column print:!table-column ${COLS.committee}`} />
                                            <col className={`hidden lg:table-column print:!table-column ${COLS.vote}`} />
                                            <col className={`hidden xl:table-column print:!table-column ${COLS.action}`} />
                                            <col className={`hidden xl:table-column print:!table-column ${COLS.notes}`} />
                                        </colgroup>

                                        <TableHeader>
                                            <TableRow>
                                                <TableHead
                                                    colSpan={8}
                                                    className="text-md text-left font-semibold border-0 border-t-2 border-b-2 border-black"
                                                >
                                                    {group.heading}
                                                </TableHead>
                                            </TableRow>

                                            <TableRow className="font-semibold">
                                                <TableHead className={COLS.flag} />
                                                <TableHead className={COLS.bill}>Bill</TableHead>
                                                <TableHead className={`hidden md:table-cell print:!table-cell ${COLS.sponsor}`}>Sponsor</TableHead>
                                                <TableHead className={COLS.title}>Title</TableHead>
                                                <TableHead className={`hidden md:table-cell print:!table-cell ${COLS.committee}`}>Committee</TableHead>
                                                <TableHead className={`hidden lg:table-cell print:!table-cell ${COLS.vote}`}>Vote</TableHead>
                                                <TableHead className={`hidden xl:table-cell print:!table-cell ${COLS.action}`}>Action</TableHead>
                                                <TableHead className={`hidden xl:table-cell print:!table-cell ${COLS.notes}`}>Notes</TableHead>
                                            </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                            {group.items.map((item: any) => {
                                                const isFlagged = Boolean(item.bill?.isFlagged)

                                                return (
                                                    <TableRow key={item.id} className={isFlagged ? "bg-yellow-100 hover:bg-yellow-200" : ""}>
                                                        {/* <TableCell colSpan={8}>
                                                            <pre>{JSON.stringify(item, null, 2)}</pre>
                                                        </TableCell> */}
                                                        <TableCell className={`${cellBase} ${COLS.flag} font-medium`}>
                                                            {isFlagged ? (
                                                                <span
                                                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-black text-xs font-extrabold"
                                                                    aria-label="Flagged bill"
                                                                    title="Flagged bill"
                                                                >
                                                                    !
                                                                </span>
                                                            ) : null}
                                                        </TableCell>
                                                        <TableCell className={`${cellBase} ${COLS.bill} font-medium`}>
                                                            <Link href={`/bills/${item.billNumber}`} className="text-primary hover:underline">
                                                                {item.billNumber}
                                                            </Link>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden md:table-cell print:!table-cell ${COLS.sponsor}`}>
                                                            <div className="line-clamp-2">
                                                                {shortenSponsor(item.bill.sponsorDisplay)}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} ${COLS.title}`}>
                                                            {/* 3-line clamp with ellipsis */}
                                                            <div className="line-clamp-3 leading-snug">
                                                                {item.bill.shortTitle}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden md:table-cell print:!table-cell ${COLS.committee}`}>
                                                            { item.committee?.abbreviation && item.committee.abbreviation }
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden lg:table-cell print:!table-cell ${COLS.vote}`}>
                                                            <div className="text-sm">
                                                                11-0
                                                                <div className="mt-1 flex items-center gap-2">
                                                                    <Badge variant="destructive">
                                                                        8-2-0-1
                                                                    </Badge>
                                                                </div>
                                                                {/* {item.voteResult ? (
                                                                    <div className="mt-1 flex items-center gap-2">
                                                                        <Badge
                                                                            variant={item.voteResult.result === "Passed" ? "default" : "destructive"}
                                                                        >
                                                                            {item.voteResult.result}
                                                                        </Badge>
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {item.voteResult.yeas}-{item.voteResult.nays}
                                                                        </span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="mt-1 text-muted-foreground">--</div>
                                                                )} */}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden xl:table-cell print:!table-cell ${COLS.action}`}>
                                                            <div className="line-clamp-2">
                                                                {item.actionText}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden xl:table-cell print:!table-cell ${COLS.notes}`}>
                                                            <div className="line-clamp-5">
                                                                {item.bill.crossFileExternalId && (
                                                                    <>
                                                                        <span className="font-sm">
                                                                            X-Filed Bill: {item.bill.crossFileExternalId}
                                                                        </span>
                                                                        <br />
                                                                    </>
                                                                )}

                                                                {item.bill.crossFileExternalId && (
                                                                    <>
                                                                        <span className="font-sm">
                                                                            House Vote: (90-42-1-1)
                                                                        </span>
                                                                        <br />
                                                                    </>
                                                                )}

                                                                Other notes
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                            </div>
                        ))}
                    </div>
                )
            })}
        </>
    )
}