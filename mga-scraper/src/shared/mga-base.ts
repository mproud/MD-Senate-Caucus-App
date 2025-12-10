const LIVE_MGA_BASE = 'https://mgaleg.maryland.gov/mgawebsite'

export const MGA_SOURCE = process.env.MGA_SOURCE ?? 'live' // either "live" or "archive"
export const MGA_WAYBACK_BASE = process.env.MGA_WAYBACK_BASE

export const MGA_BASE =
    MGA_SOURCE === 'archive' && MGA_WAYBACK_BASE
        ? MGA_WAYBACK_BASE
        : LIVE_MGA_BASE

export const USING_WAYBACK = MGA_SOURCE === 'archive' && !! MGA_WAYBACK_BASE

export function getArchiveSnapshotIdentifier(
    waybackBase?: string | null,
): string | null {
    if ( ! waybackBase ) return null
    const match = waybackBase.match(/\/web\/(\d{14})\//)
    return match ? match[1] : waybackBase
}
