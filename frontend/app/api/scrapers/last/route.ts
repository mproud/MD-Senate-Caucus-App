import { NextResponse } from "next/server"
import { getLatestScrapeRun } from "@/lib/scraper"

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const kind = searchParams.get("kind") ?? undefined

    const run = await getLatestScrapeRun(kind)

    return NextResponse.json({
        run: run
            ? {
                ...run,
                // serialize Dates safely
                startedAt: run.startedAt.toISOString(),
                finishedAt: run.finishedAt?.toISOString() ?? null,
            }
        : null,
    })
}
