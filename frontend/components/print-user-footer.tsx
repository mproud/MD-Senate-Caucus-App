"use client"

import { useUser } from "@clerk/nextjs"

export function PrintUserFooter() {
    const { user } = useUser()

    if (!user) return null

    const displayName =
        user.fullName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress ||
        "Unknown User"

    return (
        <>
            <div className="print-meta print-watermark" aria-hidden="true" />
            <div className="print-meta print-user-footer" aria-hidden="true">
                Printed by {displayName} on {new Date().toLocaleString()}
            </div>
        </>
    )
}
