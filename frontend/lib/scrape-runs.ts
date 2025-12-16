// Get the last scrape run
import { prisma } from "@/lib/prisma";

export async function getLatestScrapeRun( kind?: string ) {
    return prisma.scrapeRun.findFirst({
        where: kind ? { kind } : undefined,
        orderBy: [{ startedAt: "desc" }],
        select: {
            id: true,
            kind: true,
            source: true,
            startedAt: true,
            finishedAt: true,
            success: true,
            error: true,
        },
    })
}
