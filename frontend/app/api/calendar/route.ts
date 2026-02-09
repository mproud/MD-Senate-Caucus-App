import { NextRequest, NextResponse } from "next/server"
import { Prisma, CalendarType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { tree } from "next/dist/build/templates/app-page"
import { getActiveSessionCode } from "@/lib/get-system-setting"

function isValidIsoDateOnly(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function parseBool(v: string | null, defaultValue = false) {
    if (v === null) return defaultValue
    return v === "true" || v === "1" || v === "yes"
}

function parseCsv(param: string | null) {
    return (param ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
}

// Narrow UI ids to a known set
type CalendarFilterId = "first" | "second" | "third" | "special" | "laid_over" | "vetoed"

// Map UI filter ids -> Prisma CalendarType enum values
const UI_ID_TO_CALENDAR_TYPE: Record<CalendarFilterId, CalendarType> = {
    first: CalendarType.FIRST_READING,
    second: CalendarType.COMMITTEE_REPORT,
    third: CalendarType.THIRD_READING,
    special: CalendarType.SPECIAL_ORDER,
    laid_over: CalendarType.LAID_OVER,
    vetoed: CalendarType.VETOED,
}

function isCalendarFilterId(v: string): v is CalendarFilterId {
    return (
        v === "first" ||
        v === "second" ||
        v === "third" ||
        v === "special" ||
        v === "laid_over" ||
        v === "vetoed"
    )
}

function mapHiddenIdsToTypes(hiddenIds: string[]): CalendarType[] {
    const types: CalendarType[] = []

    for (const id of hiddenIds) {
        if (!isCalendarFilterId(id)) continue
        types.push(UI_ID_TO_CALENDAR_TYPE[id])
    }

    return Array.from(new Set(types))
}

// Treat incoming YYYY-MM-DD as UTC day boundary.
// @TODO: adjust for America/New_York if your DB stores "local day" semantics.
function rangeUtc(startDateOnly: string, endDateOnly: string) {
    const start = new Date(`${startDateOnly}T00:00:00.000Z`)
    const end = new Date(`${endDateOnly}T23:59:59.999Z`)
    return { start, end }
}

// @TODO: may need to handle absent/excused/not voting, etc
function isUnanimousVoteAction(action: {
    yesVotes: number | null
    noVotes: number | null
    excused: number | null
    notVoting: number | null
    voteResult: string | null
} | null | undefined) {
    if (!action) return false

    if (
        action.yesVotes === null &&
        action.noVotes === null &&
        action.excused === null &&
        action.notVoting === null
    ) {
        const vr = (action.voteResult ?? "").toLowerCase()
        return vr.includes("unanim")
    }

    const yes = action.yesVotes ?? 0
    const no = action.noVotes ?? 0
    const excused = action.excused ?? 0
    const notVoting = action.notVoting ?? 0

    return yes > 0 && no === 0 && excused === 0 && notVoting === 0
}

function normalizeOutcome(s: string | null | undefined) {
    return (s ?? "").trim().toLowerCase()
}

function isHiddenOutcomeText(voteResultOrDesc: string | null | undefined) {
    const t = normalizeOutcome(voteResultOrDesc)
    if (!t) return false

    // Catch common variants
    return (
        t.includes("unfavorable") ||
        t === "unfav" ||
        t.includes("withdrawn") ||
        t.includes("withdraw") // covers "Withdrawn", "Withdrawn by Sponsor", etc.
    )
}

function getMostRelevantOutcomeForCalendar(bill: any): string | null {
    // 1) Prefer current committee lastVoteAction
    const lastVote = bill?.currentCommittee?.lastVoteAction
    const lastVoteText =
        lastVote?.voteResult ??
        lastVote?.description ??
        lastVote?.result ??
        null

    if (lastVoteText) return lastVoteText

    // 2) Otherwise use latest action (already ordered desc in your query)
    const latest = bill?.actions?.[0]
    const latestText =
        latest?.voteResult ??
        latest?.description ??
        latest?.result ??
        null

    return latestText ?? null
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = request.nextUrl

        const startDateParam = searchParams.get("startDate")
        const endDateParam = searchParams.get("endDate")

        // (optional) single-day param
        const dateParam = searchParams.get("date")

        const hideUnanimous = parseBool(searchParams.get("hideUnanimous"), false)
        const flaggedOnly = parseBool(searchParams.get("flaggedOnly"), false)

        // If not provided, default-hide first reading
        const hideCalendarsParam = searchParams.get("hideCalendars")
        // Only apply default if the param is missing (null), not if it's present-but-empty ("")
        const hiddenIds = hideCalendarsParam === null ? ["first"] : parseCsv(hideCalendarsParam)
        // const hiddenIds =
        //     hideCalendarsParam && hideCalendarsParam.trim().length > 0
        //         ? parseCsv(hideCalendarsParam)
        //         : ["first"]

        const hiddenTypes = mapHiddenIdsToTypes(hiddenIds)

        // Decide effective date range
        const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

        let startDateOnly: string
        let endDateOnly: string

        if (
            startDateParam &&
            endDateParam &&
            isValidIsoDateOnly(startDateParam) &&
            isValidIsoDateOnly(endDateParam)
        ) {
            startDateOnly = startDateParam
            endDateOnly = endDateParam
        } else {
            const single =
                dateParam && isValidIsoDateOnly(dateParam) ? dateParam : today
            startDateOnly = single
            endDateOnly = single
        }

        // If someone passes them reversed, normalize
        if (startDateOnly > endDateOnly) {
            ;[startDateOnly, endDateOnly] = [endDateOnly, startDateOnly]
        }

        const { start, end } = rangeUtc(startDateOnly, endDateOnly)

        const activeSessionCode = await getActiveSessionCode()

        const where: Prisma.FloorCalendarWhereInput = {
            calendarDate: { gte: start, lte: end },
            chamber: "SENATE",
            sessionCode: activeSessionCode,
        }

        if (hiddenTypes.length > 0) {
            where.calendarType = { notIn: hiddenTypes }
        }

        const calendars = await prisma.floorCalendar.findMany({
            where,
            orderBy: [
                { calendarDate: "desc" },
            ],
            include: {
                committee: true,
                items: {
                    include: {
                        committee: true,
                        bill: {
                            select: {
                                id: true,
                                billNumber: true,
                                shortTitle: true,
                                longTitle: true,
                                synopsis: true,
                                sponsorDisplay: true,
                                crossFileExternalId: true,
                                isFlagged: true,

                                currentCommittee: {
                                    include: {
                                        committee: true,

                                        lastVoteAction: {
                                            select: {
                                                id: true,
                                                committeeId: true,
                                                source: true,
                                                voteResult: true,
                                                yesVotes: true,
                                                noVotes: true,
                                                absent: true,
                                                excused: true,
                                                notVoting: true,
                                            },
                                        },
                                    },
                                },

                                actions: {
                                    orderBy: [{ actionDate: "desc" }, { sequence: "desc" }],
                                    // select: {
                                    //     id: true,
                                    //     chamber: true,
                                    //     actionCode: true,
                                    //     committeeId: true,
                                    //     source: true,
                                    //     voteResult: true,
                                    //     yesVotes: true,
                                    //     noVotes: true,
                                    //     absent: true,
                                    //     excused: true,
                                    //     notVoting: true,
                                    // },
                                },

                                votes: {
                                    include: {
                                        legislator: true,
                                    },
                                },

                                events: true,
                                notes: true,
                            },
                        },
                    },
                },
            },
        })

        const filteredCalendars = calendars
            .map((cal) => {
                const items = cal.items.filter((item) => {
                    const bill = item.bill
                    if (!bill) return true

                    if (flaggedOnly && !bill.isFlagged) return false

                    // Hide withdrawn or unfavorable bills
                    const outcome = getMostRelevantOutcomeForCalendar(bill)
                    if (isHiddenOutcomeText(outcome)) return false

                    if (hideUnanimous) {
                        const latestVote = bill.actions?.[0]
                        if (isUnanimousVoteAction(latestVote)) return false
                    }

                    return true
                })

                return { ...cal, items }
            })
            .filter((cal) => cal.items.length > 0)

        return NextResponse.json(
            {
                calendars: filteredCalendars,
                startDate: startDateOnly,
                endDate: endDateOnly,
                hideUnanimous,
                flaggedOnly,
                hideCalendars: hiddenIds.join(","),
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("Calendar API error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}





        // Existing
        /*
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
        */
/*
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
*/