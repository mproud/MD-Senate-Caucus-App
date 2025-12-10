export function cleanText(input: string | undefined | null): string {
    return (input ?? "").replace(/\s+/g, " ").trim()
}

export function parseDateString(dateStr: string | undefined | null): Date | null {
    if ( ! dateStr) return null
    const trimmed = cleanText( dateStr )
    const dt = new Date( trimmed )

    if ( Number.isNaN( dt.getTime() ) ) return null

    return dt
}

export function normalizeDate( raw: string | null | undefined ): string | null {
    if ( ! raw ) return null
    const d = new Date( raw )
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10) // YYYY-MM-DD
}