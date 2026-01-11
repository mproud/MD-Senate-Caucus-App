import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    try {
        const { userId: currentUserId } = await auth()

        if (!currentUserId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { userId } = await params
        const clerk = await clerkClient()

        const currentUser = await clerk.users.getUser(currentUserId)
        const currentUserRole = (currentUser.publicMetadata as { role?: string })?.role
        const isSuperAdmin = currentUserRole === "super_admin"

        const targetUser = await clerk.users.getUser(userId)
        const targetUserRole = (targetUser.publicMetadata as { role?: string })?.role

        // Prevent regular admins from deleting super admins
        if (targetUserRole === "super_admin" && !isSuperAdmin) {
            return NextResponse.json({ error: "Cannot delete super admin" }, { status: 403 })
        }

        await clerk.users.deleteUser(userId)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to delete user:", error)
        return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    try {
        const { userId: currentUserId } = await auth()

        if (!currentUserId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { userId } = await params
        const body = (await request.json()) as { role: string }
        const clerk = await clerkClient()

        const currentUser = await clerk.users.getUser(currentUserId)
        const currentUserRole = (currentUser.publicMetadata as { role?: string })?.role
        const isSuperAdmin = currentUserRole === "super_admin"

        const targetUser = await clerk.users.getUser(userId)
        const targetUserRole = (targetUser.publicMetadata as { role?: string })?.role

        // Prevent regular admins from modifying super admins
        if (targetUserRole === "super_admin" && !isSuperAdmin) {
            return NextResponse.json({ error: "Cannot modify super admin" }, { status: 403 })
        }

        // Prevent regular admins from assigning super_admin role
        if (body.role === "super_admin" && !isSuperAdmin) {
            return NextResponse.json({ error: "Cannot assign super admin role" }, { status: 403 })
        }

        await clerk.users.updateUserMetadata(userId, {
            publicMetadata: { role: body.role },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to update user:", error)
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
    }
}
