import type { Metadata } from "next"
import { AdminContent } from "./admin-content"

export const metadata: Metadata = {
    title: "Admin",
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ activeTab?: string }> }) {
    const { activeTab } = await searchParams

    return (
        <>
            <AdminContent activeTab={activeTab} />
        </>
    )
}
