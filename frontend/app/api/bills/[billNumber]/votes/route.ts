import { type NextRequest, NextResponse } from "next/server"
import { manualVotes } from "@/lib/mock-data"

interface CommitteeVoteRequest {
    type: "committee"
    date: string
    committee: string
    result: string
    yeas: number
    nays: number
    absent: number
    details?: string
}

interface FloorVoteRequest {
    type: "floor"
    date: string
    chamber: string
    voteType: string
    result: string
    yeas: number
    nays: number
    absent: number
    notVoting: number
}

type VoteRequest = CommitteeVoteRequest | FloorVoteRequest

export async function POST(request: NextRequest, { params }: { params: Promise<{ billNumber: string }> }) {
    try {
        const { billNumber } = await params
        const body = (await request.json()) as VoteRequest

        if (!manualVotes[billNumber]) {
            manualVotes[billNumber] = { committeeVotes: [], floorVotes: [] }
        }

        if (body.type === "committee") {
            const committeeVote = {
                id: `manual-${Date.now()}`,
                date: body.date,
                committee: body.committee,
                result: body.result,
                yeas: body.yeas,
                nays: body.nays,
                absent: body.absent,
                details: body.details,
            }
            manualVotes[billNumber].committeeVotes.push(committeeVote)
            return NextResponse.json(committeeVote)
        } else {
            const floorVote = {
                id: `manual-${Date.now()}`,
                date: body.date,
                chamber: body.chamber,
                voteType: body.voteType,
                result: body.result,
                yeas: body.yeas,
                nays: body.nays,
                absent: body.absent,
                notVoting: body.notVoting,
            }
            manualVotes[billNumber].floorVotes.push(floorVote)
            return NextResponse.json(floorVote)
        }
    } catch (error) {
        console.error("Error adding vote:", error)
        return NextResponse.json({ error: "Failed to add vote" }, { status: 500 })
    }
}
