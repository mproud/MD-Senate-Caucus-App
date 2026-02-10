import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const isAdminRole = (role: string | undefined) => role === "admin" || role === "super_admin"

const parseNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value)
        return Number.isFinite(n) ? n : null
    }
    return null
}

const parseNullableString = (value: unknown): string | null => {
    if (value === null) return null
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
}

const parseNullableDate = (value: unknown): Date | null => {
    if (value === null || value === undefined) return null
    if (typeof value !== "string") return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d
}

export async function POST(req: Request, { params }: { params: Promise<{ committeeId: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const clerk = await clerkClient()
        const currentUser = await clerk.users.getUser(userId)
        const role = (currentUser.publicMetadata as { role?: string })?.role

        if (!isAdminRole(role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const { committeeId: committeeIdParam } = await params
        const committeeId = Number(committeeIdParam)

        if (!Number.isFinite(committeeId)) {
            return NextResponse.json({ error: "Invalid committeeId" }, { status: 400 })
        }

        const committee = await prisma.committee.findUnique({
            where: { id: committeeId },
            select: { id: true, committeeType: true },
        })

        if (!committee || committee.committeeType !== "CAUCUS") {
            return NextResponse.json({ error: "Not found" }, { status: 404 })
        }

        const rawBody: unknown = await req.json()
        const body =
            rawBody && typeof rawBody === "object"
                ? (rawBody as Record<string, unknown>)
                : {}

        const legislatorId = parseNumber(body.legislatorId)
        const memberRole = parseNullableString(body.role)
        const startDate = parseNullableDate(body.startDate)

        if (!legislatorId) {
            return NextResponse.json({ error: "Invalid legislatorId" }, { status: 400 })
        }

        const openMembership = await prisma.committeeMember.findFirst({
            where: {
                committeeId,
                legislatorId,
                endDate: null,
            },
            select: { id: true },
        })

        if (openMembership) {
            return NextResponse.json(
                { error: "This legislator already has an active membership in this caucus" },
                { status: 409 }
            )
        }

        const created = await prisma.committeeMember.create({
            data: {
                committeeId,
                legislatorId,
                role: memberRole,
                startDate,
                endDate: null,
            },
        })

        return NextResponse.json({ member: created })
    } catch (error) {
        console.error("Failed to add caucus member:", error)
        return NextResponse.json({ error: "Failed to add caucus member" }, { status: 500 })
    }
}
