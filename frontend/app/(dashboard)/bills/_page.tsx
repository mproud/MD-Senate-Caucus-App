import { Suspense } from "react"
import { CalendarTable } from "@/components/calendar-table"
import { FiltersBar } from "@/components/filters-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApi } from "@/lib/api"
import type { CalendarDay } from "@/lib/types"

interface BillsPageProps {
    searchParams: Promise<{
        chambers?: string
        sections?: string
        startDate?: string
        endDate?: string
        voteResults?: string
        sponsors?: string
        committees?: string
        subjects?: string
        searchText?: string
    }>
}

async function BillsContent({
    chambers,
    sections,
    startDate,
    endDate,
    voteResults,
    sponsors,
    committees,
    subjects,
    searchText,
}: {
    chambers: string[]
    sections: string[]
    startDate?: string
    endDate?: string
    voteResults: string[]
    sponsors: string[]
    committees: string[]
    subjects: string[]
    searchText?: string
}) {
    try {
        const params = new URLSearchParams()
        if (chambers.length > 0) params.set("chambers", chambers.join(","))
        if (sections.length > 0) params.set("sections", sections.join(","))
        if (startDate) params.set("startDate", startDate)
        if (endDate) params.set("endDate", endDate)
        if (voteResults.length > 0) params.set("voteResults", voteResults.join(","))
        if (sponsors.length > 0) params.set("sponsors", sponsors.join(","))
        if (committees.length > 0) params.set("committees", committees.join(","))
        if (subjects.length > 0) params.set("subjects", subjects.join(","))
        if (searchText) params.set("searchText", searchText)

        const calendarData = await fetchApi<CalendarDay>(`/api/calendar?${params.toString()}`, {
            cache: "no-store",
        })

        // return (
        //     <>
        //         <p>Search Params</p>
        //         <pre>{JSON.stringify( params, null, 2)}</pre>
        //         <br/>
        //         <p>Calendar Data</p>
        //         <pre>{JSON.stringify( calendarData, null, 2 )}</pre>
        //     </>
        // )

        return <CalendarTable data={calendarData} />
    } catch (error) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                        <p className="text-lg font-medium">Unable to load calendar data</p>
                        <p className="mt-2 text-sm">{error instanceof Error ? error.message : "Please try again later"}</p>
                    </div>
                </CardContent>
            </Card>
        )
    }
}

function BillsSkeleton() {
    return (
        <Card>
            <CardContent className="py-8">
                <div className="space-y-4">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </CardContent>
        </Card>
    )
}

export default async function BillsPage({ searchParams }: BillsPageProps) {
    const params = await searchParams
    const chambers = params.chambers ? params.chambers.split(",") : ["Senate", "House"]
    const sections = params.sections ? params.sections.split(",") : []
    const startDate = params.startDate
    const endDate = params.endDate
    const voteResults = params.voteResults ? params.voteResults.split(",") : []
    const sponsors = params.sponsors ? params.sponsors.split(",") : []
    const committees = params.committees ? params.committees.split(",") : []
    const subjects = params.subjects ? params.subjects.split(",") : []
    const searchText = params.searchText

    return (
        <>
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight">Find Legislation</h1>
            </div>

            <FiltersBar
                initialChambers={chambers}
                initialSections={sections}
                initialStartDate={startDate}
                initialEndDate={endDate}
                initialVoteResults={voteResults}
                initialSponsors={sponsors}
                initialCommittees={committees}
                initialSubjects={subjects}
                initialSearchText={searchText}
            />

            <div className="mt-6">
                <Suspense fallback={<BillsSkeleton />}>
                    <BillsContent
                        chambers={chambers}
                        sections={sections}
                        startDate={startDate}
                        endDate={endDate}
                        voteResults={voteResults}
                        sponsors={sponsors}
                        committees={committees}
                        subjects={subjects}
                        searchText={searchText}
                    />
                </Suspense>
            </div>
        </>
    )
}
