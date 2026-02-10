import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"
import { getActiveSessionCode } from "@/lib/get-system-setting"

const RefetchSchema = z.object({
    actionId: z.number().int().positive(),
})

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await params

        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const parsed = RefetchSchema.safeParse(await req.json())
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
        }

        const activeSessionCode = await getActiveSessionCode()

        const bill = await prisma.bill.findFirst({
            where: { billNumber, sessionCode: activeSessionCode },
            select: { id: true },
        })
        if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 })

        const action = await prisma.billAction.findFirst({
            where: { id: parsed.data.actionId, billId: bill.id, isVote: true },
            select: { id: true, dataSource: true },
        })
        if (!action) return NextResponse.json({ error: "Vote not found" }, { status: 404 })

        const ds = (action.dataSource as any) ?? {}
        const voteAi = ds.voteAi ?? {}
        const status = voteAi.status as string | undefined

        if (status !== "FAILED" && status !== "DONE") {
            return NextResponse.json({ error: "AI refetch allowed only when status is FAILED or DONE" }, { status: 400 })
        }

        const nextDataSource = {
            ...ds,
            voteAi: {
                ...voteAi,
                status: "PENDING",
                lastError: null,
            },
        }

        await prisma.billAction.update({
            where: { id: action.id },
            data: { dataSource: nextDataSource },
        })

        return NextResponse.json({ success: true, queued: true, actionId: action.id })
    } catch (error) {
        console.error("AI refetch error:", error)
        return NextResponse.json({ error: "Failed to trigger AI refetch" }, { status: 500 })
    }
}
