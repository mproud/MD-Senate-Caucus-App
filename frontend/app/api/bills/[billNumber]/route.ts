import { type NextRequest, NextResponse } from "next/server"
import { getBillByNumber } from "@/lib/mock-data"

export async function GET(request: NextRequest, { params }: { params: Promise<{ billNumber: string }> }) {
    try {
        const { billNumber } = await params

        const bill = getBillByNumber(billNumber)

        if (!bill) {
            return NextResponse.json({ error: "Bill not found" }, { status: 404 })
        }

        return NextResponse.json(bill)
    } catch (error) {
        console.error("[v0] Bill API error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
