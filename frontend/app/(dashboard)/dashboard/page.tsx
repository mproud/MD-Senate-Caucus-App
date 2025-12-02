import type { Metadata } from "next"
import { DashboardContent } from "./dashboard-content"

export const metadata: Metadata = {
    title: "Dashboard",
}

// Move this into an ENV config
const currentSession = '2025RS'

export default function DashboardPage() {
    return (
        <>
            <div className="mb-8">
                <h1 className="text-4xl font-bold tracking-tight text-balance">Maryland General Assembly Tracker</h1>

                <p className="mt-2 text-lg text-muted-foreground">
                    Track legislative calendars, bills, and alerts for the {currentSession} session
                </p>
            </div>

            <DashboardContent />
        </>
    )
}
