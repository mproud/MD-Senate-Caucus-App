import { type NextRequest, NextResponse } from "next/server"
// import { activeSessionCode } from "@/lib/config"
import { prisma } from "@/lib/prisma"
import { Chamber, Prisma } from "@prisma/client"

function parseChamber(input: string): Chamber | undefined {
    const trimmed = input.trim()
    if (!trimmed) return undefined

    // Match case-insensitively against the enum values
    return (Object.values(Chamber) as string[]).find(
        (v) => v.toLowerCase() === trimmed.toLowerCase(),
    ) as Chamber | undefined
}

function parseBillQuery(raw: string):
    | { kind: "billNumber"; billNumber: string }
    | { kind: "typeAndNumber"; billType: string; billNumberNumeric: number; paddedBillNumber?: string }
    | null {
    const s = raw.trim()
    if (!s) return null

    // Normalize: remove spaces, dashes, underscores between type and digits
    // Examples:
    // "HB 1" -> "HB1"
    // "hb-0001" -> "hb0001"
    const compact = s.replace(/[\s\-_]+/g, "")

    // Match: letters (billType) + digits (number)
    const m = compact.match(/^([a-z]+)(\d+)$/i)
    if (!m) return null

    const billType = m[1].toUpperCase()
    const digits = m[2]
    const billNumberNumeric = Number.parseInt(digits, 10)
    if (!Number.isFinite(billNumberNumeric)) return null

    // If user typed leading zeros, they may be intending the full billNumber formatting too.
    // Example: HB0001 -> padded digits exist.
    const paddedBillNumber = digits.length > 1 && digits.startsWith("0")
        ? `${billType}${digits}`
        : undefined

    // If they provided BOTH type and digits, we can treat it as type+number.
    // Additionally, we can optionally also match billNumber equals padded form.
    return { kind: "typeAndNumber", billType, billNumberNumeric, paddedBillNumber }
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

    // Replaced this with handling HB1 or HB0001 below
    // if (q) {
    //     and.push({
    //         OR: [
    //             { billNumber: { contains: q, mode: "insensitive" } },
    //             { shortTitle: { contains: q, mode: "insensitive" } },
    //             { longTitle: { contains: q, mode: "insensitive" } },
    //             { synopsis: { contains: q, mode: "insensitive" } },
    //         ],
    //     })
    // }

    if (q) {
        const billQ = parseBillQuery(q)

        if (billQ?.kind === "typeAndNumber") {
            and.push({
                OR: [
                    // The structured match: HB + 1
                    {
                        AND: [
                            { billType: { equals: billQ.billType, mode: "insensitive" } },
                            { billNumberNumeric: { equals: billQ.billNumberNumeric } },
                        ],
                    },

                    // If user typed HB0001, also allow matching the formatted billNumber directly
                    ...(billQ.paddedBillNumber
                        ? [{ billNumber: { equals: billQ.paddedBillNumber } }]
                        : []),

                    // Still allow text search so "HB 1 school" works (optional, keep if you want)
                    { shortTitle: { contains: q, mode: "insensitive" } },
                    { longTitle: { contains: q, mode: "insensitive" } },
                    { synopsis: { contains: q, mode: "insensitive" } },
                ],
            })
        } else {
            // Default: text-ish search
            and.push({
                OR: [
                    { billNumber: { contains: q, mode: "insensitive" } },
                    { shortTitle: { contains: q, mode: "insensitive" } },
                    { longTitle: { contains: q, mode: "insensitive" } },
                    { synopsis: { contains: q, mode: "insensitive" } },
                ],
            })
        }
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
