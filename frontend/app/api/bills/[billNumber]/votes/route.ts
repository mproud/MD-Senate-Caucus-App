import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ActionSource, BillEventType, Chamber, Prisma } from "@prisma/client"

interface CommitteeVoteRequest {
    type: "committee"
    date: string
    committee: string
    result: string
    yeas: number
    nays: number
    absent: number
    excused: number
    notVoting: number
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
    excused: number
    absent: number
    notVoting: number
    details?: string
}

type VoteRequest = CommitteeVoteRequest | FloorVoteRequest

function parseChamber(value: string | undefined | null): Chamber | null {
    if (!value) return null
    const v = value.toUpperCase().trim()
    if (v === "SENATE") return Chamber.SENATE
    if (v === "HOUSE") return Chamber.HOUSE
    if (v === "JOINT") return Chamber.JOINT
    return null
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await params
        const body = (await request.json()) as VoteRequest

        if (!billNumber) {
            return NextResponse.json({ error: "Missing billNumber" }, { status: 400 })
        }

        const bill = await prisma.bill.findFirst({
            where: { billNumber },
            select: { id: true, billNumber: true },
        })

        if (!bill) {
            return NextResponse.json({ error: "Bill not found" }, { status: 404 })
        }

        const actionDate = new Date(body.date)
        if (Number.isNaN(actionDate.getTime())) {
            return NextResponse.json({ error: "Invalid date" }, { status: 400 })
        }

        // Optional: resolve committee by name for committee votes
        let committeeId: number | null = null
        let chamber: Chamber | null = null

        if (body.type === "committee") {
            const committee = await prisma.committee.findFirst({
                where: { name: body.committee },
                select: { id: true, chamber: true },
            })
            committeeId = committee?.id ?? null
            chamber = committee?.chamber ?? null
        } else {
            chamber = parseChamber(body.chamber)
            if (!chamber) {
                return NextResponse.json(
                    { error: "Invalid chamber (expected SENATE | HOUSE | JOINT)" },
                    { status: 400 }
                )
            }
        }

        // Build BillAction vote fields using existing schema
        const voteCounts = {
            yesVotes: body.yeas,
            noVotes: body.nays,
            excused: body.excused,
            absent: body.absent,
            notVoting: body.notVoting,
        }

        const description =
            body.type === "committee"
                ? `Manual committee vote: ${body.committee} — ${body.result} (${body.yeas}-${body.nays})`
                : `Manual floor vote: ${chamber} ${body.voteType} — ${body.result} (${body.yeas}-${body.nays})`

        console.log('Record vote/billAction', { body, voteCounts })

        // 1) Create the BillAction (this is the "vote record" in the current schema)
        const createdAction = await prisma.billAction.create({
            data: {
                billId: bill.id,
                actionDate,
                chamber,
                committeeId,
                description,
                isVote: true,
                voteResult: body.result,
                ...voteCounts,
                notes: body.details,
                source: ActionSource.MANUAL,
                dataSource: {
                    manual: true,
                    type: body.type,
                    ...(body.type === "committee"
                        ? {
                                committeeName: body.committee,
                                details: body.details ?? null,
                            }
                        : {
                                voteType: body.voteType,
                            }),
                },
            },
            select: {
                id: true,
                billId: true,
                actionDate: true,
                chamber: true,
                committeeId: true,
                description: true,
                isVote: true,
                voteResult: true,
                yesVotes: true,
                noVotes: true,
                excused: true,
                absent: true,
                notVoting: true,
                source: true,
                createdAt: true,
            },
        })

        // 2) Create the BillEvent so alert processing can react to this manual vote
        const eventType =
            body.type === "committee"
                ? BillEventType.COMMITTEE_VOTE_RECORDED
                : BillEventType.BILL_NEW_ACTION

        const summary =
            body.type === "committee"
                ? `Manual committee vote recorded: ${body.committee} — ${body.result} (${body.yeas}-${body.nays})`
                : `Manual floor vote recorded: ${chamber} ${body.voteType} — ${body.result} (${body.yeas}-${body.nays})`

        const createdEvent = await prisma.billEvent.create({
            data: {
                billId: bill.id,
                eventType,
                eventTime: new Date(),
                chamber,
                committeeId,
                summary,
                payload: {
                    manual: true,
                    billActionId: createdAction.id,
                    vote: body as unknown as Prisma.InputJsonValue,
                },
            },
            select: {
                id: true,
                billId: true,
                eventType: true,
                eventTime: true,
                chamber: true,
                committeeId: true,
                summary: true,
                payload: true,
            },
        })

        return NextResponse.json({
            success: true,
            billNumber: bill.billNumber,
            action: createdAction,
            event: createdEvent,
        })
    } catch (error) {
        console.error("Error adding manual vote:", error)
        return NextResponse.json({ error: "Failed to add vote" }, { status: 500 })
    }
}
