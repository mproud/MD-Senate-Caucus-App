import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"

export async function DELETE(request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
    try {
        const { userId } = await auth()

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { invitationId } = await params
        const clerk = await clerkClient()

        await clerk.invitations.revokeInvitation(invitationId)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to revoke invitation:", error)
        return NextResponse.json({ error: "Failed to revoke invitation" }, { status: 500 })
    }
}
