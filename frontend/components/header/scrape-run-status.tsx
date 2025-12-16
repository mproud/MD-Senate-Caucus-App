"use client"

import useSWR from "swr"
import type { BareFetcher } from "swr"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatDistanceToNowStrict } from "date-fns"

type LastRunResponse = {
    run: null | {
        id: number
        kind: string
        source: string
        startedAt: string
        finishedAt: string | null
        success: boolean
        error: string | null
    }
}

const fetcher: BareFetcher<LastRunResponse> = async (url: string) => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`Request failed: ${r.status}`)
    return (await r.json()) as LastRunResponse
}

export function ScrapeRunStatus({ kind }: { kind?: string }) {
    const url =
        kind
            ? `/api/scrape-runs/last?kind=${encodeURIComponent(kind)}`
            : "/api/scrape-runs/last"

    const { data, isLoading } = useSWR<LastRunResponse, Error, string>(url, fetcher, {
        refreshInterval: 60_000,
        revalidateOnFocus: true,
    })

    return (
        <div className="flex w-[260px] items-center justify-end gap-2 text-xs text-muted-foreground">
            {isLoading || !data ? (
                <>
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-32" />
                </>
            ) : !data.run ? (
                <span className="truncate">Scraper: no runs yet</span>
            ) : (
                <StatusRow run={data.run} />
            )}
        </div>
    )
}

function StatusRow({ run }: { run: NonNullable<LastRunResponse["run"]> }) {
    const started = new Date(run.startedAt)
    const relative = formatDistanceToNowStrict(started, { addSuffix: true })

    const dotClass = run.success ? "bg-emerald-500" : "bg-rose-500"
    const label = run.success ? "Last scrape" : "Last scrape failed"

    return (
        <>
            <span className="inline-flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", dotClass)} />
                <span className="whitespace-nowrap">{label}:</span>
            </span>

            <span className="truncate whitespace-nowrap">{relative}</span>
        </>
    )
}
