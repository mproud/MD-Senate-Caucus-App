"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

type MemberVote = {
    vote?: string | null
    memberName?: string | null
}

type VoteTotals = {
    yeas?: number | null
    nays?: number | null
    abstain?: number | null
    excused?: number | null
    absent?: number | null
}

type VoteAiResultVote = {
    memberVotes?: MemberVote[] | null
    totalsRow?: VoteTotals | null
}

type ActionLike = {
    id: number
    actionDate: string
    yesVotes?: number | null
    noVotes?: number | null
    abstain?: number | null
    excused?: number | null
    absent?: number | null
    committee?: { name?: string | null } | null
    dataSource?: any
}

type Props = {
    action: ActionLike
}

type VoteBucket = "yea" | "nay" | "abstain" | "excused" | "absent"

const toBucket = (raw: string | null | undefined): VoteBucket | null => {
    const v = (raw ?? "").trim().toLowerCase()

    if (!v) {
        return null
    }

    if (v === "yes" || v === "yea" || v === "y" || v === "for") {
        return "yea"
    }

    if (v === "no" || v === "nay" || v === "n" || v === "against") {
        return "nay"
    }

    if (v === "abstain" || v === "abstained") {
        return "abstain"
    }

    if (v === "excused" || v === "excuse") {
        return "excused"
    }

    if (v === "absent") {
        return "absent"
    }

    return null
}

const check = (isChecked: boolean) => (isChecked ? "✓" : "")

export function VoteBreakdownModal({ action }: Props) {
    const vote: VoteAiResultVote | null =
        (action.dataSource as any)?.voteAiResult?.vote ?? null

    const memberVotes: MemberVote[] =
        (vote?.memberVotes ?? []).filter(Boolean)

    const rows = memberVotes
        .map((mv) => {
            const bucket = toBucket(mv.vote)
            const name = (mv.memberName ?? "").trim()

            return {
                name,
                bucket,
            }
        })
        .filter((r) => r.name.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))

    const totalsFromAi = vote?.totalsRow ?? null

    const totals = {
        yea:
            totalsFromAi?.yeas ??
            (typeof action.yesVotes === "number" ? action.yesVotes : 0),
        nay:
            totalsFromAi?.nays ??
            (typeof action.noVotes === "number" ? action.noVotes : 0),
        abstain:
            totalsFromAi?.abstain ??
            (typeof action.abstain === "number" ? action.abstain : 0),
        excused:
            totalsFromAi?.excused ??
            (typeof action.excused === "number" ? action.excused : 0),
        absent:
            totalsFromAi?.absent ??
            (typeof action.absent === "number" ? action.absent : 0),
    }

    const hasBreakdown = rows.length > 0

    const formattedDate = new Date(action.actionDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    })

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasBreakdown}
                    title={hasBreakdown ? "View vote breakdown" : "No legislator breakdown available"}
                >
                    View breakdown
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {action.committee?.name ?? "Committee Vote"} • {formattedDate}
                        <span className="text-xs font-normal mt-2 block">Important note: The chair will not be displayed in this list if they chose not to vote.</span>
                    </DialogTitle>
                </DialogHeader>

                {!hasBreakdown ? (
                    <p className="text-sm text-muted-foreground">
                        No legislator-level vote breakdown is available for this action.
                    </p>
                ) : (
                    <div className="max-h-[70vh] overflow-auto rounded-md border">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="border px-3 py-2 text-left font-semibold">Name</th>
                                    <th className="border px-3 py-2 text-center font-semibold">Yea</th>
                                    <th className="border px-3 py-2 text-center font-semibold">Nay</th>
                                    <th className="border px-3 py-2 text-center font-semibold">Abstain</th>
                                    <th className="border px-3 py-2 text-center font-semibold">Excused</th>
                                    <th className="border px-3 py-2 text-center font-semibold">Absent</th>
                                </tr>
                            </thead>

                            <tbody>
                                {rows.map((r, idx) => (
                                    <tr key={`${r.name}-${idx}`} className={idx % 2 === 1 ? "bg-muted" : ""}>
                                        <td className="border px-3 py-2 font-medium">{r.name}</td>
                                        <td className="border px-3 py-2 text-center">{check(r.bucket === "yea")}</td>
                                        <td className="border px-3 py-2 text-center">{check(r.bucket === "nay")}</td>
                                        <td className="border px-3 py-2 text-center">{check(r.bucket === "abstain")}</td>
                                        <td className="border px-3 py-2 text-center">{check(r.bucket === "excused")}</td>
                                        <td className="border px-3 py-2 text-center">{check(r.bucket === "absent")}</td>
                                    </tr>
                                ))}

                                <tr className="bg-muted font-semibold">
                                    <td className="border px-3 py-2 text-right">Totals</td>
                                    <td className="border px-3 py-2 text-center">{totals.yea}</td>
                                    <td className="border px-3 py-2 text-center">{totals.nay}</td>
                                    <td className="border px-3 py-2 text-center">{totals.abstain}</td>
                                    <td className="border px-3 py-2 text-center">{totals.excused}</td>
                                    <td className="border px-3 py-2 text-center">{totals.absent}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
