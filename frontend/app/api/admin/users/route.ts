import { NextResponse } from "next/server"
import { clerkClient, auth } from "@clerk/nextjs/server"

export async function GET() {
    try {
        const { userId } = await auth()

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const clerk = await clerkClient()

        const currentUser = await clerk.users.getUser(userId)
        const currentUserRole = (currentUser.publicMetadata as { role?: string })?.role
        const isSuperAdmin = currentUserRole === "super_admin"

        const users = await clerk.users.getUserList({ limit: 100 })

        const filteredUsers = isSuperAdmin
            ? users.data
            : users.data.filter((user) => (user.publicMetadata as { role?: string })?.role !== "super_admin")

        return NextResponse.json({ users: filteredUsers, isSuperAdmin })
    } catch (error) {
        console.error("Failed to fetch users:", error)
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
    }
}
