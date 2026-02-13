import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const GET = async () => {
    const now = new Date()

    const legislators = await prisma.legislator.findMany({
        where: {
            terms: {
                some: {
                    startDate: { lte: now },
                    OR: [
                        { endDate: null },
                        { endDate: { gt: now } }
                    ],
                }
            }
        },
        select: {
            id: true,
            fullName: true,
            firstName: true,
            middleName: true,
            lastName: true,
            party: true,
            district: true,

            terms: {
                select: {
                    chamber: true,
                }
            }
        },
        orderBy: [
            { lastName: "asc" },
            { firstName: "asc" },
        ]
    })

    // Sort legislators alphabetically, Senate first
    const chamberRank = (terms: { chamber: string }[]) => {
        const chamber = terms?.[0]?.chamber
        if (chamber === "SENATE") return 0
        if (chamber === "HOUSE") return 1
        return 2
    }

    // Use this instead of the simple comparison since some people have weird characters
    const collator = new Intl.Collator(undefined, {
        sensitivity: "base"
    })

    legislators.sort((a, b) => {
        const chamberDiff =
            chamberRank(a.terms) - chamberRank(b.terms)

        if (chamberDiff !== 0) return chamberDiff

        const lastNameDiff =
            collator.compare(a.lastName ?? "", b.lastName ?? "")

        if (lastNameDiff !== 0) return lastNameDiff

        return collator.compare(a.firstName ?? "", b.firstName ?? "")
    })

    return NextResponse.json({ legislators })