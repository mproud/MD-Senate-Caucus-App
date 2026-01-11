import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"

export async function GET() {
    try {
        const { userId } = await auth()

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const clerk = await clerkClient()
        const invitations = await clerk.invitations.getInvitationList({ limit: 100 })

        return NextResponse.json({ invitations: invitations.data })
    } catch (error) {
        console.error("Failed to fetch invitations:", error)
        return NextResponse.json({ error: "Failed to fetch invitations" }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const { userId } = await auth()

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = (await request.json()) as { email: string; role: string }
        const clerk = await clerkClient()

        const invitation = await clerk.invitations.createInvitation({
            emailAddress: body.email,
            publicMetadata: { role: body.role },
            redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/sign-up`,
        })

        return NextResponse.json({ invitation })
    } catch (error) {
        console.error("Failed to create invitation:", error)
        return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 })
    }
}
