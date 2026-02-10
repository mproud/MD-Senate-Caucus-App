import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { Chamber } from "@prisma/client"

const isAdminRole = (role: string | undefined) => role === "admin" || role === "super_admin"

const getString = (value: unknown): string | null => {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
}

const getNullableString = (value: unknown): string | null => {
    if (value === null) return null
    return getString(value)
}

const parseNullableChamber = (value: unknown): Chamber | null => {
    if (value === null) return null
    if (typeof value !== "string") return null

    switch (value) {
        case "HOUSE":
            return Chamber.HOUSE
        case "SENATE":
            return Chamber.SENATE
        case "JOINT":
            return Chamber.JOINT
        default:
            return null
    }
}

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const clerk = await clerkClient()
        const currentUser = await clerk.users.getUser(userId)
        const role = (currentUser.publicMetadata as { role?: string })?.role

        if (!isAdminRole(role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const committees = await prisma.committee.findMany({
            where: { committeeType: "CAUCUS" },
            orderBy: [{ name: "asc" }],
            include: {
                members: {
                    include: {
                        legislator: true,
                    },
                    orderBy: [
                        { endDate: "asc" },
                        { startDate: "desc" },
                        { id: "desc" },
                    ],
                },
            },
        })

        return NextResponse.json({ committees })
    } catch (error) {
        console.error("Failed to fetch caucus committees:", error)
        return NextResponse.json({ error: "Failed to fetch caucus committees" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const clerk = await clerkClient()
        const currentUser = await clerk.users.getUser(userId)
        const role = (currentUser.publicMetadata as { role?: string })?.role

        if (!isAdminRole(role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const rawBody: unknown = await req.json()
        const body =
            rawBody && typeof rawBody === "object"
                ? (rawBody as Record<string, unknown>)
                : {}

        const name = getString(body.name)
        const abbreviation = getNullableString(body.abbreviation)
        const chamber = parseNullableChamber(body.chamber)

        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 })
        }

        const committee = await prisma.committee.create({
            data: {
                name,
                abbreviation,
                chamber,
                committeeType: "CAUCUS",
            },
        })

        return NextResponse.json({ committee })
    } catch (error) {
        console.error("Failed to create caucus committee:", error)
        return NextResponse.json({ error: "Failed to create caucus committee" }, { status: 500 })
    }
}
