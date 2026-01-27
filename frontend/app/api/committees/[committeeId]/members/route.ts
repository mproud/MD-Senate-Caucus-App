import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ committeeId: string }> }
) {
    const { committeeId } = await params

    const committee = await prisma.committee.findUnique({
        where: {
            id: Number(committeeId),
        },
        include: {
            members: {
                where: {
                    endDate: null,
                    legislator: {
                        isActive: true
                    },
                },
                include: {
                    legislator: true,
                },
                orderBy: [
                    { legislator: { lastName: 'asc' } },
                    { legislator: { firstName: 'asc' } },
                ],
            },
        },
    })
    
    if ( ! committee ) {
        return NextResponse.json({ error: 'Committee Not Found' }, { status: 404 })
    }

    // Sort the committee members - Chair > Vice Chair
    const norm = (r: string) => r.trim().toLowerCase()

    const rolePriority: Record<string, number> = {
        "chair": 0,
        "vice chair": 1,
        "vice_chair": 1,
    }

    committee.members.sort((a, b) => {
        const roleA = norm(a.role ?? "")
        const roleB = norm(b.role ?? "")

        const ra = rolePriority[ roleA ] ?? 2
        const rb = rolePriority[ roleB ] ?? 2
        if (ra !== rb) return ra - rb

        const lastA = a.legislator?.lastName ?? ""
        const lastB = b.legislator?.lastName ?? ""
        const lastCmp = lastA.localeCompare(lastB)
        if (lastCmp !== 0) return lastCmp

        const firstA = a.legislator?.firstName ?? ""
        const firstB = b.legislator?.firstName ?? ""
        return firstA.localeCompare(firstB)
    })

    const memberCount = committee.members.length

    // // Try to find by ID first, then by name
    // let committee = getCommitteeById(committeeId)
    // if (!committee) {
    //     committee = getCommitteeByName(decodeURIComponent(committeeId))
    // }

    // if (!committee) {
    //     return NextResponse.json(
    //         { error: "Committee not found", availableCommittees: mockCommittees.map((c) => ({ id: c.id, name: c.name })) },
    //         { status: 404 }
    //     )
    // }

    return NextResponse.json({
        ...committee,
        memberCount,
    })
}
