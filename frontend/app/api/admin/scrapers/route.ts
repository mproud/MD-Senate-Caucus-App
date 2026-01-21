import { NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { getAllScrapeRuns, getLatestScrapeRun, getScrapeRunsByKind } from "@/lib/scraper"
import { type ScrapeRun, scraperKinds } from "@/lib/scraper-client"
import { prisma } from "@/lib/prisma"

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const clerk = await clerkClient()
        const user = await clerk.users.getUser(userId)
        const role = (user.publicMetadata as { role?: string })?.role

        if (role !== "admin" && role !== "super_admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        // Specific...

        const allRuns = await getAllScrapeRuns()
        
        // Build a map of latest run by kind
        const latestByKind = new Map<string, Awaited<ReturnType<typeof getLatestScrapeRun>>>()

        for (const scraper of scraperKinds) {
            const latestRun = await getLatestScrapeRun(scraper.kind)
            latestByKind.set(scraper.kind, latestRun)
        }

        // Build summary for each scraper kind
        const scraperSummaries = scraperKinds.map((scraper) => {
            const latestRun = latestByKind.get(scraper.kind)
            const allKindRuns = allRuns.filter((r) => r.kind === scraper.kind)

            return {
                ...scraper,
                latestRun,
                totalRuns: allKindRuns.length,
                successRate:
                    allKindRuns.length > 0
                    ? Math.round((allKindRuns.filter((r) => r.success).length / allKindRuns.length) * 100)
                    : 0,
                }
        })

        return NextResponse.json({
            scrapers: scraperSummaries,
            recentRuns: allRuns.slice(0, 20),
        })
    } catch (error) {
        console.error("Failed to fetch scrapers:", error)
        return NextResponse.json({ error: "Failed to fetch scrapers" }, { status: 500 })
    }
}

// Trigger a scraper run (mock implementation @TODO)
export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const clerk = await clerkClient()
        const user = await clerk.users.getUser(userId)
        const role = (user.publicMetadata as { role?: string })?.role

        if (role !== "admin" && role !== "super_admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        // Specific

        const body: { kind?: string } = await request.json()
        const { kind } = body

        if ( ! kind ) {
            return NextResponse.json({ error: "Scraper kind is required" }, { status: 400 })
        }

        // Map the kind of scraper to the endpoint
        // Trigger the endpoint

        // In a real implementation, this would trigger the scraper
        // For now, we just return a mock response
        return NextResponse.json({
            message: `Scraper ${kind} triggered successfully`,
            run: {
                id: Date.now(),
                kind: `${kind} -- ${JSON.stringify(body)}`,
                source: "LIVE",
                startedAt: new Date().toISOString(),
                finishedAt: null,
                success: false,
            } as Partial<ScrapeRun>,
        })
    } catch (error) {
        console.error("Failed to trigger scraper:", error)
        return NextResponse.json({ error: "Failed to trigger scraper" }, { status: 500 })
    }
}
