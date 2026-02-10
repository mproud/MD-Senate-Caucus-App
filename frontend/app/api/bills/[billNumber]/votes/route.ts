import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ActionSource, BillEventType, Chamber, Prisma } from "@prisma/client"
import { getActiveSessionCode } from "@/lib/get-system-setting"
import { auth } from "@clerk/nextjs/server"
import { z } from "zod"

interface CommitteeVoteRequest {
    type: "committee"
    date: string
    committeeId: number
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

        const activeSessionCode = await getActiveSessionCode()

        if (!billNumber) {
            return NextResponse.json({ error: "Missing billNumber" }, { status: 400 })
        }

        const bill = await prisma.bill.findFirst({
            where: {
                billNumber,
                sessionCode: activeSessionCode,
            },
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
        let committeeName: string | null | undefined = null

        // @TODO this isnt pulling by committee ID, just by what's submitted.
        if (body.type === "committee") {
            const committee = await prisma.committee.findFirst({
                where: { id: body.committeeId },
                select: { id: true, chamber: true, name: true },
            })
            committeeId = committee?.id ?? null
            committeeName = committee?.name
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
                ? `Committee vote: ${committeeName} - ${body.result} (${body.yeas}-${body.nays}) (Manually entered)`
                : `Floor vote: ${chamber} ${body.voteType} - ${body.result} (${body.yeas}-${body.nays}) (Manually entered)`

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
                                committeeId: body.committeeId,
                                details: body.details ?? null,
                            }
                        : {
                                voteType: body.voteType,
                            }),
                },
                ...(body.type === "committee"
                    ? {
                            actionCode: "COMMITTEE_VOTE",
                        }
                    : {
                            actionCode: "FLOOR_VOTE",
                            motion: body.voteType,
                        }),
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
                ? `Committee vote recorded: ${committeeName} — ${body.result} (${body.yeas}-${body.nays}) (Manually entered)`
                : `Floor vote recorded: ${chamber} ${body.voteType} — ${body.result} (${body.yeas}-${body.nays}) (Manually entered)`

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

const UpdateVoteSchema = z.object({
    actionId: z.number().int().positive(),
    type: z.enum(["committee", "floor"]),
    date: z.string().min(1),
    committeeId: z.number().int().positive().nullable().optional(),
    chamber: z.string().nullable().optional(),
    voteType: z.string().nullable().optional(),
    result: z.string().nullable().optional(),
    yeas: z.number().int().nonnegative().nullable().optional(),
    nays: z.number().int().nonnegative().nullable().optional(),
    absent: z.number().int().nonnegative().nullable().optional(),
    excused: z.number().int().nonnegative().nullable().optional(),
    notVoting: z.number().int().nonnegative().nullable().optional(),
    details: z.string().nullable().optional(),
})

const DeleteVoteSchema = z.object({
    actionId: z.number().int().positive(),
})

function getErrorMessage(msg: unknown): string | null {
    if (!msg || typeof msg !== "object") return null
    if (!("error" in msg)) return null
    const e = (msg as any).error
    return typeof e === "string" ? e : null
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await params

        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const parsed = UpdateVoteSchema.safeParse(await request.json())
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
        }

        const activeSessionCode = await getActiveSessionCode()

        const bill = await prisma.bill.findFirst({
            where: {
                billNumber,
                sessionCode: activeSessionCode,
            },
            select: { id: true, billNumber: true },
        })

        if (!bill) {
            return NextResponse.json({ error: "Bill not found" }, { status: 404 })
        }

        const actionDate = new Date(parsed.data.date)
        if (Number.isNaN(actionDate.getTime())) {
            return NextResponse.json({ error: "Invalid date" }, { status: 400 })
        }

        const existingAction = await prisma.billAction.findFirst({
            where: {
                id: parsed.data.actionId,
                billId: bill.id,
                isVote: true,
            },
            select: {
                id: true,
                billId: true,
                dataSource: true,
                committeeId: true,
                chamber: true,
            },
        })

        if (!existingAction) {
            return NextResponse.json({ error: "Vote not found" }, { status: 404 })
        }

        let committeeId: number | null = null
        let chamber: Chamber | null = null
        let committeeName: string | null | undefined = null

        if (parsed.data.type === "committee") {
            if (parsed.data.committeeId == null) {
                return NextResponse.json({ error: "committeeId is required for committee votes" }, { status: 400 })
            }

            const committee = await prisma.committee.findFirst({
                where: { id: parsed.data.committeeId },
                select: { id: true, chamber: true, name: true },
            })

            committeeId = committee?.id ?? null
            committeeName = committee?.name
            chamber = committee?.chamber ?? null
        } else {
            chamber = parseChamber(parsed.data.chamber)
            if (!chamber) {
                return NextResponse.json(
                    { error: "Invalid chamber (expected SENATE | HOUSE | JOINT)" },
                    { status: 400 }
                )
            }
        }

        const yeas = parsed.data.yeas ?? null
        const nays = parsed.data.nays ?? null
        const absent = parsed.data.absent ?? null
        const excused = parsed.data.excused ?? null
        const notVoting = parsed.data.notVoting ?? null

        const description =
            parsed.data.type === "committee"
                ? `Committee vote: ${committeeName} - ${parsed.data.result ?? ""} (${yeas ?? 0}-${nays ?? 0}) (Manually entered)`
                : `Floor vote: ${chamber} ${parsed.data.voteType ?? ""} - ${parsed.data.result ?? ""} (${yeas ?? 0}-${nays ?? 0}) (Manually entered)`

        const prevDataSource = (existingAction.dataSource as any) ?? {}
        const nextDataSource: any = {
            ...prevDataSource,
            manual: true,
            type: parsed.data.type,
        }

        if (parsed.data.type === "committee") {
            nextDataSource.committeeId = parsed.data.committeeId
            nextDataSource.details = parsed.data.details ?? null
        } else {
            nextDataSource.voteType = parsed.data.voteType ?? null
        }

        const updated = await prisma.billAction.update({
            where: { id: parsed.data.actionId },
            data: {
                actionDate,
                chamber,
                committeeId,
                description,
                voteResult: parsed.data.result ?? null,
                yesVotes: yeas,
                noVotes: nays,
                absent,
                excused,
                notVoting,
                notes: parsed.data.details ?? null,
                dataSource: nextDataSource,
                ...(parsed.data.type === "committee"
                    ? { actionCode: "COMMITTEE_VOTE", motion: null }
                    : { actionCode: "FLOOR_VOTE", motion: parsed.data.voteType ?? null }),
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
                notes: true,
                source: true,
                dataSource: true,
                updatedAt: true,
            },
        })

        return NextResponse.json({ success: true, action: updated })
    } catch (error) {
        console.error("Error updating vote:", error)
        return NextResponse.json({ error: "Failed to update vote" }, { status: 500 })
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await params

        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const url = new URL(request.url)
        const actionIdFromQuery = url.searchParams.get("actionId")

        let actionId: number | null = null
        if (actionIdFromQuery && Number.isInteger(Number(actionIdFromQuery))) {
            actionId = Number(actionIdFromQuery)
        }

        if (!actionId) {
            try {
                const parsed = DeleteVoteSchema.safeParse(await request.json())
                if (parsed.success) actionId = parsed.data.actionId
            } catch {
                // ignore
            }
        }

        if (!actionId) {
            return NextResponse.json({ error: "actionId is required (query or body)" }, { status: 400 })
        }

        const activeSessionCode = await getActiveSessionCode()

        const bill = await prisma.bill.findFirst({
            where: {
                billNumber,
                sessionCode: activeSessionCode,
            },
            select: { id: true },
        })

        if (!bill) {
            return NextResponse.json({ error: "Bill not found" }, { status: 404 })
        }

        const existing = await prisma.billAction.findFirst({
            where: {
                id: actionId,
                billId: bill.id,
                isVote: true,
            },
            select: { id: true },
        })

        if (!existing) {
            return NextResponse.json({ error: "Vote not found" }, { status: 404 })
        }

        await prisma.billAction.delete({
            where: { id: actionId },
        })

        // Best-effort cleanup of the manual event created in POST (payload.billActionId)
        // If your DB doesn't support JSON path filters, you can remove this block safely.
        try {
            await prisma.billEvent.deleteMany({
                where: {
                    billId: bill.id,
                    payload: {
                        path: ["billActionId"],
                        equals: actionId,
                    } as any,
                },
            })
        } catch (e) {
            console.warn("BillEvent cleanup failed (safe to ignore):", e)
        }

        return NextResponse.json({ success: true, deleted: true, actionId })
    } catch (error) {
        console.error("Error deleting vote:", error)
        return NextResponse.json({ error: "Failed to delete vote" }, { status: 500 })
    }
}
