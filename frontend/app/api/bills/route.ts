import { type NextRequest, NextResponse } from "next/server"
// import { activeSessionCode } from "@/lib/config"
import { prisma } from "@/lib/prisma"
import { Chamber, type Prisma } from "@prisma/client"

function parseChamber(input: string): Chamber | undefined {
    const trimmed = input.trim()
    if (!trimmed) return undefined

    // Match case-insensitively against the enum values
    return (Object.values(Chamber) as string[]).find(
        (v) => v.toLowerCase() === trimmed.toLowerCase(),
    ) as Chamber | undefined
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)

    // Get the active session code from the settings DB
    const setting = await prisma.settings.findUnique({
        where: {
            name: 'activeSessionCode'
        },
        select: {
            value: true,
        }
    })

    const activeSessionCode = setting?.value

    if (!activeSessionCode) {
        return NextResponse.json(
            { error: "activeSessionCode is not set" },
            { status: 400 }
        )
    }

    const q = searchParams.get("q")?.toLowerCase() || ""
    const chamberParam = searchParams.get("chamber") || ""
    const committee = searchParams.get("committee") || ""
    const sponsor = searchParams.get("sponsor") || ""
    const subject = searchParams.get("subject") || ""
    const status = searchParams.get("status") || ""
    const page = Number.parseInt(searchParams.get("page") || "1", 10)
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "20", 10)

    const chamber = parseChamber(chamberParam)

    const and: Prisma.BillWhereInput[] = [
        { sessionCode: activeSessionCode },
    ]

    if (q) {
        and.push({
            OR: [
                { billNumber: { contains: q, mode: "insensitive" } },
                { shortTitle: { contains: q, mode: "insensitive" } },
                { longTitle: { contains: q, mode: "insensitive" } },
                { synopsis: { contains: q, mode: "insensitive" } },
            ],
        })
    }

    if (chamber) {
        // enum match (no `mode`)
        and.push({ chamber })
    }

    if (status) {
        // This is just a string for now, search
        and.push({ statusDesc: { contains: status, mode: "insensitive" } })
        
        // To use the machine status code instead...
        // and.push({ statusCode: { equals: status } })
    }

    if (committee) {
        and.push({
            currentCommittee: {
                is: {
                    committee: {
                        is: {
                            OR: [
                                { name: { contains: committee, mode: "insensitive" } },
                                { abbreviation: { equals: committee, mode: "insensitive" } },
                            ],
                        },
                    },
                },
            },
        })
    }

    if (sponsor) {
        // You have sponsorDisplay + primarySponsor relation.
        // Replace `fullName` with actual Legislator fields (maybe firstName/lastName).
        and.push({
            OR: [
                { sponsorDisplay: { contains: sponsor, mode: "insensitive" } },
                {
                    primarySponsor: {
                        is: {
                            fullName: { contains: sponsor, mode: "insensitive" },
                        },
                    },
                },
            ],
        })
    }

    const where: Prisma.BillWhereInput = and.length ? { AND: and } : {}

    const skip = (page - 1) * pageSize
    const take = pageSize

    const [ total, bills ] = await Promise.all([
        prisma.bill.count({ where }),
        prisma.bill.findMany({
            where,
            skip,
            take,
            orderBy: [
                { chamber: "asc" },
                { billType: "asc" },
                { billNumberNumeric: "asc" },
            ],
            include: {
                currentCommittee: {
                    include: {
                        committee: true,
                    },
                },
                primarySponsor: true
            }
        }),
    ])

    const totalPages = Math.ceil(total / pageSize)

    return NextResponse.json({
        bills,
        total,
        page,
        pageSize,
        totalPages,
    })
}
