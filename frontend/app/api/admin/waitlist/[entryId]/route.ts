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

// Approve a waitlist entry (invite them)
export async function POST(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
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

        const { entryId } = await params
        const body = (await request.json()) as { role?: string }
        const { role = "member" } = body

        const listResponse = await fetch("https://api.clerk.com/v1/waitlist_entries?limit=100", {
            headers: {
                Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        })

        if (!listResponse.ok) {
            throw new Error(`Clerk API error: ${listResponse.status}`)
        }

        const listData = (await listResponse.json()) as WaitlistListResponse
        const entry = listData.data?.find((e) => e.id === entryId)

        if (!entry) {
            return NextResponse.json({ error: "Waitlist entry not found" }, { status: 404 })
        }

        // Create an invitation for this email using the SDK
        const invitation = await clerk.invitations.createInvitation({
            emailAddress: entry.email_address,
            publicMetadata: { role },
            // redirectUrl: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL || "/",
        })

        return NextResponse.json({
            success: true,
            invitation: {
                id: invitation.id,
                emailAddress: invitation.emailAddress,
                status: invitation.status,
            },
        })
    } catch (error) {
        console.error("Failed to approve waitlist entry:", error)
        return NextResponse.json({ error: "Failed to approve waitlist entry" }, { status: 500 })
    }
}

// Remove from waitlist (deny access)
export async function DELETE(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
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

        const { entryId } = await params

        const response = await fetch(`https://api.clerk.com/v1/waitlist_entries/${entryId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        })

        if (!response.ok) {
            throw new Error(`Clerk API error: ${response.status}`)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to remove waitlist entry:", error)
        return NextResponse.json({ error: "Failed to remove waitlist entry" }, { status: 500 })
    }
}
