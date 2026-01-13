"use client"

import useSWR from "swr"
import type { BareFetcher } from "swr"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useEffect, useMemo, useRef, useState } from "react"

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

// Scraper kind definitions
export const scraperKinds = [
    {
        kind: "MGA_BILLS_JSON",
        name: "Bills from MGA's JSON feed",
        description: "",
    },
    {
        kind: "MGA_SENATE_AGENDA",
        name: "Senate agenda",
        description: "",
    },
    {
        kind: "MGA_HOUSE_AGENDA",
        name: "House agenda",
        description: "",
    },
    {
        kind: "MGA_LEGISLATOR_COMMITTEES",
        name: "Update legislators & committees",
        description: "",
    },
] as const

const fetcher: BareFetcher<LastRunResponse> = async (url: string) => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`Request failed: ${r.status}`)
    return (await r.json()) as LastRunResponse
}

function getScraperKindLabel(kind: string): string {
    const scraper = scraperKinds.find((s) => s.kind === kind);

    return (
        scraper?.name ??
        kind
            .replaceAll("_", " ")
            .toLowerCase()
            .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    );
}

export function ScrapeRunStatus({ kind }: { kind?: string }) {
    const url =
        kind
            ? `/api/scrape-runs/last?kind=${encodeURIComponent(kind)}`
            : "/api/scrape-runs/last"

    // const { data, isLoading } = useSWR<LastRunResponse, Error, string>(url, fetcher, {
    //     refreshInterval: 60_000,
    //     revalidateOnFocus: true,
    // })
    // Refresh every 60 seconds, but if the scraper is running, refresh every five
    const { data, isLoading } = useSWR<LastRunResponse, Error>(url, fetcher, {
        refreshInterval: (latestData) =>
            latestData?.run?.finishedAt === null ? 5_000 : 60_000,
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
    const started = useMemo(() => new Date(run.startedAt), [run.startedAt])

    const isRunning = run.finishedAt === null
    const isSuccess = !isRunning && run.success
    const isFailed = !isRunning && !run.success

    const [now, setNow] = useState(() => Date.now())
    const [visible, setVisible] = useState(
        typeof document === "undefined"
            ? true
            : document.visibilityState === "visible"
    )

    // Visibility tracking
    useEffect(() => {
        const onVisibilityChange = () =>
            setVisible(document.visibilityState === "visible")

        document.addEventListener("visibilitychange", onVisibilityChange)
        return () =>
            document.removeEventListener("visibilitychange", onVisibilityChange)
    }, [])

    // Tick while running or under 1 minute old
    useEffect(() => {
        const ageMs = now - started.getTime()
        const shouldTick =
            visible && (isRunning || ageMs < 60_000)

        if (!shouldTick) return

        const interval = setInterval(() => {
            setNow(Date.now())
        }, 1_000)

        return () => clearInterval(interval)
    }, [isRunning, started, now, visible])

    const ageMs = now - started.getTime()
    const totalSeconds = Math.floor(ageMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    let timeLabel: string

    if (isRunning) {
        timeLabel =
            minutes > 0
                ? `running for ${minutes}m ${seconds}s`
                : `running for ${seconds}s`
    } else if (totalSeconds < 5) {
        timeLabel = "just now"
    } else if (totalSeconds < 60) {
        timeLabel = `${totalSeconds} second${totalSeconds === 1 ? "" : "s"} ago`
    } else {
        timeLabel = `${minutes} minute${minutes === 1 ? "" : "s"} ago`
    }

    // Animate on change
    const prevLabel = useRef(timeLabel)
    const animate = prevLabel.current !== timeLabel
    prevLabel.current = timeLabel

    const label = isRunning
        ? "Scrape running"
        : isSuccess
        ? "Last scrape"
        : "Last scrape failed"

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-2 cursor-help">
                        {isRunning ? (
                            <span className="relative h-3 w-3">
                                <span className="absolute inset-0 rounded-full border-2 border-muted" />
                                <span className="absolute inset-0 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                            </span>
                        ) : (
                            <span
                                className={cn(
                                    "h-2 w-2 rounded-full",
                                    isSuccess && "bg-emerald-500",
                                    isFailed && "bg-rose-500"
                                )}
                            />
                        )}

                        <span className="whitespace-nowrap">{label}:</span>
                    </span>
                </TooltipTrigger>

                <TooltipContent side="top" align="start">
                    <span className="text-xs">
                        Scraper: <strong>{getScraperKindLabel(run.kind)}</strong>
                    </span>
                </TooltipContent>
            </Tooltip>

            <span
                className={cn(
                    "truncate whitespace-nowrap transition-all duration-200",
                    animate && "opacity-0 translate-y-0.5"
                )}
                key={timeLabel}
            >
                {timeLabel}
            </span>

            
        </>
    )
}