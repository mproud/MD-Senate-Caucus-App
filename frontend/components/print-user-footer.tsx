"use client"

import { useUser } from "@clerk/nextjs"

export function PrintUserFooter() {
    const { user } = useUser()

    if (!user) return null

    const userRole = (user?.publicMetadata as { role?: string })?.role
    const isAdmin = userRole === "admin" || userRole === "super_admin"

    const displayName =
        user.fullName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress ||
        "Unknown User"

    return (
        <>
            {(!isAdmin) && (
                <>
                    <div className="print-meta print-watermark" aria-hidden="true" />
                    <div className="print-meta print-user-footer" aria-hidden="true">
                        Printed by {displayName} on {new Date().toLocaleString()}
                    </div>
                </>
            )}
        </>
    )
}
