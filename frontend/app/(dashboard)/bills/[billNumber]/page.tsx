import { Suspense } from "react"
import { BillHeader } from "@/components/bill-header"
import { NotesPanel } from "@/components/notes-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApi } from "@/lib/api"
import { Bill } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { VoteForm } from "@/components/vote-form"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { VotesPanel } from "@/components/votes-panel"
import { ExternalLink } from "lucide-react"
import { VoteBreakdownModal } from "@/components/vote-breakdown-modal"

interface BillPageProps {
    params: Promise<{
        billNumber: string
    }>
    searchParams: Promise<{
        activeTab?: string
    }>
}

// This isnt' going to work... @TODO
type BillExtended = Bill & {
    notes?: any
    currentCommittee: {
        committee: {
            name: string
        }
    }
    events?: any[]
    committeeVotes: []
    dataSource?: {
        CommitteePrimaryOrigin: string
        CommitteePrimaryOpposite: string
    }
    actions?: any[]
}

type Party = "Democrat" | "Republican"

type ActionVote = {
    vote: string
    legislator?: {
        party?: Party | null
    } | null
}

type StrictPartyLineResult =
    | {
          kind: "UNANIMOUS_FOR"
      }
    | {
          kind: "PARTY_LINE"
          direction: "D_YEA_R_NAY" | "D_NAY_R_YEA"
      }
    | {
          kind: "SPLIT"
          direction: "D_YEA_R_NAY" | "D_NAY_R_YEA"
          defectors: number
      }
    | {
          kind: "NOT_PARTY_LINE"
      }

const normalizeVote = (v: string | null | undefined) => (v ?? "").trim().toUpperCase()

const computeStrictPartyLine = (votes: ActionVote[] | null | undefined): StrictPartyLineResult => {
    const yea = new Set<number>()
    const nay = new Set<number>()

    let totalYea = 0
    let totalNay = 0

    let dYea = 0
    let dNay = 0
    let rYea = 0
    let rNay = 0

    for (const v of votes ?? []) {
        const val = normalizeVote(v.vote)
        const party = v.legislator?.party ?? null

        if (val !== "YEA" && val !== "NAY") {
            continue
        }

        if (val === "YEA") {
            totalYea += 1
        } else {
            totalNay += 1
        }

        if (party !== "Democrat" && party !== "Republican") {
            continue
        }

        if (party === "Democrat") {
            if (val === "YEA") {
                dYea += 1
            } else {
                dNay += 1
            }
        } else {
            if (val === "YEA") {
                rYea += 1
            } else {
                rNay += 1
            }
        }
    }

    const totalConsidered = totalYea + totalNay
    if (totalConsidered === 0) {
        return { kind: "NOT_PARTY_LINE" }
    }

    // Unanimous (All members for): all considered votes are YEA
    if (totalNay === 0) {
        return { kind: "UNANIMOUS_FOR" }
    }

    const dTotal = dYea + dNay
    const rTotal = rYea + rNay

    // Need both parties represented to call something "Party Line" or "Split"
    if (dTotal === 0 || rTotal === 0) {
        return { kind: "NOT_PARTY_LINE" }
    }

    const isPartyLine_DYea_RNay = dYea === dTotal && rNay === rTotal
    const isPartyLine_DNay_RYea = dNay === dTotal && rYea === rTotal

    if (isPartyLine_DYea_RNay) {
        return { kind: "PARTY_LINE", direction: "D_YEA_R_NAY" }
    }

    if (isPartyLine_DNay_RYea) {
        return { kind: "PARTY_LINE", direction: "D_NAY_R_YEA" }
    }

    // Split (All D-1 / All R): exactly 1 defector from an otherwise party-line alignment
    // Direction 1 target: D all YEA, R all NAY, allow one defector from either party
    const defectors_DYea_RNay = (dTotal - dYea) + (rTotal - rNay)
    if (defectors_DYea_RNay === 1) {
        return { kind: "SPLIT", direction: "D_YEA_R_NAY", defectors: 1 }
    }

    // Direction 2 target: D all NAY, R all YEA, allow one defector from either party
    const defectors_DNay_RYea = (dTotal - dNay) + (rTotal - rYea)
    if (defectors_DNay_RYea === 1) {
        return { kind: "SPLIT", direction: "D_NAY_R_YEA", defectors: 1 }
    }

    return { kind: "NOT_PARTY_LINE" }
}

const strictPartyLineLabel = (r: StrictPartyLineResult) => {
    if (r.kind === "UNANIMOUS_FOR") {
        return "Unanimous"
    }

    if (r.kind === "PARTY_LINE") {
        return "Party Line"
    }

    if (r.kind === "SPLIT") {
        return "Party Split"
    }

    return "Not party line"
}

const hasPartyVotes = (votes: ActionVote[] | null | undefined) => {
    return (votes ?? []).some(
        (v) =>
            (v.vote === "YEA" || v.vote === "NAY") &&
            (v.legislator?.party === "Democrat" || v.legislator?.party === "Republican")
    )
}

function formatReading( kind: string ) {
    switch (kind) {
        case "FIRST":
            return "First Reading";
        case "SECOND":
            return "Second Reading";
        case "THIRD":
            return "Third Reading";
        default:
            return ""; // fallback if kind is missing or unrecognized
    }
}

async function BillContent({ billNumber, activeTab }: { billNumber: string, activeTab?: string }) {
    try {
        const bill = await fetchApi<BillExtended>(`/api/bills/${billNumber}`, {
            cache: "no-store",
        })

        const committeeActions =
            (bill.actions ?? []).filter((action) => action.actionCode === "COMMITTEE_VOTE" || action.actionCode === "COMMITEE_VOTE")

        const floorActions =
            (bill.actions ?? []).filter(
                (action) =>
                    (action.actionCode === null && action.isVote === true) ||
                    action.actionCode === "FLOOR_VOTE"
            )

        // Notes are included in the now massive bill query...
        // const notes = await fetchApi<Note[]>(`/api/bills/${billNumber}/notes`, {
        //     cache: "no-store",
        // })

        return (
            <>
                <BillHeader bill={bill} />

                <Tabs defaultValue={activeTab ?? "overview"} className="mt-6">
                    <TabsList className="grid w-full max-w-2xl grid-cols-5">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                        <TabsTrigger value="votes">Votes</TabsTrigger>
                        <TabsTrigger value="notes">Notes ({bill.notes.length})</TabsTrigger>
                        <TabsTrigger value="raw-data">Raw Data</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Bill Information</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <dt className="text-sm font-medium text-muted-foreground">Primary Sponsor</dt>
                                        <dd className="mt-1 text-sm">{bill.billNumber}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-sm font-medium text-muted-foreground">Additional Sponsors</dt>
                                        <dd className="mt-1 text-sm">{bill.chamber}</dd>
                                    </div>
                                    {bill.crossFileExternalId && (
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Crossfile</dt>
                                            <dd className="mt-1 text-sm">
                                                <a href={`/bills/${bill.crossFileExternalId}`} className="text-primary hover:underline">
                                                    {bill.crossFileExternalId}
                                                </a>
                                            </dd>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Current Status</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {bill.currentCommittee && (
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Current Committee</dt>
                                            <dd className="mt-1 text-sm">{bill.currentCommittee.committee.name.replace("Committee", "").trim()}</dd>
                                        </div>
                                    )}
                                    {bill.dataSource?.CommitteePrimaryOrigin && (
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">House of Origin Committee</dt>
                                            <dd className="mt-1 text-sm">{bill.dataSource.CommitteePrimaryOrigin}</dd>
                                        </div>
                                    )}
                                    {bill.dataSource?.CommitteePrimaryOpposite && (
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Opposite House Committee</dt>
                                            <dd className="mt-1 text-sm">{bill.dataSource.CommitteePrimaryOpposite}</dd>
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
                                {bill.events && bill.events.length > 0 ? (
                                    <div className="space-y-4">
                                        {bill.events
                                            .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
                                            .map((event, index) => (
                                                <div key={event.id} className="flex gap-4">
                                                    <div className="flex flex-col items-center">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                                                            {index + 1}
                                                        </div>
                                                        {index < bill.events!.length - 1 && <div className="w-px flex-1 bg-border mt-2" />}
                                                    </div>
                                                    <div className="flex-1 pb-8">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-medium">{event.summary}</p>
                                                            <Badge variant="outline" className="text-xs">
                                                                {event.chamber}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mb-1">
                                                            {new Date(event.eventTime).toLocaleDateString("en-US", {
                                                                year: "numeric",
                                                                month: "long",
                                                                day: "numeric",
                                                                hour: "numeric",
                                                                minute: "2-digit",
                                                                hour12: true,
                                                            })}
                                                        </p>
                                                        {event.committeeId && (
                                                            <p className="text-sm text-muted-foreground">Committee: {event.committeeId}</p>
                                                        )}
                                                        {event.payload?.vote && (
                                                            <p className="text-sm mt-2">
                                                                <span className="font-medium">Result:</span> {event.payload.result}
                                                                {event.payload.vote.yeas !== null && event.payload.vote.nays !== null && (
                                                                    <span className="text-muted-foreground">
                                                                        {" "}
                                                                        {event.payload.vote.yeas ?? 0}{" - "}
                                                                        {event.payload.vote.nays ?? 0}{" "}
                                                                        (Excused: {event.payload.vote.excused ?? 0}{" "}
                                                                        Absent: {event.payload.vote.absent ?? 0})
                                                                    </span>
                                                                )}
                                                            </p>
                                                        )}
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
                                    {/* <VoteForm billNumber={billNumber} voteType="committee" /> */}
                                    <Button asChild>
                                        <Link href={`/record-vote?billNumber=${billNumber}`}>
                                            Add Committee Vote
                                        </Link>
                                    </Button>
                                </CardHeader>
                                <CardContent>
                                    <p className="hidden">@TODO the edit link needs to go to the new committee vote form</p>
                                    
                                    {committeeActions.length > 0 ? (
                                        <VotesPanel billNumber={billNumber} actions={committeeActions} kind="committee" />
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-8">No committee votes available for this bill</p>
                                    )}

                                    {/* <hr/><hr/><hr/> @HERE above is new, below is old */}

                                    {bill.actions && bill.actions.length > 0 && bill.actions.length > 1500 ? (
                                        <div className="space-y-4">
                                            {bill.actions
                                                .filter((action) => ( action.actionCode === "COMMITTEE_VOTE" || action.actionCode === "COMMITEE_VOTE" ))
                                                .sort((a, b) => new Date(b.actionDate).getTime() - new Date(a.actionDate).getTime())
                                                .map((action) => {
                                                    const date = new Date(action.actionDate)

                                                    // Check if it's exactly midnight UTC
                                                    const isMidnightUTC =
                                                        date.getUTCHours() === 0 &&
                                                        date.getUTCMinutes() === 0 &&
                                                        date.getUTCSeconds() === 0 &&
                                                        date.getUTCMilliseconds() === 0

                                                    const formattedDate = date.toLocaleString("en-US", {
                                                        timeZone: isMidnightUTC ? "UTC" : undefined,
                                                        year: "numeric",
                                                        month: "long",
                                                        day: "numeric",
                                                    })

                                                    return (
                                                        <div key={action.id} className="border-b last:border-0 pb-6 last:pb-0">
                                                            <div className="flex items-start justify-between mb-3">
                                                                <div>
                                                                    <p className="font-medium">{action?.committee?.name}</p>
                                                                    <p className="text-sm text-muted-foreground">
                                                                        {formattedDate}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                                                    <VoteBreakdownModal action={action} />

                                                                    {(() => {
                                                                        const voteAi = (action.dataSource as any)?.voteAi
                                                                        const status = voteAi?.status as string | undefined
                                                                        const attempts = voteAi?.attempts as number | undefined

                                                                        if (!status) {
                                                                            return null
                                                                        }

                                                                        const variant =
                                                                            status === "DONE"
                                                                                ? "default"
                                                                                : status === "FAILED"
                                                                                    ? "destructive"
                                                                                    : "outline"

                                                                        const label =
                                                                            status === "DONE"
                                                                                ? "AI: DONE"
                                                                                : status === "FAILED"
                                                                                    ? "AI: FAILED"
                                                                                    : status === "PROCESSING"
                                                                                        ? "AI: PROCESSING"
                                                                                        : "AI: PENDING"

                                                                        return (
                                                                            <Badge variant={variant}>
                                                                                {label}
                                                                                {typeof attempts === "number" ? ` (${attempts})` : ""}
                                                                            </Badge>
                                                                        )
                                                                    })()}

                                                                    {(() => {
                                                                        if (!hasPartyVotes(action.votes)) {
                                                                            return null
                                                                        }

                                                                        const result = computeStrictPartyLine(action.votes)
                                                                        const label = strictPartyLineLabel(result)

                                                                        const className =
                                                                            result.kind === "UNANIMOUS_FOR"
                                                                                ? "bg-gray-200 text-gray-900 border-gray-300"
                                                                                : result.kind === "PARTY_LINE"
                                                                                    ? "bg-blue-600 text-white border-blue-700"
                                                                                    : "bg-red-600 text-white border-red-700"

                                                                        return (
                                                                            <Badge variant="outline" className={className}>
                                                                                Vote: {label}
                                                                            </Badge>
                                                                        )
                                                                    })()}

                                                                    {(action.dataSource as any)?.mga?.voteUrl && (
                                                                        <a
                                                                            href={(action.dataSource as any).mga.voteUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                        >
                                                                            <Badge variant="outline">
                                                                                View PDF
                                                                            </Badge>
                                                                        </a>
                                                                    )}

                                                                    {action.source == "MANUAL" && (
                                                                        <Badge variant="outline">
                                                                            MANUAL
                                                                        </Badge>
                                                                    )}

                                                                    <Badge
                                                                        variant={
                                                                            action.voteResult === "Favorable" ||
                                                                            action.voteResult === "Favorable with Amendments" ||
                                                                            action.voteResult === "Favorable with Amendment"
                                                                                ? "default"
                                                                                : "destructive"
                                                                        }
                                                                    >
                                                                        {action.voteResult}
                                                                    </Badge>
                                                                </div>
                                                            </div>

                                                            <div className="flex gap-6 mb-3">
                                                                <div>
                                                                    <span className="font-medium">Yes: </span>
                                                                    <span className="text-green-600 dark:text-green-400">{action.yesVotes || 0}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium">No: </span>
                                                                    <span className="text-red-600 dark:text-red-400">{action.noVotes || 0}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-sm font-medium">Not Voting: </span>
                                                                    <span className="text-sm text-gray-600 dark:text-gray-400">{action.notVoting || 0}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-sm font-medium">Excused: </span>
                                                                    <span className="text-sm text-gray-600 dark:text-gray-400">{action.excused || 0}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-sm font-medium">Absent: </span>
                                                                    <span className="text-sm text-gray-600 dark:text-gray-400">{action.absent || 0}</span>
                                                                </div>
                                                            </div>

                                                            {action.notes && <p className="text-sm leading-relaxed">{action.notes}</p>}
                                                        </div>
                                                    )
                                                }
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-8 hidden">No committee votes available for this bill</p>
                                    )}

                                    {/* {bill.committeeVotes && bill.committeeVotes.length > 0 ? (
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
                                    )} */}
                                </CardContent>
                            </Card>

                            {/* Floor Votes */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>Floor Votes</CardTitle>
                                    <VoteForm billNumber={billNumber} voteType="floor" />
                                </CardHeader>
                                <CardContent>
                                    {floorActions.length > 0 ? (
                                        <VotesPanel billNumber={billNumber} actions={floorActions} kind="floor" />
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-8">No floor votes available for this bill</p>
                                    )}

                                    {/* <hr/><hr/><hr/> @HERE above is new, below is old */}
                                    
                                    {bill.actions && bill.actions.length > 0 && bill.actions.length > 15000 ? (
                                        <div className="space-y-4">
                                            {bill.actions
                                                .filter(
                                                    (action) =>
                                                        (action.actionCode === null && action.isVote === true) ||
                                                        action.actionCode === "FLOOR_VOTE"
                                                )
                                                .sort((a, b) => new Date(b.actionDate).getTime() - new Date(a.actionDate).getTime())
                                                .map((action) => (
                                                    <div key={action.id} className="border-b last:border-0 pb-6 last:pb-0">
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div>
                                                                {/* <p className="font-medium">{action?.chamber} - {action?.voteResult}</p> */}
                                                                <p className="font-medium">
                                                                    {action?.chamber?.charAt(0).toUpperCase() + action?.chamber?.slice(1).toLowerCase()}
                                                                    {action?.dataSource?.kind ? ` - ${formatReading(action.dataSource.kind)}` : ""}
                                                                    {action?.dataSource?.actionText || action?.voteResult ? ` - ${action.dataSource?.actionText || action.voteResult}` : ""}
                                                                </p>

                                                                <p className="text-sm text-muted-foreground">
                                                                    {new Date(action.actionDate).toLocaleDateString("en-US", {
                                                                        year: "numeric",
                                                                        month: "long",
                                                                        day: "numeric",
                                                                    })}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                { action.source == "MANUAL" && (
                                                                    <Badge variant="outline" className="mr-5">
                                                                        MANUAL
                                                                    </Badge>
                                                                )}
                                                                <Badge
                                                                    variant={
                                                                        action.voteResult === "Passed"
                                                                            ? "default"
                                                                            : "destructive"
                                                                    }
                                                                >
                                                                    {action.voteResult}
                                                                </Badge>
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-6 mb-3">
                                                            <div>
                                                                <span className="font-medium">Yes: </span>
                                                                <span className="text-green-600 dark:text-green-400">{action.yesVotes || 0}</span>
                                                            </div>
                                                            <div>
                                                                <span className="font-medium">No: </span>
                                                                <span className="text-red-600 dark:text-red-400">{action.noVotes || 0}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-sm font-medium">Not Voting: </span>
                                                                <span className="text-sm text-gray-600 dark:text-gray-400">{action.notVoting || 0}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-sm font-medium">Excused: </span>
                                                                <span className="text-sm text-gray-600 dark:text-gray-400">{action.excused || 0}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-sm font-medium">Absent: </span>
                                                                <span className="text-sm text-gray-600 dark:text-gray-400">{action.absent || 0}</span>
                                                            </div>
                                                        </div>

                                                        {action.notes && <p className="text-sm leading-relaxed">{action.notes}</p>}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-8 hidden">No floor votes available for this bill</p>
                                    )}

                                    {/* {bill.floorVotes && bill.floorVotes.length > 0 ? (
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
                                    )} */}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="notes" className="mt-6">
                        {/* @TODO pin/unpin notes (restricted permission) */}
                        <NotesPanel billNumber={billNumber} initialNotes={bill.notes} />
                    </TabsContent>

                    <TabsContent value="raw-data" className="mt-6">
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Raw JSON Data</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                                        <code>{JSON.stringify(bill, null, 2)}</code>
                                    </pre>
                                </CardContent>
                            </Card>
                        </div>
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

export default async function BillPage({ params, searchParams }: BillPageProps) {
    const { billNumber } = await params
    const { activeTab } = await searchParams

    return (
        <>
            <Suspense fallback={<BillSkeleton />}>
                <BillContent billNumber={billNumber} activeTab={activeTab} />
            </Suspense>
        </>
    )
}
