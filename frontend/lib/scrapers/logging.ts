import { prisma } from '@/lib/prisma'
import { MGA_BASE, MGA_SOURCE, MGA_WAYBACK_BASE, USING_WAYBACK, getArchiveSnapshotIdentifier } from './mga-base'

export async function startScrapeRun( kind: string ) {
    const source = USING_WAYBACK ? 'ARCHIVE' : 'LIVE'
    const archiveSnapshot = USING_WAYBACK
        ? getArchiveSnapshotIdentifier(MGA_WAYBACK_BASE)
        : null

    const run = await prisma.scrapeRun.create({
        data: {
            kind,
            source,
            baseUrl: MGA_BASE,
            archiveSnapshot,
            metadata: {
                MGA_SOURCE,
                MGA_WAYBACK_BASE: MGA_WAYBACK_BASE ?? null,
            },
        },
    })

    return run
}

export async function finishScrapeRun(
    id: number,
    opts: {
        success: boolean
        legislatorsCount?: number
        committeesCount?: number
        membershipsCount?: number
        billsCount?: number
        calendarsCount?: number
        processedCount?: number
        error?: unknown
    },
) {
    await prisma.scrapeRun.update({
        where: { id },
        data: {
            success: opts.success,
            finishedAt: new Date(),
            legislatorsCount: opts.legislatorsCount,
            committeesCount: opts.committeesCount,
            membershipsCount: opts.membershipsCount,
            calendarsCount: opts.calendarsCount,
            metadata: {
                billsCount: opts.billsCount ?? null,
                calendarsCount: opts.calendarsCount ?? null,
                processedCount: opts.processedCount ?? null,
                // and any optional other results...
            },
            error: opts.error ? String(opts.error) : undefined,
        },
    })
}
