import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getActiveSessionCode } from "@/lib/get-active-session"

// Flag this bill for all users
// export async function mock___GET( request: NextRequest ) {
//     // Get the flag status of a bill
//     // Get all flagged bills
//     return NextResponse.json( { isFlag: false, success: true }, { status: 200 })
// }

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status })
}

function toInt(value: string | null): number | null {
    if ( ! value ) return null
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? n : null
}


/**
 * GET /api/flag
 * - If no billId or billNumber: return all bills where isFlagged = true
 * - If billId or billNumber: return isFlagged for that single bill
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url)

        const billId = toInt(url.searchParams.get("billId"))
        const billNumber = url.searchParams.get("billNumber")

        const activeSessionCode = await getActiveSessionCode()

        // No bill selector => list all flagged bills
        if (!billId && !billNumber) {
            const bills = await prisma.bill.findMany({
                where: {
                    isFlagged: true,
                    sessionCode: activeSessionCode,
                },
                select: {
                    id: true,
                    billNumber: true,
                    shortTitle: true,
                    chamber: true,
                    statusDesc: true,
                    crossFileExternalId: true,
                    crossFileBill: true,
                    isFlagged: true,
                    updatedAt: true,
                },
                orderBy: [{ updatedAt: "desc" }],
            })

            return json({ bills })
        }

        // Single bill status lookup
        const bill = billId
            ? await prisma.bill.findUnique({
                    where: { id: billId },
                    select: { id: true, billNumber: true, isFlagged: true },
                })
            : await prisma.bill.findFirst({
                    where: {
                        billNumber: billNumber ?? ""
                    },
                    select: { id: true, billNumber: true, isFlagged: true },
                })

        if (!bill) return json({ error: "Bill not found" }, 404)

        return json({
            billId: bill.id,
            billNumber: bill.billNumber,
            isFlag: bill.isFlagged,
            isFlagged: bill.isFlagged, // included for convenience
        })
    } catch (error) {
        console.error("Flag GET error:", error)
        return json({ error: "Internal Server Error" }, 500)
    }
}

/**
 * POST /api/flag
 * Body: { billId: number }
 * Sets isFlagged = true
 */
export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as { billId?: unknown }

        const billId =
            typeof body.billId === "number" && Number.isInteger(body.billId) && body.billId > 0
                ? body.billId
                : null

        if (!billId) return json({ error: "billId is required (integer)" }, 400)

        const updated = await prisma.bill.update({
            where: { id: billId },
            data: { isFlagged: true },
            select: { id: true, billNumber: true, isFlagged: true },
        })

        return json({
            success: true,
            billId: updated.id,
            billNumber: updated.billNumber,
            isFlag: updated.isFlagged,
            isFlagged: updated.isFlagged,
        })
    } catch (error: any) {
        // Prisma "record not found" -> 404
        if (error?.code === "P2025") return json({ error: "Bill not found" }, 404)

        console.error("Flag POST error:", error)
        return json({ error: "Internal Server Error" }, 500)
    }
}

/**
 * DELETE /api/flag
 * - Accepts billId in query (?billId=123) OR JSON body { billId: 123 }
 * Sets isFlagged = false
 */
export async function DELETE(req: NextRequest) {
    try {
        const url = new URL(req.url)

        const queryBillId = toInt(url.searchParams.get("billId"))

        let bodyBillId: number | null = null
        try {
            const body = (await req.json()) as { billId?: unknown }
            if (typeof body.billId === "number" && Number.isInteger(body.billId) && body.billId > 0) {
                bodyBillId = body.billId
            }
        } catch {
            // ignore body parse errors (DELETE may have no body)
        }

        const billId = queryBillId ?? bodyBillId
        if (!billId) return json({ error: "billId is required (query or body)" }, 400)

        const updated = await prisma.bill.update({
            where: { id: billId },
            data: { isFlagged: false },
            select: { id: true, billNumber: true, isFlagged: true },
        })

        return json({
            success: true,
            billId: updated.id,
            billNumber: updated.billNumber,
            isFlag: updated.isFlagged,
            isFlagged: updated.isFlagged,
        })
    } catch (error: any) {
        if (error?.code === "P2025") return json({ error: "Bill not found" }, 404)

        console.error("Flag DELETE error:", error)
        return json({ error: "Internal Server Error" }, 500)
    }
}