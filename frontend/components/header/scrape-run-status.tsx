"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import type { BareFetcher } from "swr"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getScraperKindLabel } from "@/lib/scraper-client"

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
            ? `/api/scrapers/last?kind=${encodeURIComponent(kind)}`
            : "/api/scrapers/last"

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

function formatRelativeTime(from: Date, to: Date = new Date()): string {
    const ms = to.getTime() - from.getTime()
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 5) return "just now"
    if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
    return `${days} day${days === 1 ? "" : "s"} ago`
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
    } else {
        timeLabel = formatRelativeTime(started, new Date(now))
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