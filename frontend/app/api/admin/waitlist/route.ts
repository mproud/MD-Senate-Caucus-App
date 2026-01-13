import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"

interface WaitlistEntry {
    id: string
    email_address: string
    status: string
    created_at: number
}

interface WaitlistListResponse {
    data: WaitlistEntry[]
    total_count: number
}

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const clerk = await clerkClient()
        const currentUser = await clerk.users.getUser(userId)
        const userRole = (currentUser.publicMetadata as { role?: string })?.role

        if (userRole !== "admin" && userRole !== "super_admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const response = await fetch("https://api.clerk.com/v1/waitlist_entries?limit=100", {
            headers: {
                Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        })

        if (!response.ok) {
            throw new Error(`Clerk API error: ${response.status}`)
        }

        const data = (await response.json()) as WaitlistListResponse

        return NextResponse.json({
            entries:
                data.data?.map((entry: { id: string; email_address: string; status: string; created_at: number }) => ({
                    id: entry.id,
                    emailAddress: entry.email_address,
                    status: entry.status,
                    createdAt: entry.created_at,
                })) || [],
        })
    } catch (error) {
        console.error("Failed to fetch waitlist entries:", error)
        return NextResponse.json({ error: "Failed to fetch waitlist entries" }, { status: 500 })
    }
}
