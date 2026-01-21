export interface ScrapeRun {
    id: number
    kind: string
    source: "LIVE" | "ARCHIVE"
    baseUrl: string | null
    archiveSnapshot: string | null
    startedAt: string
    finishedAt: string | null
    success: boolean
    legislatorsCount: number | null
    committeesCount: number | null
    membershipsCount: number | null
    calendarsCount: number | null
    error: string | null
    metadata: Record<string, unknown> | null
    createdAt: string
    updatedAt: string
}

// Scraper kind definitions
export const scraperKinds = [
    {
        kind: "MGA_BILLS_JSON",
        name: "Fetch bills from MGA's JSON feed",
        description: "",
        endpoint: "sync-bills-from-json",
    },
    {
        kind: "MGA_SENATE_AGENDA",
        name: "Fetch Senate agenda",
        description: "",
        endpoint: "scrape-agendas?chamber=senate",
    },
    {
        kind: "MGA_HOUSE_AGENDA",
        name: "Fetch House agenda",
        description: "",
        endpoint: "scrape-agendas?chamber=house",
    },
    {
        kind: "MGA_LEGISLATOR_COMMITTEES",
        name: "Update legislators & committees",
        description: "",
        endpoint: "legislators-committees",
    },
    {
        kind: "ALERT_SENDER",
        name: "Send Updates & Alerts",
        description: "",
        endpoint: "alert-sender",
    },
] as const

export type ScraperKind = typeof scraperKinds[number]["kind"]

export function getScraperKindLabel(kind: string): string {
    const scraper = scraperKinds.find((s) => s.kind === kind);

    return (
        scraper?.name ??
        kind
            .replaceAll("_", " ")
            .toLowerCase()
            .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    );
}