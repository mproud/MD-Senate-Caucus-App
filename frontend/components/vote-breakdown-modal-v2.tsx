import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

type VoteBucket = "yea" | "nay" | "abstain" | "excused" | "absent"

type Votes = {
    vote: string
    legislator: {
        id: number
        fullName: string
        lastName: string
    }
}

type VoteBreakdownAction = {
    actionDate: Date
    votes: Votes[]
    committeeId?: number | null
    motion: string
    voteResult: string
    yesVotes: number
    noVotes: number
    notVoting: number
    excused: number
    absent: number
}

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

const check = ( isChecked: boolean ) => ( isChecked ? "✓" : "" )

const formatName = (legislator: any) => {
    const { firstName, middleName, lastName } = legislator

    const middle =
        middleName && middleName.replace(/\./g, "").length > 2
            ? `${middleName} `
            : ""

    const firstInitial = firstName?.charAt(0) ?? ""

    return `${middle}${lastName}, ${firstInitial}`
}

const buildFourColumns = (votes: any[]) => {
    const sorted = [...votes].sort((a, b) =>
        a.legislator.lastName.localeCompare(b.legislator.lastName)
    )

    const total = sorted.length
    const rowsPerColumn = Math.ceil(total / 4)

    const columns: string[][] = [[], [], [], []]

    sorted.forEach((vote, index) => {
        const columnIndex = Math.floor(index / rowsPerColumn)
        columns[columnIndex].push(formatName(vote.legislator))
    })

    return columns
}

const VoteSection = ({
    title,
    total,
    votes
}: {
    title: string
    total: number
    votes: any[]
}) => {
    const columns = buildFourColumns(votes)
    const maxRows = Math.max(...columns.map(col => col.length))

    return (
        <>
            <h4 className="text-md font-bold mt-6 mb-2">
                {title} ({total})
            </h4>

            <div className="grid grid-cols-4 gap-4">
                {Array.from({ length: maxRows }).map((_, rowIndex) => (
                    <div key={rowIndex}>
                        {columns.map((col, colIndex) => (
                            <div key={colIndex}>
                                {col[rowIndex] ?? ""}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </>
    )
}

export const VoteBreakdownModalV2 = ({ action }: { action: VoteBreakdownAction }) => {
    const { votes } = action

    // Bail if there aren't any votes recorded
    if ( ! votes ) return null

    // Process individual votes into buckets for the committe list
    const committeeRows = votes
        .map(( v ) => {
            const bucket = toBucket( v.vote )
            const name = ( v.legislator.lastName ?? "").trim()

            return {
                name,
                bucket,
            }
        })
        .filter((r) => r.name.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))

    const floorRows = []

    const hasBreakdown = committeeRows.length > 0 || floorRows.length > 0

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
                    View breakdown <span className="text-xs">(v2)</span>
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-6xl">
                <DialogHeader>
                    <DialogTitle>
                        {action.committeeId ? "Committee Vote" : `${action.motion} Vote`} &middot; {formattedDate}
                    </DialogTitle>
                </DialogHeader>

                { ! hasBreakdown ? (
                    <p className="text-sm text-muted-foreground">
                        No legislator-level vote breakdown is available for this action.
                    </p>
                ) : (
                    <div className="max-h-[70vh] overflow-auto rounded-md border">
                        {/* Show two views for committee vs floor vote */}
                        { action.committeeId ? (
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
                                    {committeeRows.map((r, idx) => (
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
                                        <td className="border px-3 py-2 text-center">{action.yesVotes}</td>
                                        <td className="border px-3 py-2 text-center">{action.noVotes}</td>
                                        <td className="border px-3 py-2 text-center">{action.notVoting}</td>
                                        <td className="border px-3 py-2 text-center">{action.excused}</td>
                                        <td className="border px-3 py-2 text-center">{action.absent}</td>
                                    </tr>
                                </tbody>
                            </table>
                        ) : (
                            <>
                                <VoteSection
                                    title="Voting Yea"
                                    total={action.yesVotes}
                                    votes={action.votes.filter(v => v.vote === "YEA")}
                                />

                                <VoteSection
                                    title="Voting Nay"
                                    total={action.noVotes}
                                    votes={action.votes.filter(v => v.vote === "NAY")}
                                />

                                <VoteSection
                                    title="Not Voting"
                                    total={action.notVoting}
                                    votes={action.votes.filter(v => v.vote === "NOT_VOTING")}
                                />

                                <VoteSection
                                    title="Excused from voting"
                                    total={action.excused}
                                    votes={action.votes.filter(v => v.vote === "EXCUSED")}
                                />

                                <VoteSection
                                    title="Absent"
                                    total={action.absent}
                                    votes={action.votes.filter(v => v.vote === "ABSENT")}
                                />
                            </>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}