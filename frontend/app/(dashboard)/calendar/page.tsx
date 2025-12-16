import { CalendarReport } from "@/components/calendar-report"
import { fetchApi } from "@/lib/api"
import type { CalendarDay } from "@/lib/types"
import { ReportButtons } from "@/components/report-buttons"
import { ReportFilters } from "@/components/calendar-report/report-filters"
import { format } from "date-fns"

type SearchParams = Record<string, string | string[] | undefined>

export default async function ReportPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>
}) {
    const sp = await searchParams

    const today = format(new Date(), "yyyy-MM-dd")

    const startDate =
        typeof sp.startDate === "string" && sp.startDate ? sp.startDate : today
    const endDate =
        typeof sp.endDate === "string" && sp.endDate ? sp.endDate : startDate // default 1-day range

    const hideUnanimous =
        typeof sp.hideUnanimous === "string" ? sp.hideUnanimous === "true" : false

    const flaggedOnly =
        typeof sp.flaggedOnly === "string" ? sp.flaggedOnly === "true" : false

    const qs = new URLSearchParams({
        startDate,
        endDate,
        hideUnanimous: String(hideUnanimous),
        flaggedOnly: String(flaggedOnly),
    })

    const calendarData = await fetchApi<CalendarDay>(`/api/calendar?${qs}`, {
        cache: "no-store",
    })

    return (
        <div className="space-y-6 px-4">
            <div className="flex items-center justify-between gap-3 border-b pb-4">
                <div className="min-w-0">
                    <h1 className="truncate text-2xl font-semibold">Calendar Report</h1>
                </div>
                <ReportButtons />
            </div>

            <ReportFilters
                startDate={startDate}
                endDate={endDate}
                hideUnanimous={hideUnanimous}
                flaggedOnly={flaggedOnly}
            />

            <div className="mb-6">
                <CalendarReport calendarData={calendarData} />
            </div>
        </div>
    )
}
