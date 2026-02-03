"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { addDays, format, isValid, parseISO } from "date-fns"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type ReportFilterProps = {
    startDate: string
    endDate: string
    hideUnanimous: boolean
    flaggedOnly: boolean
    hideCalendars?: string
}

function safeParse(dateStr: string) {
    const d = parseISO(dateStr)
    return isValid(d) ? d : new Date()
}

const DEFAULT_HIDDEN_CALENDARS = new Set(["first"])

export function ReportFilters({
    startDate,
    endDate,
    hideUnanimous,
    flaggedOnly,
    hideCalendars,
}: ReportFilterProps) {
    const router = useRouter()
    const pathname = usePathname()
    const sp = useSearchParams()
    const [isPending, startTransition] = useTransition()

    const [open, setOpen] = useState(false)
    const [calendarsOpen, setCalendarsOpen] = useState(false)

    const from = useMemo(() => safeParse(startDate), [startDate])
    const to = useMemo(() => safeParse(endDate), [endDate])

    const [draftFrom, setDraftFrom] = useState(from)
    const [draftTo, setDraftTo] = useState(to)

    useEffect(() => {
        setDraftFrom(from)
        setDraftTo(to)
    }, [from, to])

    function setParams(next: Record<string, string | boolean | undefined>) {
        const params = new URLSearchParams(sp.toString())
        for (const [k, v] of Object.entries(next)) {
            if (v === undefined) params.delete(k)
            else params.set(k, String(v))
        }
        startTransition(() => router.push(`${pathname}?${params.toString()}`))
    }

    const rangeLabel =
        startDate === endDate
            ? format(from, "PPP")
            : `${format(from, "PPP")} – ${format(to, "PPP")}`

    const CALENDAR_FILTERS = [
        { id: "first", label: "First Reading" },
        { id: "second", label: "Second Reading" },
        { id: "third", label: "Third Reading" },
        { id: "special", label: "Special Order" },
        { id: "laid_over", label: "Laid Over Bills" },
        { id: "vetoed", label: "Vetoed Bills" },
    ] as const

    type CalendarFilterId = (typeof CALENDAR_FILTERS)[number]["id"]

    const urlHiddenSet = useMemo(() => {
        if ( hideCalendars === undefined ) {
            return new Set(DEFAULT_HIDDEN_CALENDARS as Set<CalendarFilterId>)
        }

        const parts = hideCalendars
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)

        return new Set(parts as CalendarFilterId[])
    }, [hideCalendars])

    const [uiHiddenSet, setUiHiddenSet] = useState<Set<CalendarFilterId>>(
        () => new Set(urlHiddenSet)
    )

    const [calendarPending, setCalendarPending] = useState<Set<CalendarFilterId>>(
        () => new Set()
    )

    useEffect(() => {
        setUiHiddenSet(new Set(urlHiddenSet))
        setCalendarPending(new Set())
    }, [urlHiddenSet])

    const totalCalendars = CALENDAR_FILTERS.length
    const shownCount = totalCalendars - uiHiddenSet.size

    const isShown = (id: CalendarFilterId) => !uiHiddenSet.has(id)
    const isCalendarBusy = (id: CalendarFilterId) => calendarPending.has(id)

    function pushHiddenSet(nextHidden: Set<CalendarFilterId>) {
        const csv = Array.from(nextHidden).join(",")
        setParams({ hideCalendars: csv })
    }

    function toggleCalendar(id: CalendarFilterId) {
        if (isCalendarBusy(id)) return

        const nextHidden = new Set(uiHiddenSet)
        if (nextHidden.has(id)) nextHidden.delete(id)
        else nextHidden.add(id)

        setUiHiddenSet(nextHidden)

        setCalendarPending((prev) => {
            const next = new Set(prev)
            next.add(id)
            return next
        })

        pushHiddenSet(nextHidden)
    }

    function showAllCalendars() {
        setUiHiddenSet(new Set())
        setCalendarPending(new Set(CALENDAR_FILTERS.map((c) => c.id)))
        setParams({ hideCalendars: undefined })
    }

    function hideAllCalendars() {
        const nextHidden = new Set(CALENDAR_FILTERS.map((c) => c.id))
        setUiHiddenSet(nextHidden)
        setCalendarPending(new Set(nextHidden))
        pushHiddenSet(nextHidden)
    }

    const today = new Date()

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
                {/* Date range */}
                <div className="flex items-center gap-3">
                    <Label>Date range</Label>

                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className="w-[300px] justify-start text-left font-normal"
                            >
                                {rangeLabel}
                            </Button>
                        </PopoverTrigger>

                        <PopoverContent className="w-auto p-3" align="start">
                            <div className="mb-2 flex gap-2">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        setDraftFrom(today)
                                        setDraftTo(today)
                                    }}
                                >
                                    Today
                                </Button>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setDraftFrom(addDays(today, -6))
                                        setDraftTo(today)
                                    }}
                                >
                                    Last 7 days
                                </Button>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setDraftFrom(addDays(today, -29))
                                        setDraftTo(today)
                                    }}
                                >
                                    Last 30 days
                                </Button>
                            </div>

                            <Calendar
                                mode="range"
                                numberOfMonths={2}
                                selected={{ from: draftFrom, to: draftTo }}
                                onSelect={(range) => {
                                    if (!range?.from) return
                                    setDraftFrom(range.from)
                                    setDraftTo(range.to ?? range.from)
                                }}
                                initialFocus
                            />

                            <div className="mt-2 flex justify-end gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setOpen(false)}
                                >
                                    Cancel
                                </Button>

                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setParams({
                                            startDate: format(draftFrom, "yyyy-MM-dd"),
                                            endDate: format(draftTo, "yyyy-MM-dd"),
                                        })
                                        setOpen(false)
                                    }}
                                >
                                    Apply
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Calendars */}
                <div className="flex items-center gap-3">
                    <Label>Calendars</Label>

                    <Popover open={calendarsOpen} onOpenChange={setCalendarsOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="md:w-[240px] justify-between">
                                {shownCount} of {totalCalendars} shown
                                {calendarPending.size > 0 && (
                                    <span className="ml-3 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                                )}
                            </Button>
                        </PopoverTrigger>

                        <PopoverContent className="w-[320px] p-3" align="start">
                            <div className="flex justify-between mb-3">
                                <Button size="sm" variant="outline" onClick={showAllCalendars}>
                                    Show all
                                </Button>
                                <Button size="sm" variant="outline" onClick={hideAllCalendars}>
                                    Hide all
                                </Button>
                            </div>

                            <div className="grid gap-2">
                                {CALENDAR_FILTERS.map((c) => {
                                    const busy = isCalendarBusy(c.id)

                                    return (
                                        <div
                                            key={c.id}
                                            className={cn(
                                                "flex items-center justify-between rounded-md border px-3 py-2",
                                                busy && "opacity-80"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={isShown(c.id)}
                                                    disabled={busy}
                                                    onCheckedChange={() => toggleCalendar(c.id)}
                                                />
                                                <Label>{c.label}</Label>
                                            </div>

                                            {busy && (
                                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Bills */}
                <RadioGroup
                    className="flex items-center gap-4"
                    value={hideUnanimous ? "hide" : "all"}
                    onValueChange={(v) => setParams({ hideUnanimous: v === "hide" })}
                >
                    <div className="flex items-center gap-2">
                        <RadioGroupItem value="all" />
                        <Label>Show all</Label>
                    </div>

                    <div className="flex items-center gap-2">
                        <RadioGroupItem value="hide" />
                        <Label>Hide unanimous</Label>
                    </div>
                </RadioGroup>

                {/* Flagged */}
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={flaggedOnly}
                        onCheckedChange={(v) => setParams({ flaggedOnly: v === true })}
                    />
                    <Label>Show flagged bills only</Label>
                </div>
            </div>
        </div>
    )
}
