"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { addDays, format, isValid, parseISO } from "date-fns"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Props = {
    startDate: string // yyyy-MM-dd
    endDate: string // yyyy-MM-dd
    hideUnanimous: boolean
    flaggedOnly: boolean
}

const TEMP_RANGE_SHORTCUTS: Array<{ label: string; start: string; end: string }> = [
    { label: "TESTING", start: "2025-03-26", end: "2025-03-27" }, // temp single-day shortcut
]

function safeParse(dateStr: string) {
    const d = parseISO(dateStr)
    return isValid(d) ? d : new Date()
}

export function ReportFilters({
    startDate,
    endDate,
    hideUnanimous,
    flaggedOnly,
}: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const sp = useSearchParams()
    const [isPending, startTransition] = React.useTransition()

    const [open, setOpen] = React.useState(false)

    const from = React.useMemo(() => safeParse(startDate), [startDate])
    const to = React.useMemo(() => safeParse(endDate), [endDate])

    function setParams(next: Record<string, string | boolean | undefined>) {
        const params = new URLSearchParams(sp.toString())
        for (const [k, v] of Object.entries(next)) {
            if (v === undefined) params.delete(k)
            else params.set(k, String(v))
        }
        startTransition(() => router.push(`${pathname}?${params.toString()}`))
    }

    function setRange(start: Date, end: Date) {
        // close the popover when a full range is selected
        setOpen(false)
        setParams({
            startDate: format(start, "yyyy-MM-dd"),
            endDate: format(end, "yyyy-MM-dd"),
        })
    }

    const today = new Date()
    const todayStr = format(today, "yyyy-MM-dd")

    const rangeLabel =
        startDate === endDate
            ? format(from, "PPP")
            : `${format(from, "PPP")} – ${format(to, "PPP")}`

    return (
        <div className="relative">
            {isPending && (
                <div className="absolute inset-0 z-10 grid place-items-center rounded-md border bg-background/70 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                        Updating report...
                    </div>
                </div>
            )}

            <div
                className={cn(
                    "report-filter-wrapper flex flex-col gap-4 rounded-md border p-4 md:flex-row md:items-center md:justify-between",
                    isPending && "pointer-events-none"
                )}
            >
                {/* Date range chooser */}
                <div className="flex items-center gap-3">
                    <Label className="whitespace-nowrap">Date range</Label>

                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className="w-[280px] justify-start text-left font-normal"
                            >
                                {rangeLabel}
                            </Button>
                        </PopoverTrigger>

                        <PopoverContent className="w-auto p-3" align="start">
                            {/* Quick ranges */}
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setRange(today, today)}
                                >
                                    Today
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRange(addDays(today, -6), today)}
                                >
                                    Last 7 days
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRange(addDays(today, -29), today)}
                                >
                                    Last 30 days
                                </Button>

                                {TEMP_RANGE_SHORTCUTS.map((s) => (
                                    <Button
                                        key={`${s.start}-${s.end}`}
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setOpen(false)
                                            setParams({ startDate: s.start, endDate: s.end })
                                        }}
                                    >
                                        {s.label}
                                    </Button>
                                ))}
                            </div>

                            {/* Range calendar */}
                            <div className="rounded-md border">
                                <Calendar
                                    mode="range"
                                    numberOfMonths={2}
                                    selected={{ from, to }}
                                    onSelect={(range) => {
                                        // range can be: undefined, {from}, {from,to}
                                        if (!range?.from) return

                                        // if user picked only the first day, keep popover open
                                        if (!range.to) {
                                            setParams({
                                                startDate: format(range.from, "yyyy-MM-dd"),
                                                endDate: format(range.from, "yyyy-MM-dd"),
                                            })
                                            return
                                        }

                                        // full range chosen -> close and apply
                                        setRange(range.from, range.to)
                                    }}
                                    initialFocus
                                />
                            </div>

                            <div className="mt-2 text-xs text-muted-foreground">
                                Tip: pick a start date, then an end date.
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Radio: all vs hide unanimous */}
                <div className="flex items-center gap-4">
                    <Label className="whitespace-nowrap">Bills</Label>

                    <RadioGroup
                        className="flex items-center gap-4"
                        value={hideUnanimous ? "hide-unanimous" : "all"}
                        onValueChange={(v) =>
                            setParams({ hideUnanimous: v === "hide-unanimous" })
                        }
                    >
                        <div className="flex items-center gap-2">
                            <RadioGroupItem id="bills-all" value="all" />
                            <Label htmlFor="bills-all">Show all</Label>
                        </div>

                        <div className="flex items-center gap-2">
                            <RadioGroupItem id="bills-hide-unanimous" value="hide-unanimous" />
                            <Label htmlFor="bills-hide-unanimous">Hide unanimous</Label>
                        </div>
                    </RadioGroup>
                </div>

                {/* Checkbox: flagged only */}
                <div className="flex items-center gap-2">
                    <Checkbox
                        id="flaggedOnly"
                        checked={flaggedOnly}
                        onCheckedChange={(v) => setParams({ flaggedOnly: v === true })}
                    />
                    <Label htmlFor="flaggedOnly">Show flagged bills only</Label>
                </div>
            </div>
        </div>
    )
}
