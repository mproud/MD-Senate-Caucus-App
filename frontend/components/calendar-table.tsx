import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CalendarDay } from "@/lib/types"
import { getCommitteeAbbreviation } from "@/lib/utils"

interface CalendarTableProps {
    data: CalendarDay
}

export function CalendarTable({ data }: CalendarTableProps) {
    if ( ! data.items || data.items.length === 0 ) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                        <p className="text-lg font-medium">No items scheduled</p>
                        <p className="mt-2 text-sm">
                            There are no bills on the {data.section} calendar for {data.chamber} on{" "}
                            {new Date(data.date).toLocaleDateString()}
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
