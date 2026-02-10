import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const isAdminRole = (role: string | undefined) => role === "admin" || role === "super_admin"

export async function GET(req: Request) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const clerk = await clerkClient()
        const currentUser = await clerk.users.getUser(userId)
        const role = (currentUser.publicMetadata as { role?: string })?.role

        if (!isAdminRole(role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const query = String(searchParams.get("query") || "").trim()

        if (query.length < 2) {
            return NextResponse.json({ legislators: [] })
        }

        const legislators = await prisma.legislator.findMany({
            where: {
                fullName: { contains: query, mode: "insensitive" },
            },
            orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
            take: 25,
            select: {
                id: true,
                fullName: true,
                party: true,
                district: true,
                isActive: true,
            },
        })

        return NextResponse.json({ legislators })
    } catch (error) {
        console.error("Failed to search legislators:", error)
        return NextResponse.json({ error: "Failed to search legislators" }, { status: 500 })
    }
}
