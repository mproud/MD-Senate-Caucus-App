import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CalendarDay } from "@/lib/types"
import { getCommitteeAbbreviation } from "@/lib/utils"

interface CalendarTableProps {
    data: any
}

interface RawCalendarItem {
    id: number
    billNumber: string
    actionText: string | null
    notes: string | null
    committeeId: number | null
    dataSource?: {
        description?: string | null
        disposition?: string | null
    }
}

interface RawCalendar {
    id: number
    calendarType: CalendarType
    calendarNumber: number
    calendarName: string
    committeeId: number | null
    items: RawCalendarItem[]
}

interface VoteResult {
    result: "Passed" | "Failed" | string
    yeas: number
    nays: number
}

export interface GroupedItem {
    id: string
    billNumber: string
    title: string
    committeeName?: string | null
    report?: string | null
    posture?: string | null
    voteResult?: VoteResult | null
}

type CalendarType =
    | "COMMITTEE_REPORT"
    | "THIRD_READING"
    | "SPECIAL_ORDER"
    | "LAID_OVER"
    | string

type ProceedingsGroup =
    | "Committee Reports/Second Reading"
    | "Third Reading"
    | "Special Order"
    | "Laid Over"

// This is the order we want our report to follow
const PROCEEDING_ORDER: ProceedingsGroup[] = [
    "Committee Reports/Second Reading",
    "Third Reading",
    "Special Order",
    "Laid Over",
]

// --- Helpers
function getProceedingsGroup(calendarType: CalendarType): ProceedingsGroup {
    switch (calendarType) {
        case "COMMITTEE_REPORT":
        case "SECOND_READING":
            return "Committee Reports/Second Reading"
        case "THIRD_READING":
            return "Third Reading"
        case "SPECIAL_ORDER":
            return "Special Order"
        case "LAID_OVER":
            return "Laid Over"
        default:
            // Fallback – you can change this if needed
            return "Committee Reports/Second Reading"
    }
}

/**
 * Turn raw calendars JSON into the groupedItems structure used by the UI.
 *
 * - Calendars are sorted by calendarNumber.
 * - Within each group, items appear in the order of their calendars,
 *     then by the item's position/order in that calendar (already in JSON).
 */
export function buildGroupedItems(
    calendars: RawCalendar[]
): Record<ProceedingsGroup, GroupedItem[]> {
    // Initialize in the specific order so Object.entries preserves it
    const grouped: Record<ProceedingsGroup, GroupedItem[]> = PROCEEDING_ORDER.reduce(
        (acc, key) => {
            acc[key] = []
            return acc
        },
        {} as Record<ProceedingsGroup, GroupedItem[]>
    )

    // Sort calendars by calendarNumber
    const sortedCalendars = [...calendars].sort(
        (a, b) => a.calendarNumber - b.calendarNumber
    )

    for (const cal of sortedCalendars) {
        const groupKey = getProceedingsGroup(cal.calendarType)
        const rowsForThisCalendar: GroupedItem[] = cal.items.map((item) => ({
            id: `${cal.id}-${item.id}`,
            billNumber: item.billNumber,
            // Prefer the parsed description fall back to notes
            title: item.dataSource?.description || item.notes || "",
            // You can swap this to use your committee lookup instead
            committeeName: cal.calendarName,
            report: cal.calendarName,
            posture: item.actionText || item.dataSource?.disposition || undefined,
            // No vote info in this JSON yet, so leave null
            voteResult: null,
        }))

        grouped[groupKey].push(...rowsForThisCalendar)
    }

    return grouped
}

export function CalendarTable({ data }: CalendarTableProps) {
    if ( ! data.calendars || data.calendars.length === 0 ) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                        <p className="text-lg font-medium">No items scheduled</p>
                        <p className="mt-2 text-sm">
                            There are no bills on the calendar for {data.chamber} on{" "}
                            {new Date(data.date).toLocaleDateString()}, or no bills match your search query
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const groupedCalendars = buildGroupedItems( data.calendars )

    return (
        <div className="space-y-6">
            {/* {Object.entries( data.calendars ).map(([ index, calendar ]) => (
                <Card key={index}>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>
                                <span className="capitalize">{data.chamber}</span> - {data.section}<br/>
                                {calendar.calendarName}
                            </CardTitle>
                            <Badge variant="outline">
                                {new Date(data.date).toLocaleDateString("en-US", {
                                    weekday: "long",
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                })}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <pre>{JSON.stringify( calendar, null, 2 )}</pre>
                    </CardContent>
                </Card>
            ))} */}

            <pre>{JSON.stringify( groupedCalendars, null, 2)}</pre>

            {/* .filter(([, items]) => items.length > 0) */}

            {/* @TODO fix this - it's any for now... */}
            {Object.entries( data.calendars as Record<string, any> )
                .map(([ index, calendar ]) => (
                    <Card key={index}>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                {index} Replace this with the title @TODO
                                <pre>{JSON.stringify( calendar, null, 2 )}</pre>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]">Bill</TableHead>
                                            <TableHead className="hidden md:table-cell">Sponsor</TableHead>
                                            <TableHead>Title</TableHead>
                                            <TableHead className="hidden md:table-cell">Committee</TableHead>
                                            <TableHead className="hidden lg:table-cell">Vote</TableHead>
                                            <TableHead className="hidden xl:table-cell">Action</TableHead>
                                            <TableHead className="hidden xl:table-cell">Notes</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {calendar.items.map((item: any) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">
                                                    <Link
                                                        href={`/bills/${item.billNumber}`}
                                                        className="text-primary hover:underline"
                                                    >
                                                        {item.billNumber}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="max-w-md">
                                                    {item.bill.sponsorDisplay}
                                                </TableCell>
                                                <TableCell className="max-w-md">
                                                    <div className="line-clamp-2">{item.bill.shortTitle}</div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    {/* If you want to use getCommitteeAbbreviation, swap in your own mapping */}
                                                    {calendar.committee?.abbreviation}
                                                </TableCell>
                                                <TableCell className="hidden xl:table-cell">
                                                    - Show the house vote -<br/>
                                                    {item.voteResult ? (
                                                        <div className="flex items-center gap-2">
                                                            <Badge
                                                                variant={
                                                                    item.voteResult.result === "Passed"
                                                                        ? "default"
                                                                        : "destructive"
                                                                }
                                                            >
                                                                {item.voteResult.result}
                                                            </Badge>
                                                            <span className="text-xs text-muted-foreground">
                                                                {item.voteResult.yeas}-{item.voteResult.nays}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    {item.actionText}
                                                </TableCell>
                                                <TableCell>
                                                    Notes...
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                ))}

        </div>
    )
}

/*
export function legacy__CalendarTable({ data }: CalendarTableProps) {
    if ( ! data.items || data.items.length === 0 ) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                        <p className="text-lg font-medium">No items scheduled</p>
                        <p className="mt-2 text-sm">
                            There are no bills on the calendar for {data.chamber} on{" "}
                            {new Date(data.date).toLocaleDateString()}, or no bills match your search query
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    // Group items by proceedings
    const groupedItems = data.items.reduce(
        (acc, item) => {
            const key = item.proceedings || "Other"
            if (!acc[key]) {
                acc[key] = []
            }
            acc[key].push(item)
            return acc
        },
        {} as Record<string, typeof data.items>,
    )

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>
                            {data.chamber} - {data.section}
                        </CardTitle>
                        <Badge variant="outline">
                            {new Date(data.date).toLocaleDateString("en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </Badge>
                    </div>
                </CardHeader>
            </Card>

            {Object.entries(groupedItems).map(([proceedings, items]) => (
                <Card key={proceedings}>
                    <CardHeader>
                        <CardTitle className="text-lg">{proceedings}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[100px]">Bill</TableHead>
                                        <TableHead>Title</TableHead>
                                        <TableHead className="hidden md:table-cell">Committee/Report</TableHead>
                                        <TableHead className="hidden lg:table-cell">Posture</TableHead>
                                        <TableHead className="hidden xl:table-cell">Vote Result</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                <Link href={`/bills/${item.billNumber}`} className="text-primary hover:underline">
                                                    {item.billNumber}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="max-w-md">
                                                <div className="line-clamp-2">{item.title}</div>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                {item.committee ? getCommitteeAbbreviation(item.committee) : item.report ? item.report : "—"}
                                            </TableCell>
                                            <TableCell className="hidden lg:table-cell">
                                                {item.posture ? <Badge variant="secondary">{item.posture}</Badge> : "—"}
                                            </TableCell>
                                            <TableCell className="hidden xl:table-cell">
                                                {item.voteResult ? (
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant={item.voteResult.result === "Passed" ? "default" : "destructive"}>
                                                            {item.voteResult.result}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {item.voteResult.yeas}-{item.voteResult.nays}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    "—"
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
*/