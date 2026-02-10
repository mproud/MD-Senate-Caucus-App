import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const isAdminRole = (role: string | undefined) => role === "admin" || role === "super_admin"

const parseDate = (value: unknown): Date | null => {
    if (value === null || value === undefined) return null
    if (typeof value !== "string") return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ committeeId: string, memberId: string }> }
) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const clerk = await clerkClient()
        const currentUser = await clerk.users.getUser(userId)
        const role = (currentUser.publicMetadata as { role?: string })?.role

        if (!isAdminRole(role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const { committeeId: committeeIdParam, memberId: memberIdParam } = await params
        const committeeId = Number(committeeIdParam)
        const memberId = Number(memberIdParam)

        if (!Number.isFinite(committeeId) || !Number.isFinite(memberId)) {
            return NextResponse.json({ error: "Invalid params" }, { status: 400 })
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

        const endDate = parseDate(body.endDate)

        if (!endDate) {
            return NextResponse.json({ error: "endDate is required" }, { status: 400 })
        }

        const membership = await prisma.committeeMember.findUnique({
            where: { id: memberId },
            select: { id: true, committeeId: true, endDate: true },
        })

        if (!membership || membership.committeeId !== committeeId) {
            return NextResponse.json({ error: "Not found" }, { status: 404 })
        }

        if (membership.endDate) {
            return NextResponse.json({ error: "Membership is already ended" }, { status: 409 })
        }

        const updated = await prisma.committeeMember.update({
            where: { id: memberId },
            data: { endDate },
        })

        return NextResponse.json({ member: updated })
    } catch (error) {
        console.error("Failed to update caucus member:", error)
        return NextResponse.json({ error: "Failed to update caucus member" }, { status: 500 })
    }
}
