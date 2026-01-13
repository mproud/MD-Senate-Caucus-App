import type { Metadata } from "next"
import { DashboardContent } from "./dashboard-content"
import { getActiveSessionCode } from "@/lib/get-active-session"

export const metadata: Metadata = {
    title: "Dashboard",
}


export default async function DashboardPage() {
    const activeSessionCode = await getActiveSessionCode()
    return (
        <>
            <div className="mb-8">
                <h1 className="text-4xl font-bold tracking-tight text-balance">Maryland General Assembly Tracker</h1>

                <p className="mt-2 text-lg text-muted-foreground">
                    Track legislative calendars, bills, and alerts for the {activeSessionCode} session
                </p>
            </div>

            <DashboardContent />
        </>
    )
}
