import type { CalendarDay } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { AlertCircle } from "lucide-react"

type CalendarType =
    | "FIRST_READING"
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

// Helpers to pick and format committee votes from billEvents
type VoteCounts = {
    yesVotes?: number | null
    noVotes?: number | null
    abstain?: number | null
    excused?: number | null
    absent?: number | null
    notVoting?: number | null
}

type CommitteeVoteEvent = {
    id?: number | string
    type?: string | null
    eventType?: string | null
    committeeId?: number | string | null
    source?: "MGA" | "MANUAL" | string | null

    // common count field names (support multiple)
    yesVotes?: number | null
    noVotes?: number | null
    abstain?: number | null
    abstains?: number | null
    excused?: number | null
    absent?: number | null
    notVoting?: number | null

    voteCounts?: VoteCounts | null // if you store nested counts
    result?: string | null
    motion?: string | null
    details?: string | null
    date?: string | Date | null
}

type BillVote = {
    billActionId: number | string
    vote?: string | null
    legislator?: {
        party?: Party | null
    } | null
}

function toInt(n: unknown): number | null {
    if (typeof n === "number" && Number.isFinite(n)) return n
    if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n)
    return null
}

function extractCounts(e: CommitteeVoteEvent | null | undefined): Required<VoteCounts> {
    const vc = (e?.voteCounts ?? {}) as VoteCounts

    const yesVotes = toInt(e?.yesVotes ?? vc.yesVotes) ?? 0
    const noVotes = toInt(e?.noVotes ?? vc.noVotes) ?? 0
    const abstain = toInt(e?.abstain ?? (e as any)?.abstains ?? vc.abstain) ?? 0
    const excused = toInt(e?.excused ?? vc.excused) ?? 0
    const absent = toInt(e?.absent ?? vc.absent) ?? 0
    const notVoting = toInt(e?.notVoting ?? vc.notVoting) ?? 0

    return { yesVotes, noVotes, abstain, excused, absent, notVoting }
}

function hasAnyCounts(counts: VoteCounts): boolean {
    return (
        (counts.yesVotes ?? 0) > 0 ||
        (counts.noVotes ?? 0) > 0 ||
        (counts.abstain ?? 0) > 0 ||
        (counts.excused ?? 0) > 0 ||
        (counts.absent ?? 0) > 0 ||
        (counts.notVoting ?? 0) > 0
    )
}

function looksLikeCommitteeVote(e: CommitteeVoteEvent): boolean {
    // @TODO this isn't working as neatly as I had hoped.
    // Some events aren't logged as committee votes, or they're in the "events" not "actions"
    return true

    // const t = (e.type ?? e.eventType ?? "").toString().toUpperCase()
    // // adjust this to the actual BillEventType(s)
    // return t.includes("COMMITTEE") && (t.includes("VOTE") || t.includes("ACTION"))
}


// >>>>>>>>>>>>> this needs to use billActions, not billEvents

function pickCommitteeVoteForCommittee(args: {
    billNumber: string
    billActions: CommitteeVoteEvent[]
    committeeId: number | string | null | undefined
}): {
    action: CommitteeVoteEvent | null
    counts: Required<VoteCounts> | null
    source: "MGA_SCRAPE" | "MANUAL" | string | null
    usedManualCountsToFillMGA: boolean
    manualEvent: CommitteeVoteEvent | null
} {
    const { billNumber, billActions, committeeId } = args
    // console.log('----- Pick committe vote', billNumber, committeeId, { billActions } )
    if (!committeeId) {
        return {
            action: null,
            counts: null,
            source: null,
            usedManualCountsToFillMGA: false,
            manualEvent: null,
        }
    }

    const relevant = (billActions ?? []).filter((e) => {
        const sameCommittee = String(e.committeeId ?? "") === String(committeeId)
        return sameCommittee && looksLikeCommitteeVote(e)
    })

    if (relevant.length === 0) {
        return {
            action: null,
            counts: null,
            source: null,
            usedManualCountsToFillMGA: false,
            manualEvent: null,
        }
    }

    const mga = relevant.filter((e) => (e.source ?? "").toString().toUpperCase() === "MGA_SCRAPE")
    const manual = relevant.filter((e) => (e.source ?? "").toString().toUpperCase() === "MANUAL")

    // console.log( billNumber, { relevant, mga, manual })

    const bestManual = manual[0] ?? null
    const bestMga = mga[0] ?? null

    const mgaCounts = bestMga ? extractCounts(bestMga) : null
    const manualCounts = bestManual ? extractCounts(bestManual) : null

    const mgaHasCounts = mgaCounts ? hasAnyCounts(mgaCounts) : false
    const manualHasCounts = manualCounts ? hasAnyCounts(manualCounts) : false

    // Prefer MGA *if* it has counts
    if (bestMga && mgaHasCounts) {
        return {
            action: bestMga,
            counts: mgaCounts!,
            source: bestMga.source ?? "MGA_SCRAPE",
            usedManualCountsToFillMGA: false,
            manualEvent: bestManual,
        }
    }

    // MGA exists but has no counts -> fill counts from manual if possible
    if (bestMga && !mgaHasCounts && bestManual && manualHasCounts) {
        return {
            action: bestMga,
            counts: manualCounts!,
            source: bestMga.source ?? "MGA",
            usedManualCountsToFillMGA: true,
            manualEvent: bestManual,
        }
    }

    // Otherwise fall back to manual (even if it's also empty, at least you can show motion/result)
    if (bestManual) {
        return {
            action: bestManual,
            counts: manualCounts ?? extractCounts(bestManual),
            source: bestManual.source ?? "MANUAL",
            usedManualCountsToFillMGA: false,
            manualEvent: bestManual,
        }
    }

    // Last resort: MGA (no counts)
    return {
        action: bestMga,
        counts: mgaCounts ?? (bestMga ? extractCounts(bestMga) : null),
        source: bestMga?.source ?? "MGA",
        usedManualCountsToFillMGA: false,
        manualEvent: bestManual,
    }
}

function formatCountsShort(counts: Required<VoteCounts> | null): string {
    if (!counts) return "--"
    // short common display
    return `${counts.yesVotes}-${counts.noVotes}`
}

function formatCountsBreakdown(counts: Required<VoteCounts> | null): string | null {
    if (!counts) return null
    // full breakdown like 8-2-0-1 (yea-nay-abstain-absent) + optionally excused/notVoting if you want
    const core = `${counts.yesVotes}-${counts.noVotes}` // -${counts.abstain}-${counts.absent}`
    // const extras =
    //     counts.excused > 0 || counts.notVoting > 0
    //         ? ` (E:${counts.excused} NV:${counts.notVoting})`
    //         : ""
    // return core + extras
    return core // @TODO add absent, excused, etc
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
        { title: "First Reading Calendar", match: (t) => t === "FIRST_READING" },
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

// @TODO these need to be responsive
const COLS = {
    flag: "w-[28px]",
    bill: "w-[92px]",
    sponsor: "w-[100px] lg:w-[140px] print:w-[100px]",
    title: "w-[350px] lg:w-[520px] print:w-[250px]",
    committee: "w-[90px] lg:w-[160px]",
    vote: "w-[100px]",
    action: "w-[100px] lg:w-[180px]",
    notes: "w-[260px]",
} as const

const cellBase = "align-top whitespace-normal"

type Party = "Democrat" | "Republican"

type ActionVote = {
    vote?: string | null
    legislator?: {
        party?: Party | null
    } | null
}

type CommitteeActionWithVotes = {
    votes?: ActionVote[] | null
}

const normalizeVote = (v: string | null | undefined) => (v ?? "").trim().toUpperCase()

const normalizeYeaNay = (v: string | null | undefined): "YEA" | "NAY" | null => {
    const val = normalizeVote(v)

    if (val === "YEA" || val === "AYE" || val === "YES" || val === "Y") {
        return "YEA"
    }

    if (val === "NAY" || val === "NO" || val === "N") {
        return "NAY"
    }

    return null
}

function getCommitteePartyLineLabel( input: CommitteeActionWithVotes | ActionVote[] | null | undefined ): "Unanimous" | "Party Line" | "Party Split" | null {
    const votes = Array.isArray(input) ? input : (input?.votes ?? [])

    const considered = votes.filter((v): v is ActionVote => {
        if (!v) return false

        const val = normalizeYeaNay(v.vote)
        const party = v.legislator?.party ?? null

        return val !== null && (party === "Democrat" || party === "Republican")
    })

    if (considered.length === 0) {
        return null
    }

    let totalYea = 0
    let totalNay = 0
    let dYea = 0
    let dNay = 0
    let rYea = 0
    let rNay = 0

    for (const v of considered) {
        const val = normalizeYeaNay(v.vote)
        const party = v.legislator?.party ?? null

        if (val === "YEA") {
            totalYea += 1
            if (party === "Democrat") dYea += 1
            if (party === "Republican") rYea += 1
        }

        if (val === "NAY") {
            totalNay += 1
            if (party === "Democrat") dNay += 1
            if (party === "Republican") rNay += 1
        }
    }

    if (totalYea > 0 && totalNay === 0) {
        return "Unanimous"
    }

    const dTotal = dYea + dNay
    const rTotal = rYea + rNay

    const isPartyLine_DYea_RNay =
        dTotal > 0 &&
        rTotal > 0 &&
        dYea === dTotal &&
        rNay === rTotal

    const isPartyLine_DNay_RYea =
        dTotal > 0 &&
        rTotal > 0 &&
        dNay === dTotal &&
        rYea === rTotal

    if (isPartyLine_DYea_RNay || isPartyLine_DNay_RYea) {
        return "Party Line"
    }

    return "Party Split"
}

function renderPartyLineBadge(label: "Unanimous" | "Party Line" | "Party Split" | null) {
    if (!label) return null

    if (label === "Unanimous") {
        return (
            <Badge variant="secondary" className="mt-1 inline-flex items-center gap-1">
                <span>Unanimous</span>
            </Badge>
        )
    }

    if (label === "Party Line") {
        return (
            <Badge variant="destructive" className="mt-1 inline-flex items-center gap-1">
                <span className="font-bold">!!</span>
                <span>Party line</span>
            </Badge>
        )
    }

    return (
        <Badge variant="destructive" className="mt-1 inline-flex items-center gap-1">
            <span className="font-bold">!!</span>
            <span>Party split</span>
        </Badge>
    )
}

export async function CalendarReport({ calendarData }: { calendarData: CalendarDay }) {
    // Show the filter by date, checkbox to show all bills or split votes only, show alert bills

    // @TODO fix this eventually. Need central/correct type decs
    const rawCalendars = ((calendarData as any).calendars ?? []) as FloorCalendar[]
    const calendars = organizeFloorCalendars(rawCalendars)

    // Need to find -- Second Reading, find vote with Committee ID. Prefer official if there are numbers, or unofficial if there aren't any numbers
    //                 Match house votes if this bill was in the house OR if it has a crossfile with motion
    
    // return <code><pre>{JSON.stringify(rawCalendars, null, 2)}</pre></code>

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
                                    "First Reading Calendar": "FIRST_READING",
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
                                                    className="text-md text-left border-0 border-t-2 border-b-2 border-black"
                                                >
                                                    <span className="font-semibold">{group.heading}</span>
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
                                                // pull billEvents + current committee id for this row/section
                                                // const billEvents = (item.bill?.events ?? []) as CommitteeVoteEvent[]
                                                const billActions = (item.bill?.actions ?? [])
                                                const currentCommitteeId = item.committeeId ?? item.committee?.id ?? null

                                                // console.log('>>>> item', { currentCommitteeId, committeeId: item.committeeId })
                                                // console.log('>>> item', item.billNumber, { billActions, item })

                                                const committeeVote = pickCommitteeVoteForCommittee({
                                                    billNumber: item.billNumber,
                                                    billActions,
                                                    committeeId: currentCommitteeId,
                                                })

                                                const actionId = committeeVote.action?.id ?? null

                                                const votes = (item.bill?.votes ?? []) as BillVote[]

                                                const committeeVotesForAction =
                                                    actionId != null
                                                        ? votes.filter((v: BillVote) => String(v.billActionId) === String(actionId))
                                                        : []

                                                const partyLineLabel = getCommitteePartyLineLabel(committeeVotesForAction)

                                                const isFlagged = Boolean(item.bill?.isFlagged)

                                                if ( ! item.bill ) return

                                                return (
                                                    <TableRow key={item.id} className={isFlagged ? "bg-yellow-100 hover:bg-yellow-200" : ""}>
                                                        {/* <TableCell>
                                                            <pre>{JSON.stringify(item.bill, null, 2)}</pre>
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
                                                            {/* { item.committee?.abbreviation && item.committee.abbreviation } */}
                                                            { item.bill.currentCommittee ? (
                                                                <>{item.bill.currentCommittee.committee.abbreviation}</>
                                                            ): (
                                                                <>---</>
                                                            )}
                                                        </TableCell>

                                                        {/* <TableCell className={`${cellBase} hidden lg:table-cell print:!table-cell ${COLS.vote}`}>
                                                            <div className="text-sm">
                                                                11-0
                                                                <div className="mt-1 flex items-center gap-2">
                                                                    <Badge variant="destructive">
                                                                        8-2-0-1
                                                                    </Badge>
                                                                </div>
                                                                --- {item.voteResult ? (
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
                                                                )} ---
                                                            </div>
                                                        </TableCell> */}

                                                        <TableCell className={`${cellBase} hidden lg:table-cell print:!table-cell ${COLS.vote}`}>
                                                            <div className="text-sm">
                                                                {committeeVote.action ? (
                                                                    <>
                                                                        {/* <div className="flex items-center gap-2">
                                                                            <span className="font-medium">
                                                                                {formatCountsShort(committeeVote.counts)}
                                                                            </span>

                                                                            <Badge variant={String(committeeVote.source).toUpperCase() === "MGA" ? "default" : "destructive"}>
                                                                                {String(committeeVote.source ?? "--").toUpperCase()}
                                                                                {committeeVote.usedManualCountsToFillMGA ? " (counts from manual)" : ""}
                                                                            </Badge>
                                                                        </div> */}

                                                                        {/* breakdown line (optional) */}
                                                                        {committeeVote.counts && hasAnyCounts(committeeVote.counts) ? (
                                                                            <div>
                                                                                {formatCountsBreakdown(committeeVote.counts)}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="mt-1 text-xs text-muted-foreground">No recorded counts</div>
                                                                        )}

                                                                        {/* Optional: show motion/result if I can grab it? @TODO ---
                                                                        {(committeeVote.action.motion || committeeVote.action.result) && (
                                                                            <div className="mt-1 text-xs">
                                                                                {committeeVote.action.motion ?? committeeVote.action.result}
                                                                            </div>
                                                                        )}*/}
                                                                    </>
                                                                ) : (
                                                                    <div className="text-muted-foreground">---</div>
                                                                )}

                                                                {partyLineLabel && (
                                                                    <>
                                                                        {/* <span className="text-xs">
                                                                            {partyLineLabel}
                                                                        </span>
                                                                        <br /> */}
                                                                        {renderPartyLineBadge(partyLineLabel)}
                                                                    </>
                                                                )}
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
                                                                        {/* @TODO - get the house vote if there is one */}
                                                                        {/* <span className="font-sm">
                                                                            House Vote: (90-42-1-1)
                                                                        </span>
                                                                        <br /> */}
                                                                    </>
                                                                )}

                                                                <div>
                                                                    {item.bill.notes
                                                                        .slice()
                                                                        .filter((note: any) => note.visibility !== "HIDDEN")
                                                                        // Pinned notes first, then unpinned
                                                                        .sort((a: any, b: any) => {
                                                                            const aPinned = a.visibility === "PINNED"
                                                                            const bPinned = b.visibility === "PINNED"

                                                                            if (aPinned !== bPinned) return aPinned ? -1 : 1

                                                                            // Within each group, most recent first
                                                                            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                                                                        })
                                                                        .map((note: any) => (
                                                                            <p key={note.id}>{note.content}</p>
                                                                        ))
                                                                    }
                                                                </div>
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