import RecordVoteContent from "./record-vote-content"
import { notFound } from "next/navigation"
import { fetchApi } from "@/lib/api"
import { Prisma, type Bill } from "@prisma/client"
import { FindBillForm } from "./find-bill-form"

type BillExtended = Bill & {
    notes?: any
    currentCommittee: {
        committee: {
            id: number
            name: string
        }
    }
    events?: any[]
    committeeVotes: []
    dataSource?: {
        CommitteePrimaryOrigin: string
        CommitteePrimaryOpposite: string
    }
    actions?: any[]
}

type CommitteeWithMembers = Prisma.CommitteeGetPayload<{
    include: {
        members: {
            include: {
                legislator: true
            }
        }
    }
}>

export default async function RecordVotePage({
    searchParams
}: {
    searchParams: Promise<{
        billNumber?: string
        actionId?: string
    }>
}) {
    const { billNumber, actionId } = await searchParams

    if ( ! billNumber ) {
        return <FindBillForm />
    }

    const bill = await fetchApi<BillExtended>(`/api/bills/${billNumber}`, {
        cache: "no-store",
    })

    if ( ! bill ) {
        return notFound()
    }

    const committee = await fetchApi<CommitteeWithMembers>(`/api/committees/${bill.currentCommittee.committee.id}/members`, {
        cache: "no-store",
    })

    if ( ! committee ) {
        return notFound()
    }

    return (
        <>
            <RecordVoteContent
                bill={bill}
                committee={committee}
                actionId={actionId}
            />
        </>
    )
}