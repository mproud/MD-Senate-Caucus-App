import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, FileText } from "lucide-react"
import { fetchApi } from "@/lib/api"
import { Committee } from "@prisma/client"

interface BillsSearchResultsProps {
    activeSessionCode: string
    query: string
    chamber: string
    committee: string
    sponsor: string
    subject: string
    status: string
    page: number
}

type BroadSubjects = {
    Code: string
    Name: string
}

interface SearchResult {
    billNumber: string
    shortTitle: string
    chamber: string
    sponsorDisplay: string
    currentCommittee: {
        committee: Committee
    }
    status?: string //
    statusDesc: string
    synopsis?: string
    dataSource: {
        BroadSubjects?: BroadSubjects[]
    }
    crossfile?: string | null
}

interface SearchResponse {
    bills: SearchResult[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}

export async function BillsSearchResults({
    activeSessionCode,
    query,
    chamber,
    committee,
    sponsor,
    subject,
    status,
    page,
}: BillsSearchResultsProps) {
    const params = new URLSearchParams()
    if (query) params.set("q", query)
    if (chamber) params.set("chamber", chamber)
    if (committee) params.set("committee", committee)
    if (sponsor) params.set("sponsor", sponsor)
    if (subject) params.set("subject", subject)
    if (status) params.set("status", status)
    params.set("page", String(page))
    params.set("pageSize", "20")

    let data: SearchResponse
    try {
        data = await fetchApi<SearchResponse>(`/api/bills?${params.toString()}`, {
            cache: "no-store",
        })
    } catch (error) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                        <p className="text-lg font-medium">Unable to search bills</p>
                        <p className="mt-2 text-sm">{error instanceof Error ? error.message : "Please try again later"}</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const { bills, total, totalPages } = data

    const buildPageUrl = (newPage: number) => {
        const params = new URLSearchParams()
        if (query) params.set("q", query)
        if (chamber) params.set("chamber", chamber)
        if (committee) params.set("committee", committee)
        if (sponsor) params.set("sponsor", sponsor)
        if (subject) params.set("subject", subject)
        if (status) params.set("status", status)
        params.set("page", String(newPage))
        return `/bills?${params.toString()}`
    }

    if (bills.length === 0) {
        return (
            <Card>
                <CardContent className="py-12">
                    <div className="text-center text-muted-foreground">
                        <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">No bills found</p>
                        <p className="mt-2 text-sm">Try adjusting your search filters</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total} bills
                </p>
            </div>

            <div className="space-y-3">
                {bills.map((bill) => (
                    <Card key={bill.billNumber} className="hover:bg-muted/50 transition-colors">
                        <CardContent className="py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    {/* <div><code><pre>{JSON.stringify(bill, null, 2)}</pre></code></div> */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Link href={`/bills/${bill.billNumber}`} className="font-semibold text-primary hover:underline">
                                            {bill.billNumber}
                                        </Link>
                                        <Badge variant="outline">{bill.chamber}</Badge>
                                        <Badge
                                            variant={
                                                bill.statusDesc === "Passed" || bill.statusDesc === "Third Reading"
                                                    ? "default"
                                                    : bill.statusDesc === "Failed"
                                                        ? "destructive"
                                                        : "secondary"
                                            }
                                        >
                                            {bill.statusDesc}
                                        </Badge>
                                        {bill.crossfile && (
                                            <Link href={`/bills/${bill.crossfile}`}>
                                                <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                                                    Crossfile: {bill.crossfile}
                                                </Badge>
                                            </Link>
                                        )}
                                    </div>
                                    <h3 className="mt-1 font-medium line-clamp-2">{bill.shortTitle}</h3>
                                    {bill.synopsis && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{bill.synopsis}</p>}
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <span>
                                            <span className="font-medium">Primary Sponsor:</span> {bill.sponsorDisplay}
                                        </span>
                                        <span>
                                            <span className="font-medium">Committee:</span> {bill.currentCommittee.committee.name.replace("Committee", "").trim()}
                                        </span>
                                    </div>
                                    {bill.dataSource.BroadSubjects && bill.dataSource.BroadSubjects.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {bill.dataSource.BroadSubjects.slice(0, 5).map((s) => (
                                                <Badge key={s.Code} variant="secondary" className="text-xs">
                                                    {s.Name}
                                                </Badge>
                                            ))}
                                            {bill.dataSource.BroadSubjects.length > 5 && (
                                                <Badge variant="secondary" className="text-xs">
                                                    +{bill.dataSource.BroadSubjects.length - 5} more
                                                </Badge>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
                        {page > 1 ? (
                            <Link href={buildPageUrl(page - 1)}>
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Previous
                            </Link>
                        ) : (
                            <>
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Previous
                            </>
                        )}
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">
                        Page {page} of {totalPages}
                    </span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
                        {page < totalPages ? (
                            <Link href={buildPageUrl(page + 1)}>
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Link>
                        ) : (
                            <>
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                        )}
                    </Button>
                </div>
            )}
        </div>
    )
}
