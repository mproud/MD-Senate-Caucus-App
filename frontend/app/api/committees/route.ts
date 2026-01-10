import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

type Chamber = "SENATE" | "HOUSE" | null

export async function GET( request: Request ) {
    try {
        const { searchParams } = new URL( request.url )
        const chamberParam = searchParams.get("chamber")?.toLowerCase()

        
        const chamberFilter: Exclude<Chamber, null> | undefined =
            chamberParam === "senate"
                ? "SENATE"
                : chamberParam === "house"
                    ? "HOUSE"
                    : undefined

        const committees = await prisma.committee.findMany({
            select: {
                id: true,
                chamber: true,
                abbreviation: true,
                name: true,
                committeeType: true,
            },
            orderBy: {
                chamber: 'desc',
            },
            // Filter only when chamber is provided and valid
            where: chamberFilter ? { chamber: chamberFilter } : undefined,
        })

        function chamberRank(chamber: string | null): number {
            switch (chamber) {
                case "SENATE":
                    return 0
                case "HOUSE":
                    return 1
                default:
                    return 2 // null or anything else
            }
        }

        function committeeTypeRank(type: string | null): number {
            return type === "STANDING" ? 0 : 1
        }

        const sortedCommittees = committees.sort((a, b) => {
            // Order Senate, then House, then Other/Joint
            const chamberDiff = chamberRank(a.chamber) - chamberRank(b.chamber)
            if (chamberDiff !== 0) return chamberDiff

            // Make sure standing committees are first
            const typeDiff =
                committeeTypeRank(a.committeeType) -
                committeeTypeRank(b.committeeType)
            if (typeDiff !== 0) return typeDiff

            return a.name.localeCompare(b.name)
        })


        return NextResponse.json(
            {
                committees: sortedCommittees
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("Committee API error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}