import { prisma } from "@/lib/prisma";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
    const { userId } = await auth()
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clerk = await clerkClient()
    const user = await clerk.users.getUser(userId)
    const role = (user.publicMetadata as { role?: string })?.role

    if (role !== "admin" && role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    
    const events = await prisma.billEvent.findMany({
        include: {
            bill: true,
            committee: true,
            floorCalendar: true,
        },
        orderBy: {
            id: "desc"
        },
        take: 100,
    })

    return NextResponse.json({ events })
}