import { type NextRequest, NextResponse } from "next/server"
import { filterProceedings, getBillsByNumbers } from "@/lib/mock-data"
import type { CalendarItem } from "@/lib/types"

// This doesn't appear to be used for anything
// const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const chambers = searchParams.get("chambers")?.split(",").filter(Boolean) || undefined
        const sections = searchParams.get("sections")?.split(",").filter(Boolean) || undefined
        const startDate = searchParams.get("startDate")
        const endDate = searchParams.get("endDate")
        const voteResults = searchParams.get("voteResults")?.split(",").filter(Boolean) || undefined
        const sponsors = searchParams.get("sponsors")?.split(",").filter(Boolean) || undefined
        const committees = searchParams.get("committees")?.split(",").filter(Boolean) || undefined
        const subjects = searchParams.get("subjects")?.split(",").filter(Boolean) || undefined
        const searchText = searchParams.get("searchText") || undefined

        let dates: string[] | undefined
        if (startDate && endDate) {
            dates = []
            const start = new Date(startDate)
            const end = new Date(endDate)
            const current = new Date(start)

            while (current <= end) {
                dates.push(current.toISOString().split("T")[0])
                current.setDate(current.getDate() + 1)
            }
        } else if (startDate) {
            dates = [startDate]
        } else if (endDate) {
            dates = [endDate]
        }

        const proceedings = filterProceedings(chambers, sections, dates, sponsors, committees, subjects, searchText)

        const allItems: CalendarItem[] = []

        proceedings.forEach((proc) => {
            const bills = getBillsByNumbers(proc.bills)
            const voteResultsMap = (proc as any).voteResults || {}

            bills.forEach((bill) => {
                const voteResult = voteResultsMap[bill.billNumber]

                if (voteResults && voteResults.length > 0) {
                    if (!voteResult || !voteResults.includes(voteResult.result)) {
                        return // Skip this bill if it doesn't match the vote filter
                    }
                }

                if (sponsors && sponsors.length > 0 && !sponsors.includes(bill.sponsor)) {
                    return
                }

                if (committees && committees.length > 0) {
                    const billCommittees = bill.committeeVotes?.map((v) => v.committee) || []
                    if (!committees.some((c) => billCommittees.includes(c))) {
                        return
                    }
                }

                if (subjects && subjects.length > 0) {
                    if (!subjects.some((s) => bill.subjects.includes(s))) {
                        return
                    }
                }

                if (searchText) {
                    const search = searchText.toLowerCase()
                    const matchesSearch =
                        bill.billNumber.toLowerCase().includes(search) ||
                        bill.title.toLowerCase().includes(search) ||
                        bill.synopsis.toLowerCase().includes(search) ||
                        bill.sponsor.toLowerCase().includes(search)
                    if (!matchesSearch) {
                        return
                    }
                }

                allItems.push({
                    id: `${proc.id}-${bill.billNumber}`,
                    billNumber: bill.billNumber,
                    title: bill.title,
                    chamber: proc.chamber as "SENATE" | "HOUSE",
                    section: proc.section as "Second Reading" | "Third Reading",
                    proceedings: proc.time,
                    voteResult: voteResult,
                })
            })
        })

        // Group by date, chamber, and section for display
        const grouped = allItems.reduce(
            (acc, item) => {
                const key = `${item.chamber}-${item.section}`
                if (!acc[key]) {
                    acc[key] = {
                        date: startDate || new Date().toISOString().split("T")[0],
                        chamber: item.chamber,
                        section: item.section,
                        items: [],
                    }
                }
                acc[key].items.push(item)
                return acc
            },
            {} as Record<string, any>,
        )

        // Return the first grouped result (or empty if none)
        const result = Object.values(grouped)[0] || {
            date: startDate || new Date().toISOString().split("T")[0],
            chamber: "SENATE" as const,
            section: "Second Reading" as const,
            items: [],
        }

        return NextResponse.json(result)
    } catch (error) {
        console.error("[v0] Calendar API error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
