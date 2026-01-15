import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { getActiveSessionCode } from "@/lib/get-active-session"

function normalizeBillIdentifier(raw: string): {
    billType: string
    billNumberNumeric: number
    canonicalBillNumber: string // e.g. HB0018
} | null {
    // Trim, remove spaces, allow HB-18 / HB_18 / HB 18 / HB0018
    const cleaned = raw.trim().toUpperCase().replace(/[\s_-]+/g, "")

    // Expect: letters then digits
    const match = cleaned.match(/^([A-Z]+)(\d+)$/)
    if (!match) return null

    const billType = match[1]
    const num = Number.parseInt(match[2], 10)
    if (!Number.isFinite(num) || num <= 0) return null

    // Canonical formatting used by many MGA feeds is zero-padded to 4 digits
    const canonicalBillNumber = `${billType}${String(num).padStart(4, "0")}`

    return { billType, billNumberNumeric: num, canonicalBillNumber }
}

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await context.params
        const activeSessionCode = await getActiveSessionCode()

        const parsed = normalizeBillIdentifier(billNumber)
        if (!parsed) {
            return NextResponse.json(
                { error: "Invalid bill number format. Example: HB18 or HB0018" },
                { status: 400 }
            )
        }

        const { billType, billNumberNumeric, canonicalBillNumber } = parsed

        // Try to find the bill by:
        // 1) exact billNumber match (either user-provided normalized or canonical)
        // 2) billType + billNumberNumeric
        const bill = await prisma.bill.findFirst({
            where: {
                sessionCode: activeSessionCode,
                OR: [
                    { billNumber: canonicalBillNumber },
                    { billNumber: billType + String(billNumberNumeric) }, // just in case it's stored "HB18" in billNumber
                    {
                        billType: billType as any, // cast if billType is an enum otherwise remove "as any"
                        billNumberNumeric,
                    },
                ],
            } as Prisma.BillWhereInput,
            include: {
                primarySponsor: true,
                events: true,
                notes: {
                    include: {
                        user: true,
                    }
                },
                crossFileBill: true,
                crossFileOf: true,
                committeeHistory: true,
                currentCommittee: {
                    include: {
                        committee: true,
                    }
                },
                actions: {
                    include: {
                        committee: true,
                    },
                    orderBy: {
                        actionDate: "desc",
                    },
                },
                // Add other includes here @TODO
            },
        })

        if (!bill) {
            return NextResponse.json(
                { error: `Bill not found for ${billType}${billNumberNumeric}` },
                { status: 404 }
            )
        }

        return NextResponse.json(bill, { status: 200 })
    } catch (error) {
        console.error("[bills/[billNumber]] error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
