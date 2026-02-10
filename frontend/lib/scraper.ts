// Get the last scrape run
import { prisma } from "@/lib/prisma"

export async function getLatestScrapeRun( kind?: string ) {
    return prisma.scrapeRun.findFirst({
        where: {
            ...kind
                ? { kind }
                : {
                    kind: {
                        not: "ALERT_SENDER",
                    },
                },
            // kind ? { kind } : undefined,
        },
        orderBy: [{ startedAt: "desc" }],
        // select: {
        //     id: true,
        //     kind: true,
        //     source: true,
        //     startedAt: true,
        //     finishedAt: true,
        //     success: true,
        //     error: true,
        // },
    })
}

export async function getAllScrapeRuns() {
    return prisma.scrapeRun.findMany({
        orderBy: [{ startedAt: "desc" }],
        take: 100,
    })
}

export async function getScrapeRunsByKind( kind?: string ) {
    return prisma.scrapeRun.findMany({
        where: kind ? { kind } : undefined,
        orderBy: [{ startedAt: "desc" }],
        take: 25,
    })
}