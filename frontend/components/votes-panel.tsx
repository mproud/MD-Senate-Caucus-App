"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { VoteBreakdownModal } from "@/components/vote-breakdown-modal"
import { VoteForm } from "@/components/vote-form"
import { toast } from "sonner"
import Link from "next/link"
import { VoteBreakdownModalV2 } from "./vote-breakdown-modal-v2"

type Party = "Democrat" | "Republican"

type ActionVote = {
    vote: string
    legislator?: {
        party?: Party | null
    } | null
}

type StrictPartyLineResult =
    | { kind: "UNANIMOUS_FOR" }
    | { kind: "PARTY_LINE", direction: "D_YEA_R_NAY" | "D_NAY_R_YEA" }
    | { kind: "SPLIT", direction: "D_YEA_R_NAY" | "D_NAY_R_YEA", defectors: number }
    | { kind: "NOT_PARTY_LINE" }

const normalizeVote = (v: string | null | undefined) => (v ?? "").trim().toUpperCase()

const computeStrictPartyLine = (votes: ActionVote[] | null | undefined): StrictPartyLineResult => {
    let totalYea = 0
    let totalNay = 0

    let dYea = 0
    let dNay = 0
    let rYea = 0
    let rNay = 0

    for (const v of votes ?? []) {
        const val = normalizeVote(v.vote)
        const party = v.legislator?.party ?? null

        if (val !== "YEA" && val !== "NAY") continue

        if (val === "YEA") totalYea += 1
        else totalNay += 1

        if (party !== "Democrat" && party !== "Republican") continue

        if (party === "Democrat") {
            if (val === "YEA") dYea += 1
            else dNay += 1
        } else {
            if (val === "YEA") rYea += 1
            else rNay += 1
        }
    }

    const totalConsidered = totalYea + totalNay
    if (totalConsidered === 0) return { kind: "NOT_PARTY_LINE" }
    if (totalNay === 0) return { kind: "UNANIMOUS_FOR" }

    const dTotal = dYea + dNay
    const rTotal = rYea + rNay
    if (dTotal === 0 || rTotal === 0) return { kind: "NOT_PARTY_LINE" }

    const isPartyLine_DYea_RNay = dYea === dTotal && rNay === rTotal
    const isPartyLine_DNay_RYea = dNay === dTotal && rYea === rTotal

    if (isPartyLine_DYea_RNay) return { kind: "PARTY_LINE", direction: "D_YEA_R_NAY" }
    if (isPartyLine_DNay_RYea) return { kind: "PARTY_LINE", direction: "D_NAY_R_YEA" }

    const defectors_DYea_RNay = (dTotal - dYea) + (rTotal - rNay)
    if (defectors_DYea_RNay === 1) return { kind: "SPLIT", direction: "D_YEA_R_NAY", defectors: 1 }

    const defectors_DNay_RYea = (dTotal - dNay) + (rTotal - rYea)
    if (defectors_DNay_RYea === 1) return { kind: "SPLIT", direction: "D_NAY_R_YEA", defectors: 1 }

    return { kind: "NOT_PARTY_LINE" }
}

const strictPartyLineLabel = (r: StrictPartyLineResult) => {
    if (r.kind === "UNANIMOUS_FOR") return "Unanimous"
    if (r.kind === "PARTY_LINE") return "Party Line"
    if (r.kind === "SPLIT") return "Party Split"
    return "Not party line"
}

const hasPartyVotes = (votes: ActionVote[] | null | undefined) => {
    return (votes ?? []).some(
        (v) =>
            (v.vote === "YEA" || v.vote === "NAY") &&
            (v.legislator?.party === "Democrat" || v.legislator?.party === "Republican")
    )
}

function getApiErrorMessage(msg: unknown): string | null {
    if (!msg || typeof msg !== "object") return null
    if (!("error" in msg)) return null
    const e = (msg as any).error
    return typeof e === "string" ? e : null
}

export function VotesPanel({
    billNumber,
    actions,
    kind,
}: {
    billNumber: string
    actions: any[]
    kind: "committee" | "floor"
}) {
    const router = useRouter()
    const [deletingId, setDeletingId] = useState<number | null>(null)
    const [refetchingId, setRefetchingId] = useState<number | null>(null)

    const sorted = useMemo(() => {
        return actions
            .slice()
            .sort((a, b) => new Date(b.actionDate).getTime() - new Date(a.actionDate).getTime())
    }, [actions])

    const handleDelete = async (actionId: number) => {
        setDeletingId(actionId)
        try {
            const res = await fetch(`/api/bills/${billNumber}/votes?actionId=${actionId}`, {
                method: "DELETE",
            })

            if (!res.ok) {
                const msg: unknown = await res.json().catch(() => null)
                throw new Error(getApiErrorMessage(msg) ?? "Failed to delete vote")
            }

            toast("Vote Deleted", { description: "The vote has been removed." })
            router.refresh()
        } catch (e) {
            toast.error("Error", { description: e instanceof Error ? e.message : "Failed to delete vote" })
        } finally {
            setDeletingId(null)
        }
    }

    const triggerAiRefetch = async (action: any) => {
        const voteAi = (action.dataSource as any)?.voteAi
        const voteProcessing = (action.dataSource as any)?.voteProcessing
        const status = voteAi?.status as string | undefined

        if (status !== "FAILED" && status !== "DONE") {
            return
        }

        console.log('VoteAI', voteAi, voteProcessing)

        setRefetchingId(action.id)
        try {
            // const res = await fetch(`/api/bills/${billNumber}/votes/ai-refetch`, {
            //     method: "POST",
            //     headers: { "Content-Type": "application/json" },
            //     body: JSON.stringify({ actionId: action.id }),
            // })

            // if (!res.ok) {
            //     const msg: unknown = await res.json().catch(() => null)
            //     throw new Error(getApiErrorMessage(msg) ?? "Failed to trigger AI refetch")
            // }

            toast("AI Refetch Triggered", { description: "AI vote refetch has been queued." })

            // router.refresh()
        } catch (e) {
            toast.error("Error", { description: e instanceof Error ? e.message : "Failed to trigger AI refetch" })
        } finally {
            setRefetchingId(null)
        }
    }

    return (
        <div className="space-y-4">
            {sorted.map((action) => {
                // const voteAi = (action.dataSource as any)?.voteAi
                // const status = voteAi?.status as string | undefined
                // const attempts = voteAi?.attempts as number | undefined

                // V2 AI Vote Processing
                const voteProcessing = (action.dataSource as any)?.voteProcessing
                const status = voteProcessing?.status as string | undefined
                const attempts = voteProcessing?.attempts as number | undefined

                // Figure out what approach to use instead of "kind == committee"
                if ( voteProcessing ) {
                    // ????
                }

                const showAiRefetch = status === "FAILED" || status === "DONE"

                const aiVariant =
                    status === "DONE" ? "default" : status === "FAILED" ? "destructive" : "outline"

                const aiLabel =
                    status === "DONE"
                        ? "AI: DONE"
                        : status === "FAILED"
                            ? "AI: FAILED"
                            : status === "PROCESSING"
                                ? "AI: PROCESSING"
                                : status === "PENDING"
                                    ? "AI: PENDING"
                                    : null

                return (
                    <div key={action.id} className="border-b last:border-0 pb-6 last:pb-0">
                        <div className="flex items-start justify-between mb-3 gap-4">
                            <div>
                                {kind === "committee" ? (
                                    <>
                                        <p className="font-medium">{action?.committee?.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(action.actionDate).toLocaleDateString("en-US", {
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            })}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-medium">
                                            {action?.chamber?.charAt(0).toUpperCase() + action?.chamber?.slice(1).toLowerCase()}
                                            {action?.motion ? ` - ${action.motion}` : ""}
                                            {action?.voteResult ? ` - ${action.voteResult}` : ""}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(action.actionDate).toLocaleDateString("en-US", {
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            })}
                                        </p>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                
                                { kind === "committee" ? (
                                    <VoteBreakdownModal action={action} />
                                ): (
                                    <VoteBreakdownModalV2 action={action} />
                                )}

                                {kind === "committee" && aiLabel && (
                                    <Button asChild size="sm" variant="outline">
                                        <Link href={`/record-vote?billNumber=${billNumber}&actionId=${action.id}`}>
                                            Edit Committee Vote
                                        </Link>
                                    </Button>
                                )}

                                {aiLabel && (
                                    <Badge variant={aiVariant}>
                                        {aiLabel}
                                        {typeof attempts === "number" ? ` (${attempts})` : ""}
                                    </Badge>
                                )}

                                {kind === "committee" && hasPartyVotes(action.votes) && (
                                    (() => {
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
                                    })()
                                )}

                                {showAiRefetch && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={refetchingId === action.id}
                                        onClick={() => triggerAiRefetch(action)}
                                    >
                                        {refetchingId === action.id ? "Refetching..." : "Refetch AI"}
                                    </Button>
                                )}

                                { !aiLabel && (
                                    <VoteForm
                                        billNumber={billNumber}
                                        voteType={kind}
                                        mode="edit"
                                        action={action}
                                        trigger={
                                            <Button size="sm" variant="outline">
                                                Edit
                                            </Button>
                                        }
                                        onSaved={() => router.refresh()}
                                    />
                                )}

                                <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={deletingId === action.id}
                                    onClick={() => handleDelete(action.id)}
                                >
                                    {deletingId === action.id ? "Deleting..." : "Delete"}
                                </Button>

                                {action.source === "MANUAL" && (
                                    <Badge variant="outline">
                                        MANUAL
                                    </Badge>
                                )}

                                {action.voteResult && (
                                    <Badge
                                        variant={
                                            action.voteResult === "Favorable" ||
                                            action.voteResult === "Favorable with Amendments" ||
                                            action.voteResult === "Favorable with Amendment" ||
                                            action.voteResult === "Passed"
                                                ? "default"
                                                : "destructive"
                                        }
                                    >
                                        {action.voteResult}
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-6 mb-3 flex-wrap">
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

                        <p className="text-xs text-gray-600">{action.id}</p>
                    </div>
                )
            })}
        </div>
    )
}
