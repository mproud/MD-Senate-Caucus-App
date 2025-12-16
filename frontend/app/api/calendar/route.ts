// app/api/calendar/route.ts (or wherever this GET lives)
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { CalendarType, Chamber, Prisma } from "@prisma/client"

// Map human section labels to CalendarType enum values in Prisma
function sectionLabelToCalendarType(section: string): CalendarType | undefined {
    const normalized = section.trim().toLowerCase()

    switch (normalized) {
        case "second reading":
            return CalendarType.SECOND_READING
        case "third reading":
            return CalendarType.THIRD_READING
        case "consent":
            return CalendarType.CONSENT
        case "laid over":
            return CalendarType.LAID_OVER
        case "committee":
            return CalendarType.COMMITTEE
        case "committee report":
            return CalendarType.COMMITTEE_REPORT
        case "special order":
            return CalendarType.SPECIAL_ORDER
        default:
            return undefined
    }
}

// Map CalendarType enum back to your section label strings
function calendarTypeToSectionLabel(calendarType: CalendarType): string {
    switch (calendarType) {
        case CalendarType.SECOND_READING:
            return "Second Reading"
        case CalendarType.THIRD_READING:
            return "Third Reading"
        case CalendarType.CONSENT:
            return "Consent"
        case CalendarType.LAID_OVER:
            return "Laid Over"
        case CalendarType.COMMITTEE:
            return "Committee"
        case CalendarType.COMMITTEE_REPORT:
            return "Committee Report"
        case CalendarType.SPECIAL_ORDER:
            return "Special Order"
        default:
            return "Other"
    }
}

export async function GET( request: NextRequest ) {
    // @TODO get and apply search parameters!
    try {
        const calendars = await prisma.floorCalendar.findMany({
            orderBy: {
                calendarDate: 'desc',
            },
            include: {
                committee: true,
                items: {
                    include: {
                        bill: true,
                        committee: true,
                    }
                },
            },
        })

        const response = {
            calendars,
            chamber: 'SENATE', // placeholder
            date: 'today', // placeholder
        }

        return NextResponse.json( response, { status: 200 })
    } catch (error) {
        console.error("Calendar API error:", error)
        
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        )
    }
}

async function legacy___GET(request: NextRequest) {
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

        // Build Prisma where for FloorCalendar
        const where: Prisma.FloorCalendarWhereInput = {}

        if (chambers && chambers.length > 0) {
            const normalizedChambers = chambers
                .map((c) => c.trim().toUpperCase())
                .filter((c): c is "SENATE" | "HOUSE" => c === "SENATE" || c === "HOUSE")

            if (normalizedChambers.length > 0) {
                where.chamber = {
                    in: normalizedChambers as Chamber[],
                }
            }
        }

        if (sections && sections.length > 0) {
            const calendarTypes = sections
                .map(sectionLabelToCalendarType)
                .filter((t): t is CalendarType => !!t)

            if (calendarTypes.length > 0) {
                where.calendarType = { in: calendarTypes }
            }
        }

        if (startDate || endDate) {
            const dateFilter: Prisma.DateTimeFilter = {}

            if (startDate) {
                // Start of the day in local time; adjust to taste / UTC if needed
                dateFilter.gte = new Date(`${startDate}T00:00:00`)
            }

            if (endDate) {
                // End of the day; inclusive
                dateFilter.lte = new Date(`${endDate}T23:59:59.999`)
            }

            where.calendarDate = dateFilter
        }

        console.log('Query', where )

        // Fetch calendars + items + bills + actions in one go
        const calendars = await prisma.floorCalendar.findMany({
            where,
            orderBy: {
                calendarDate: "desc",
            },
            include: {
                items: {
                    include: {
                        bill: {
                            include: {
                                primarySponsor: true,
                                actions: {
                                    include: {
                                        committee: true,
                                    },
                                    orderBy: {
                                        actionDate: "desc",
                                    },
                                },
                            },
                        },
                        committee: true,
                    },
                },
            },
        })

        const allItems: any[] = []

        calendars.forEach((cal) => {
            cal.items.forEach((item) => {
                const bill = item.bill
                if (!bill) return

                // Try to find the latest vote action
                const latestVoteAction = bill.actions.find(
                    (a) => a.isVote && a.voteResult,
                )
                const voteResult = latestVoteAction?.voteResult || null

                // voteResults filter
                if (voteResults && voteResults.length > 0) {
                    if (!voteResult || !voteResults.includes(voteResult)) {
                        return // Skip this bill if it doesn't match the vote filter
                    }
                }

                // sponsors filter (using primarySponsor.fullName or sponsorDisplay)
                if (sponsors && sponsors.length > 0) {
                    const sponsorName =
                        bill.primarySponsor?.fullName || bill.sponsorDisplay || ""
                    if (!sponsors.includes(sponsorName)) {
                        return
                    }
                }

                // committees filter - look at:
                //  - committee on the calendar item
                //  - committees on bill.actions
                if (committees && committees.length > 0) {
                    const billCommittees: string[] = []

                    if (item.committee) {
                        billCommittees.push(
                            item.committee.name,
                            item.committee.abbreviation ?? "",
                        )
                    }

                    bill.actions.forEach((a) => {
                        if (a.committee) {
                            billCommittees.push(
                                a.committee.name,
                                a.committee.abbreviation ?? "",
                            )
                        }
                    })

                    if (
                        !committees.some((c) =>
                            billCommittees.filter(Boolean).includes(c),
                        )
                    ) {
                        return
                    }
                }

                // subjects filter – schema doesn’t have explicit subjects,
                // so approximate by title/synopsis text for now.
                if (subjects && subjects.length > 0) {
                    const subjectText = [
                        bill.shortTitle,
                        bill.longTitle ?? "",
                        bill.synopsis ?? "",
                    ]
                        .join(" ")
                        .toLowerCase()

                    const matchesSubject = subjects.some((s) =>
                        subjectText.includes(s.toLowerCase()),
                    )

                    if (!matchesSubject) {
                        return
                    }
                }

                // searchText filter
                if (searchText) {
                    const search = searchText.toLowerCase()
                    const haystack = [
                        bill.billNumber,
                        bill.shortTitle,
                        bill.longTitle ?? "",
                        bill.synopsis ?? "",
                        bill.sponsorDisplay ?? "",
                        bill.primarySponsor?.fullName ?? "",
                    ]
                        .join(" ")
                        .toLowerCase()

                    if (!haystack.includes(search)) {
                        return
                    }
                }

                allItems.push({
                    id: `${cal.id}-${item.id}`,
                    billNumber: bill.billNumber,
                    title: bill.shortTitle,
                    chamber: cal.chamber as "SENATE" | "HOUSE",
                    section: calendarTypeToSectionLabel(cal.calendarType) as
                        | "Second Reading"
                        | "Third Reading"
                        | string,
                    proceedings: cal.calendarName,
                    voteResult,
                })
            })
        })

        // Group by chamber + section for display (keeping your original grouping logic)
        const grouped = allItems.reduce(
            (acc, item) => {
                const key = `${item.chamber}-${item.section}`
                if (!acc[key]) {
                    acc[key] = {
                        date:
                            startDate ||
                            (calendars[0]?.calendarDate.toISOString().split("T")[0] ??
                                new Date().toISOString().split("T")[0]),
                        chamber: item.chamber,
                        section: item.section,
                        items: [] as typeof allItems,
                    }
                }
                acc[key].items.push(item)
                return acc
            },
            {} as Record<string, any>,
        )

        // Return the first grouped result (or empty if none)
        const result =
            Object.values(grouped)[0] || {
                date:
                    startDate ||
                    new Date().toISOString().split("T")[0],
                chamber: "SENATE" as const,
                section: "Second Reading" as const,
                items: [],
            }

        return NextResponse.json(result)
    } catch (error) {
        console.error("[v0] Calendar API error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        )
    }
}
