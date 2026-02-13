import { Suspense } from "react"
import { BillsSearchResults } from "@/components/bills/bills-search-results"
import { BillsSearchFilters } from "@/components/bills/bills-search-filters"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getActiveSessionCode } from "@/lib/get-system-setting"
import { prisma } from "@/lib/prisma"
import { Committee, Legislator } from "@prisma/client"
import { fetchApi } from "@/lib/api"

interface BillsPageProps {
    searchParams: Promise<{
        q?: string
        chamber?: string
        committee?: string
        sponsor?: string
        subject?: string
        status?: string
        page?: string
    }>
}

function BillsSkeleton() {
    return (
        <Card>
            <CardContent className="py-8">
                <div className="space-y-4">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </div>
            </CardContent>
        </Card>
    )
}

type CommitteeResponse = {
    committees: Committee[]
}

type LegislatorsResponse = {
    legislators: Legislator[]
}

export default async function BillsPage({ searchParams }: BillsPageProps) {
    const params = await searchParams
    const q = params.q || ""
    const chamber = params.chamber || ""
    const committee = params.committee || ""
    const sponsor = params.sponsor || ""
    const subject = params.subject || ""
    const status = params.status || ""
    const page = Number.parseInt(params.page || "1", 10)

    const { committees } = await fetchApi<CommitteeResponse>(`/api/committees`, {
        cache: "no-store",
    })

    const { legislators } = await fetchApi<LegislatorsResponse>(`/api/legislators`, {
        cache: "no-store",
    })

    const activeSessionCode = await getActiveSessionCode()

    return (
        <>
			<div className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight">Search Legislation</h1>
				<p className="mt-2 text-muted-foreground">Search all bills by title, sponsor, committee, subject, and more</p>
			</div>

			<BillsSearchFilters
				initialQuery={q}
				initialChamber={chamber}
				initialCommittee={committee}
				initialSponsor={sponsor}
				initialSubject={subject}
				initialStatus={status}
                committees={committees}
                legislators={legislators}
			/>

			<div className="mt-6">
				<Suspense fallback={<BillsSkeleton />}>
					<BillsSearchResults
                        activeSessionCode={activeSessionCode}
						query={q}
						chamber={chamber}
						committee={committee}
						sponsor={sponsor}
						subject={subject}
						status={status}
						page={page}
					/>
				</Suspense>
			</div>
        </>
    )
}
