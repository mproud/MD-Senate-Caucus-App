import { CalendarReport } from "@/components/calendar-report"
import { fetchApi } from "@/lib/api"
import type { CalendarDay } from "@/lib/types"
import { ReportButtons } from "@/components/report-buttons"

export default async function ReportPage() {
    const calendarData = await fetchApi<CalendarDay>(`/api/calendar`, {
        cache: "no-store",
    })

    // return <pre>{JSON.stringify(calendarData, null, 2)}</pre>

    // Show the filter by date, checkbox to show all bills or split votes only, show alert bills
    
    return (
        <div className="space-y-6 px-4">
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight">Calendar Report</h1>
            </div>

            <div className="flex items-center justify-between gap-3 border-b pb-4">
                <div className="min-w-0">
                    <h1 className="truncate text-2xl font-semibold">Calendar Report</h1>
                </div>

                <ReportButtons />
            </div>

            <div className="mb-2">
                Options: 
                [ Search by Date ]
                [ Show all Bills / Hide unanimous bills ]
                [ Show flagged bills only ]
            </div>

            <div className="mb-6">
                <CalendarReport calendarData={calendarData} />
            </div>
        </div>
    )
}