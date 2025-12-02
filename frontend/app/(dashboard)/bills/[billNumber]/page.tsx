import { Suspense } from "react"
import { BillHeader } from "@/components/bill-header"
import { NotesPanel } from "@/components/notes-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApi } from "@/lib/api"
import type { Bill, Note } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { VoteForm } from "@/components/vote-form"

interface BillPageProps {
    params: Promise<{
        billNumber: string
    }>
}

async function BillContent({ billNumber }: { billNumber: string }) {
    try {
        const bill = await fetchApi<Bill>(`/api/bills/${billNumber}`, {
            cache: "no-store",
        })

        const notes = await fetchApi<Note[]>(`/api/bills/${billNumber}/notes`, {
            cache: "no-store",
        })

        return (
            <>
                <BillHeader bill={bill} />

                <Tabs defaultValue="overview" className="mt-6">
                    <TabsList className="grid w-full max-w-2xl grid-cols-4">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                        <TabsTrigger value="votes">Votes</TabsTrigger>
                        <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Bill Information</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <dt className="text-sm font-medium text-muted-foreground">Bill Number</dt>
                                        <dd className="mt-1 text-sm">{bill.billNumber}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-sm font-medium text-muted-foreground">Chamber</dt>
                                        <dd className="mt-1 text-sm">{bill.chamber}</dd>
                                    </div>
                                    {bill.sponsor && (
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Sponsor</dt>
                                            <dd className="mt-1 text-sm">{bill.sponsor}</dd>
                                        </div>
                                    )}
                                    {bill.crossfile && (
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Crossfile</dt>
                                            <dd className="mt-1 text-sm">{bill.crossfile}</dd>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Status</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {bill.latestStatus && (
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Latest Status</dt>
                                            <dd className="mt-1 text-sm">{bill.latestStatus}</dd>
                                        </div>
                                    )}
                                    {bill.latestAgenda && (
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Latest Agenda</dt>
                                            <dd className="mt-1 text-sm">{bill.latestAgenda}</dd>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {bill.synopsis && (
                            <Card className="mt-6">
                                <CardHeader>
                                    <CardTitle>Synopsis</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm leading-relaxed">{bill.synopsis}</p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="history" className="mt-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Bill History</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {bill.history && bill.history.length > 0 ? (
                                    <div className="space-y-4">
                                        {bill.history.map((event, index) => (
                                            <div key={event.id} className="flex gap-4">
                                                <div className="flex flex-col items-center">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                                                        {bill.history!.length - index}
                                                    </div>
                                                    {index < bill.history!.length - 1 && <div className="w-px flex-1 bg-border mt-2" />}
                                                </div>
                                                <div className="flex-1 pb-8">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-medium">{event.action}</p>
                                                        <Badge variant="outline" className="text-xs">
                                                            {event.chamber}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mb-1">
                                                        {new Date(event.date).toLocaleDateString("en-US", {
                                                            year: "numeric",
                                                            month: "long",
                                                            day: "numeric",
                                                        })}
                                                    </p>
                                                    {event.details && <p className="text-sm leading-relaxed mt-2">{event.details}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-8">No history available for this bill</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="votes" className="mt-6">
                        <div className="space-y-6">
                            {/* Committee Votes */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>Committee Votes</CardTitle>
                                    <VoteForm billNumber={billNumber} voteType="committee" />
                                </CardHeader>
                                <CardContent>
                                    {bill.committeeVotes && bill.committeeVotes.length > 0 ? (
                                        <div className="space-y-6">
                                            {bill.committeeVotes.map((vote) => (
                                                <div key={vote.id} className="border-b last:border-0 pb-6 last:pb-0">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div>
                                                            <p className="font-medium">{vote.committee}</p>
                                                            <p className="text-sm text-muted-foreground">
                                                                {new Date(vote.date).toLocaleDateString("en-US", {
                                                                    year: "numeric",
                                                                    month: "long",
                                                                    day: "numeric",
                                                                })}
                                                            </p>
                                                        </div>
                                                        <Badge
                                                            variant={
                                                                vote.result === "Favorable" || vote.result === "Favorable with Amendments"
                                                                    ? "default"
                                                                    : "destructive"
                                                            }
                                                        >
                                                            {vote.result}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex gap-6 mb-3">
                                                        <div>
                                                            <span className="text-sm font-medium">Yeas: </span>
                                                            <span className="text-sm text-green-600 dark:text-green-400">{vote.yeas}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium">Nays: </span>
                                                            <span className="text-sm text-red-600 dark:text-red-400">{vote.nays}</span>
                                                        </div>
                                                        {vote.absent !== undefined && (
                                                            <div>
                                                                <span className="text-sm font-medium">Absent: </span>
                                                                <span className="text-sm text-muted-foreground">{vote.absent}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {vote.details && <p className="text-sm leading-relaxed">{vote.details}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-8">
                                            No committee votes recorded for this bill
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Floor Votes */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>Floor Votes</CardTitle>
                                    <VoteForm billNumber={billNumber} voteType="floor" />
                                </CardHeader>
                                <CardContent>
                                    {bill.floorVotes && bill.floorVotes.length > 0 ? (
                                        <div className="space-y-6">
                                            {bill.floorVotes.map((vote) => (
                                                <div key={vote.id} className="border-b last:border-0 pb-6 last:pb-0">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div>
                                                            <p className="font-medium">
                                                                {vote.chamber} - {vote.voteType}
                                                            </p>
                                                            <p className="text-sm text-muted-foreground">
                                                                {new Date(vote.date).toLocaleDateString("en-US", {
                                                                    year: "numeric",
                                                                    month: "long",
                                                                    day: "numeric",
                                                                })}
                                                            </p>
                                                        </div>
                                                        <Badge variant={vote.result === "Passed" ? "default" : "destructive"}>{vote.result}</Badge>
                                                    </div>
                                                    <div className="flex gap-6">
                                                        <div>
                                                            <span className="text-sm font-medium">Yeas: </span>
                                                            <span className="text-sm text-green-600 dark:text-green-400">{vote.yeas}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium">Nays: </span>
                                                            <span className="text-sm text-red-600 dark:text-red-400">{vote.nays}</span>
                                                        </div>
                                                        {vote.absent !== undefined && (
                                                            <div>
                                                                <span className="text-sm font-medium">Absent: </span>
                                                                <span className="text-sm text-muted-foreground">{vote.absent}</span>
                                                            </div>
                                                        )}
                                                        {vote.notVoting !== undefined && (
                                                            <div>
                                                                <span className="text-sm font-medium">Not Voting: </span>
                                                                <span className="text-sm text-muted-foreground">{vote.notVoting}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-8">
                                            No floor votes recorded for this bill
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="notes" className="mt-6">
                        <NotesPanel billNumber={billNumber} initialNotes={notes} />
                    </TabsContent>
                </Tabs>
            </>
        )
    } catch (error) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                        <p className="text-lg font-medium">Unable to load bill details</p>
                        <p className="mt-2 text-sm">{error instanceof Error ? error.message : "Please try again later"}</p>
                    </div>
                </CardContent>
            </Card>
        )
    }
}

function BillSkeleton() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
            </Card>
            <Skeleton className="h-64 w-full" />
        </div>
    )
}

export default async function BillPage({ params }: BillPageProps) {
    const { billNumber } = await params

    return (
        <>
            <Suspense fallback={<BillSkeleton />}>
                <BillContent billNumber={billNumber} />
            </Suspense>
        </>
    )
}
