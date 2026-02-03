import { UserSettingsPageContent } from "./user-page-content"

export default async function UserSettingsPage({ searchParams }: { searchParams: Promise<{ activeTab?: string }> }) {
    const { activeTab } = await searchParams

    return (
        <UserSettingsPageContent activeTab={activeTab} />
    )
}