// Sync bills from the MGA's JSON feed

import 'dotenv/config'
import { ActionSource, BillEventType, Chamber } from '@prisma/client'
import { prisma } from './shared/prisma'
import { fetchJson } from './shared/http'
import { startScrapeRun, finishScrapeRun } from './shared/logging'

// @TODO this needs to pull from the archive link optionally too
const LEGISLATION_JSON_URL =
    'https://mgaleg.maryland.gov/2026rs/misc/billsmasterlist/legislation.json'
    // 'https://web.archive.org/web/20250327170322/https://mgaleg.maryland.gov/2025rs/misc/billsmasterlist/legislation.json'
    // 'https://mgaleg.maryland.gov/2025rs/misc/billsmasterlist/legislation.json'

type Subject = {
    Code: string
    Name: string
}

type RawBill = {
    BillNumber: string
    ChapterNumber: string
    CrossfileBillNumber: string
    SponsorPrimary: string
    Sponsors: { Name: string }[]
    Synopsis: string
    Title: string
    Status: string
    CommitteePrimaryOrigin: string
    CommitteeSecondaryOrigin: string
    CommitteePrimaryOpposite: string
    CommitteeSecondaryOpposite: string
    FirstReadingDateHouseOfOrigin: string | null
    HearingDateTimePrimaryHouseOfOrigin: string | null
    HearingDateTimeSecondaryHouseOfOrigin: string | null
    ReportDateHouseOfOrigin: string | null
    ReportActionHouseOfOrigin: string
    SecondReadingDateHouseOfOrigin: string | null
    SecondReadingActionHouseOfOrigin: string
    ThirdReadingDateHouseOfOrigin: string | null
    ThirdReadingActionHouseOfOrigin: string
    FirstReadingDateOppositeHouse: string | null
    HearingDateTimePrimaryOppositeHouse: string | null
    HearingDateTimeSecondaryOppositeHouse: string | null
    ReportDateOppositeHouse: string | null
    ReportActionOppositeHouse: string
    SecondReadingDateOppositeHouse: string | null
    SecondReadingActionOppositeHouse: string
    ThirdReadingDateOppositeHouse: string | null
    ThirdReadingActionOppositeHouse: string
    InteractionBetweenChambers: string
    PassedByMGA: boolean
    EmergencyBill: boolean
    ConstitutionalAmendment: boolean
    BroadSubjects?: Subject[] | null
    NarrowSubjects?: Subject[] | null
    BillType: string
    BillVersion: string
    Statutes: any
    YearAndSession: string
    StatusCurrentAsOf: string

    // Keep an open door for other keys we don't explicitly care about yet
    [key: string]: any
}

type LegislatorLookup = {
    id: number
    fullName: string
    firstName: string
    lastName: string
    // chamber: 'HOUSE' | 'SENATE'
    terms: { chamber: Chamber }[]
}

/**
 * Index of legislators keyed by lowercased lastName
 */
type LegislatorIndex = Record<string, LegislatorLookup[]>

// --- Helpers ---

function mapChamber(billNumber: string): Chamber {
    const prefix = billNumber.trim().toUpperCase()
    // MGA uses HB / SB; fall back to HOUSE if we ever see something else.
    if (prefix.startsWith('S')) return 'SENATE'
    return 'HOUSE'
}

function oppositeChamber(ch: Chamber): Chamber {
    return ch === 'SENATE' ? 'HOUSE' : 'SENATE'
}

function deriveSessionYearAndCode(item: RawBill): { sessionYear: number; sessionCode: string } {
    // "2025 Regular Session" -> 2025
    const yearPart = item.YearAndSession?.slice(0, 4)
    const sessionYear = Number.parseInt(yearPart || '2025', 10) || 2025
    const sessionCode = `${sessionYear}RS`
    return { sessionYear, sessionCode }
}

function deriveIsLocal(item: RawBill): boolean {
    const broadSubjects = item.BroadSubjects ?? []
    return broadSubjects.some((s) => s?.Name?.includes('Local Bills'))
}


/**
 * Build an in-memory index of active legislators, grouped by last name.
 * This keeps us from doing a DB hit per bill.
 */
async function buildLegislatorIndex(): Promise<LegislatorIndex> {
    const legislators = await prisma.legislator.findMany({
        where: {
            isActive: true,
        },
        select: {
            id: true,
            fullName: true,
            firstName: true,
            lastName: true,
            terms: {
                select: {
                    chamber: true,
                },
            },
        },
    })

    const index: LegislatorIndex = {}

    for (const leg of legislators) {
        const key = (leg.lastName || '').trim().toLowerCase()
        if ( ! key ) continue
        if ( ! index[key] ) index[key] = []
        index[key].push( leg )
    }

    return index
}

/**
 * Take a SponsorPrimary string and try to extract a usable last name.
 *
 * Examples:
 *    - "Delegate Acevero"          -> "Acevero"
 *    - "Senator Sydnor"            -> "Sydnor"
 *    - "Delegate Jones, D."        -> "Jones"
 *    - "Delegate Palakovich Carr"  -> "Palakovich Carr"
 *
 * Returns null if the string doesn't look like "Delegate ..." / "Senator ...".
 */
function parsePrimarySponsorLastName(sponsorPrimary: string | null | undefined): string | null {
    if (!sponsorPrimary) return null
    let s = sponsorPrimary.trim()
    if (s.startsWith('Delegate ')) {
        s = s.slice('Delegate '.length)
    } else if (s.startsWith('Senator ')) {
        s = s.slice('Senator '.length)
    } else {
        // Things like "Caroline County Delegation", "Chair, X Committee" - skip those for now
        return null
    }

    // Chop off any trailing ", X." initials
    const commaIdx = s.indexOf(',')
    if (commaIdx !== -1) {
        s = s.slice(0, commaIdx)
    }

    s = s.trim()
    return s.length ? s : null
}

// Similar to the above function, but make it smarter with the chamber, initial, etc
function parseSponsorName(
    sponsorPrimary: string | null | undefined
): { chamber: Chamber; initial: string | null; lastName: string } | null {
    if (!sponsorPrimary) return null

    let s = sponsorPrimary.trim()

    let chamber: Chamber
    if (s.startsWith('Delegate ')) {
        chamber = 'HOUSE'
        s = s.slice('Delegate '.length)
    } else if (s.startsWith('Senator ')) {
        chamber = 'SENATE'
        s = s.slice('Senator '.length)
    } else {
        // Things like "Kent County Delegation" etc.
        return null
    }

    // FIRST: handle "Last, R." / "Palakovich Carr, J." style
    // e.g. "Long, R."  -> lastName = "Long", initial = "R"
    //      "Palakovich Carr, J." -> lastName = "Palakovich Carr", initial = "J"
    const commaInitialMatch = s.match(/^(.+?),\s*([A-Z])\.?$/)
    if (commaInitialMatch) {
        const lastName = commaInitialMatch[1].trim()
        const initial = commaInitialMatch[2].trim()
        if (!lastName) return null
        return { chamber, initial, lastName }
    }

    // Strip trailing comma if present
    s = s.replace(/,$/, '').trim()

    const parts = s.split(/\s+/)

    let initial: string | null = null
    let lastName: string

    // Pattern: "J Smith" or "J. Smith" or "R. Palakovich Carr"
    if (parts.length >= 2 && /^[A-Z]\.?$/.test(parts[0])) {
        initial = parts[0][0] // just the letter, no dot
        lastName = parts.slice(1).join(' ')
    } else {
        // Pattern: "Smith" or "Palakovich Carr"
        lastName = s
    }

    lastName = lastName.trim()
    if (!lastName) return null

    return { chamber, initial, lastName }
}



/**
 * Resolve a SponsorPrimary string to a Legislator.id using the legislator index.
 *
 * - Uses lastName only (because the JSON only has "Delegate Lastname"/"Senator Lastname")
 * - If there's exactly one active legislator with that lastName, we use it
 * - If none or ambiguous, log and return null
 * 
 * @TODO handle which chamber the legislator is in - there's smith in two chambers, etc
 */
function resolvePrimarySponsorId(
    billNumber: string,
    sponsorPrimary: string | null | undefined,
    index: LegislatorIndex
): number | null {
    // Bail if theres not a sponsor
    if ( ! sponsorPrimary ) return null

    const parsed = parseSponsorName( sponsorPrimary )
    if ( ! parsed ) return null

    const { chamber, initial, lastName } = parsed

    const key = lastName.toLowerCase()
    const lastNameMatches = index[key] || []

    if (lastNameMatches.length === 0) {
        console.warn(
            `No Legislator match for "${sponsorPrimary}" (lastName: "${lastName}") (Bill: ${billNumber})`
        )
        return null
    }

    // Filter by chamber
    const chamberMatches = lastNameMatches.filter((leg) =>
        leg.terms?.some((t) => t.chamber === chamber)
    )

    if (chamberMatches.length === 1) {
        return chamberMatches[0].id
    }

    // If same chamber AND multiple legislators, use initial if present
    if ( chamberMatches.length > 1 && initial ) {
        const withInitial = chamberMatches.filter((leg) => {
            const first = ( leg.firstName || '' ).trim()
            return first.toUpperCase().startsWith(initial.toUpperCase())
        })

        if (withInitial.length === 1) {
            return withInitial[0].id
        }

        if (withInitial.length > 1) {
            console.warn(
                `Ambiguous match for "${sponsorPrimary}". Multiple legislators share last name + initial.`
            )
            return null
        }
    }

    // If multiple but no initial to distinguish → cannot disambiguate
    if (chamberMatches.length > 1) {
        console.warn(
            `Ambiguous match for "${sponsorPrimary}" - multiple legislators in same chamber with last name "${lastName}".`
        )
        return null
    }

    // If no chamber-specific match but matches exist → fallback only if chamber is unknown
    if (chamberMatches.length === 0) {
        if (lastNameMatches.length === 1) {
            return lastNameMatches[0].id
        }

        console.warn(
            `Ambiguous match for "${sponsorPrimary}" - cannot resolve chamber. Candidates: ${lastNameMatches
                .map((m) => m.fullName)
                .join(', ')}`
        )

        return null
    }

    return null
}

// handle when bills change...
function createStatusChangedSummary(
    billNumber: string,
    oldStatus: string | null,
    newStatus: string | null
): string {
    if ( ! oldStatus ) {
        return `${billNumber}: status set to ${newStatus ?? 'Unknown'}`
    }

    if ( ! newStatus ) {
        return `${billNumber}: status cleared (was ${oldStatus})`
    }

    return `${billNumber}: status changed from "${oldStatus}" to "${newStatus}"`
}

// normalize committee names for matching ("... Committee" suffix optional)
function normalizeCommitteeName(name: string): string {
    return name.replace(/\bcommittee\b/i, '').replace(/\s+/g, ' ').trim()
}

// resolve committeeId for an action (supports either stored with/without "Committee")
async function resolveCommitteeIdByName(name: string | null | undefined, chamber: Chamber): Promise<number | null> {
    if ( ! name ) return null
    const raw = name.trim()
    if ( ! raw ) return null

    const normalized = normalizeCommitteeName(raw)
    const withCommittee = `${normalized} Committee`

    const found = await prisma.committee.findFirst({
        where: {
            chamber,
            OR: [
                { name: raw },
                { name: normalized },
                { name: withCommittee },
                { name: { contains: normalized, mode: 'insensitive' } },
            ],
        },
        select: { id: true },
    })

    return found?.id ?? null
}

// parse vote counts from action strings when possible
function parseVoteCounts(text: string): { yes: number | null; no: number | null } {
    const t = text.replace(/\s+/g, ' ').trim()
    // Common patterns seen: "Yeas 45 Nays 0", "45-0", "45 yeas, 0 nays"
    console.log('Parse Vote Counts', { text })
    const yeas = t.match(/Yeas?\s*(\d+)/i)
    const nays = t.match(/Nays?\s*(\d+)/i)
    if (yeas || nays) {
        return { yes: yeas ? Number(yeas[1]) : null, no: nays ? Number(nays[1]) : null }
    }
    const dash = t.match(/\b(\d+)\s*-\s*(\d+)\b/)
    if (dash) {
        return { yes: Number(dash[1]), no: Number(dash[2]) }
    }
    return { yes: null, no: null }
}

// decide if an action should be treated as a vote action
function classifyVote(actionText: string, kind: 'REPORT' | 'SECOND' | 'THIRD'): { isVote: boolean; voteResult: string | null } {
    const t = actionText.toLowerCase()
    // Committee report actions often include Favorable/Unfavorable, etc.
    if (kind === 'REPORT') {
        const m = actionText.match(/Favorable(?:\s+with\s+Amendments.*)?|Unfavorable|Adverse/i)
        return { isVote: true, voteResult: m ? m[0] : actionText }
    }
    // Floor actions: look for pass/fail signals
    if (/\bpassed\b|\bpassage\b|\badopted\b/i.test(actionText)) return { isVote: true, voteResult: 'Passed' }
    if (/\bfailed\b|\brejected\b/i.test(actionText)) return { isVote: true, voteResult: 'Failed' }
    return { isVote: false, voteResult: null }
}

// lightweight "upsert" for BillAction (schema has no unique; we findFirst and create)
async function upsertBillAction(opts: {
    billId: number
    chamber: Chamber
    actionDate: Date
    description: string
    committeeId: number | null
    sequence: number
    kind: 'REPORT' | 'SECOND' | 'THIRD'
    raw: any
}) {
    const { billId, chamber, actionDate, description, committeeId, sequence, kind, raw } = opts

    const existing = await prisma.billAction.findFirst({
        where: {
            billId,
            chamber,
            actionDate,
            sequence,
            description,
        },
        select: {
            id: true,
            isVote: true,
            voteResult: true,
            yesVotes: true,
            noVotes: true,
        },
    })

    const { isVote, voteResult } = classifyVote(description, kind)
    console.log('Bill Action', { opts })
    const counts = isVote ? parseVoteCounts(description) : { yes: null, no: null }

    if (!existing) {
        const created = await prisma.billAction.create({
            data: {
                billId,
                chamber,
                actionDate,
                description,
                committeeId: committeeId ?? undefined,
                sequence,
                isVote,
                voteResult,
                yesVotes: counts.yes,
                noVotes: counts.no,
                source: ActionSource.MGA_JSON,
                dataSource: raw,
            },
            select: { id: true, isVote: true },
        })

        return { actionId: created.id, wasNew: true, isVote: created.isVote }
    }

    // Update if vote fields changed (counts/result show up later sometimes)
    const voteChanged =
        existing.isVote !== isVote ||
        existing.voteResult !== voteResult ||
        existing.yesVotes !== counts.yes ||
        existing.noVotes !== counts.no

    if (voteChanged) {
        await prisma.billAction.update({
            where: { id: existing.id },
            data: {
                committeeId: committeeId ?? undefined,
                isVote,
                voteResult,
                yesVotes: counts.yes,
                noVotes: counts.no,
                dataSource: raw,
            },
        })
    }

    return { actionId: existing.id, wasNew: false, isVote }
}

// emit COMMITTEE_VOTE_RECORDED when we record a committee vote action
async function maybeCreateCommitteeVoteEvent(opts: {
    billId: number
    chamber: Chamber
    committeeId: number | null
    actionDate: Date
    description: string
    actionId: number
}) {
    const { billId, chamber, committeeId, actionDate, description, actionId } = opts
    if (!committeeId) return

    // Avoid duplicates: if an event already exists for this BillAction, skip
    const exists = await prisma.billEvent.findFirst({
        where: {
            billId,
            eventType: BillEventType.COMMITTEE_VOTE_RECORDED,
            committeeId,
            eventTime: actionDate,
            summary: { contains: description },
        },
        select: { id: true },
    })
    if (exists) return

    await prisma.billEvent.create({
        data: {
            billId,
            eventType: BillEventType.COMMITTEE_VOTE_RECORDED,
            chamber,
            committeeId,
            eventTime: actionDate,
            summary: `${description}`, // keep it simple, can be formatted nicer
            payload: { actionId }, // link to BillAction for UI
        },
    })
}

// build all vote/action candidates for both chambers from one RawBill
function buildActionCandidates(item: RawBill, origin: Chamber): Array<{
    chamber: Chamber
    dateStr: string | null
    actionText: string | null
    committeeName: string | null
    sequence: number
    kind: 'REPORT' | 'SECOND' | 'THIRD'
    side: 'ORIGIN' | 'OPPOSITE'
}> {
    const opp = oppositeChamber(origin)

    const safe = (s: any) => (s && String(s).trim().length ? String(s).trim() : null)

    return [
        // House of origin
        {
            chamber: origin,
            dateStr: item.ReportDateHouseOfOrigin,
            actionText: safe(item.ReportActionHouseOfOrigin),
            committeeName: safe(item.CommitteePrimaryOrigin),
            sequence: 10,
            kind: 'REPORT',
            side: 'ORIGIN',
        },
        {
            chamber: origin,
            dateStr: item.SecondReadingDateHouseOfOrigin,
            actionText: safe(item.SecondReadingActionHouseOfOrigin),
            committeeName: null,
            sequence: 20,
            kind: 'SECOND',
            side: 'ORIGIN',
        },
        {
            chamber: origin,
            dateStr: item.ThirdReadingDateHouseOfOrigin,
            actionText: safe(item.ThirdReadingActionHouseOfOrigin),
            committeeName: null,
            sequence: 30,
            kind: 'THIRD',
            side: 'ORIGIN',
        },

        // Opposite chamber (only becomes meaningful once the bill crosses)
        {
            chamber: opp,
            dateStr: item.ReportDateOppositeHouse,
            actionText: safe(item.ReportActionOppositeHouse),
            committeeName: safe(item.CommitteePrimaryOpposite),
            sequence: 110,
            kind: 'REPORT',
            side: 'OPPOSITE',
        },
        {
            chamber: opp,
            dateStr: item.SecondReadingDateOppositeHouse,
            actionText: safe(item.SecondReadingActionOppositeHouse),
            committeeName: null,
            sequence: 120,
            kind: 'SECOND',
            side: 'OPPOSITE',
        },
        {
            chamber: opp,
            dateStr: item.ThirdReadingDateOppositeHouse,
            actionText: safe(item.ThirdReadingActionOppositeHouse),
            committeeName: null,
            sequence: 130,
            kind: 'THIRD',
            side: 'OPPOSITE',
        },
    ]
}

// --- Scrape! ---
export async function runBillsFromJsonScrape( event: any, context: Context ) {
    const run = await startScrapeRun('MGA_BILLS_JSON')

    try {
        console.log('Fetching legislation.json...')
        const raw: RawBill[] = await fetchJson<RawBill[]>(LEGISLATION_JSON_URL)

        console.log('Building legislator index...')
        const legislatorIndex = await buildLegislatorIndex()

        let billsCount = 0

        for ( const item of raw ) {
            if ( ! item.BillNumber ) {
                // This shouldn't happen, but just in case...
                console.warn('Skipping bill with no BillNumber', item)
                continue
            }

            const billNumber = String( item.BillNumber ).trim()

            const { sessionYear, sessionCode } = deriveSessionYearAndCode(item)

            // Make externalId unique across sessions
            const externalId = `${sessionCode}-${billNumber}`

            const originChamber = mapChamber(billNumber)

            const shortTitle = (item.Title || billNumber).trim()
            const longTitle = null // MGA JSON does not expose a separate long title. Might eliminate this field...
            const synopsis = item.Synopsis ? String(item.Synopsis).trim() : null

            const billTypeMatch = billNumber.match(/^[A-Z]+/)
            const billType = billTypeMatch ? billTypeMatch[0] : null

            const numericMatch = billNumber.match(/(\d+)/)
            const billNumberNumeric = numericMatch ? Number(numericMatch[1]) : null

            const statusDesc = item.Status || null
            // No separate status code in JSON; leave null for now
            const statusCode: string | null = null

            const isEmergency = !!item.EmergencyBill
            const isLocal = deriveIsLocal(item)

            const crossFileExternalId = item.CrossfileBillNumber
                ? String(item.CrossfileBillNumber).trim()
                : null

            // Map primary sponsor to Legislator.id
            const primarySponsorId = resolvePrimarySponsorId( billNumber, item.SponsorPrimary, legislatorIndex )

            // Store the raw SponsorPrimary as display text too
            const sponsorDisplay = item.SponsorPrimary || null

            // Grab the bill if it exists already
            const existingBill = await prisma.bill.findUnique({
                where: { externalId },
                select: {
                    id: true,
                    statusDesc: true,
                },
            })
            
            const bill = await prisma.bill.upsert({
                where: { externalId },
                update: {
                    sessionYear,
                    sessionCode,
                    chamber: originChamber,
                    billNumber,
                    billNumberNumeric,
                    billType,
                    shortTitle,
                    longTitle,
                    synopsis,
                    statusCode,
                    statusDesc,
                    isEmergency,
                    isLocal,
                    crossFileExternalId,
                    primarySponsorId,
                    sponsorDisplay,
                    dataSource: item,
                },
                create: {
                    externalId,
                    sessionYear,
                    sessionCode,
                    chamber: originChamber,
                    billNumber,
                    billNumberNumeric,
                    billType,
                    shortTitle,
                    longTitle,
                    synopsis,
                    statusCode,
                    statusDesc,
                    isEmergency,
                    isLocal,
                    crossFileExternalId,
                    primarySponsorId,
                    sponsorDisplay,
                    dataSource: item,
                },
            })

            // Match committee fields in the JSON to actual Committee records,
            // then populate BillCurrentCommittee and BillCommitteeHistory.
            const safeCommitteeName = (s: any): string | null => {
                if (!s) return null
                const t = String(s).trim()
                return t.length ? t : null
            }

            const originPrimaryName = safeCommitteeName(item.CommitteePrimaryOrigin)
            const originSecondaryName = safeCommitteeName(item.CommitteeSecondaryOrigin)

            const oppPrimaryName = safeCommitteeName(item.CommitteePrimaryOpposite)
            const oppSecondaryName = safeCommitteeName(item.CommitteeSecondaryOpposite)

            const oppChamber = oppositeChamber(originChamber)

            // Resolve committee IDs (respect chamber)
            const originPrimaryId = await resolveCommitteeIdByName(originPrimaryName, originChamber)
            const originSecondaryId = await resolveCommitteeIdByName(originSecondaryName, originChamber)

            const oppPrimaryId = await resolveCommitteeIdByName(oppPrimaryName, oppChamber)
            const oppSecondaryId = await resolveCommitteeIdByName(oppSecondaryName, oppChamber)

            // Build assignments (include referred date by side)
            const assignments: Array<{
                side: 'ORIGIN' | 'OPPOSITE'
                chamber: Chamber
                role: 'PRIMARY' | 'SECONDARY'
                name: string | null
                committeeId: number | null
                referredDateStr: string | null
                reportedOutDateStr: string | null
                reportAction: string | null
            }> = [
                {
                    side: 'ORIGIN',
                    chamber: originChamber,
                    role: 'PRIMARY',
                    name: originPrimaryName,
                    committeeId: originPrimaryId,
                    referredDateStr: item.FirstReadingDateHouseOfOrigin ?? null,
                    // Report info applies to the primary committee on that side (best available from JSON)
                    reportedOutDateStr: item.ReportDateHouseOfOrigin ?? null,
                    reportAction: (item.ReportActionHouseOfOrigin || '').trim() || null,
                },
                {
                    side: 'ORIGIN',
                    chamber: originChamber,
                    role: 'SECONDARY',
                    name: originSecondaryName,
                    committeeId: originSecondaryId,
                    referredDateStr: item.FirstReadingDateHouseOfOrigin ?? null,
                    reportedOutDateStr: null,
                    reportAction: null,
                },
                {
                    side: 'OPPOSITE',
                    chamber: oppChamber,
                    role: 'PRIMARY',
                    name: oppPrimaryName,
                    committeeId: oppPrimaryId,
                    referredDateStr: item.FirstReadingDateOppositeHouse ?? null,
                    reportedOutDateStr: item.ReportDateOppositeHouse ?? null,
                    reportAction: (item.ReportActionOppositeHouse || '').trim() || null,
                },
                {
                    side: 'OPPOSITE',
                    chamber: oppChamber,
                    role: 'SECONDARY',
                    name: oppSecondaryName,
                    committeeId: oppSecondaryId,
                    referredDateStr: item.FirstReadingDateOppositeHouse ?? null,
                    reportedOutDateStr: null,
                    reportAction: null,
                },
            ]

            // Decide the "current" committee:
            // Prefer opposite-side assignments only if the bill has actually crossed (FirstReadingDateOppositeHouse exists).
            // Otherwise use origin-side. Within a side, prefer PRIMARY over SECONDARY.
            const currentCandidate =
                (item.FirstReadingDateOppositeHouse
                    ? assignments.find((a) => a.side === 'OPPOSITE' && a.role === 'PRIMARY' && a.committeeId) ||
                      assignments.find((a) => a.side === 'OPPOSITE' && a.role === 'SECONDARY' && a.committeeId)
                    : null) ||
                assignments.find((a) => a.side === 'ORIGIN' && a.role === 'PRIMARY' && a.committeeId) ||
                assignments.find((a) => a.side === 'ORIGIN' && a.role === 'SECONDARY' && a.committeeId) ||
                null

            // Look up existing current committee (if any) so we can update/clear it safely
            const existingCurrent = await prisma.billCurrentCommittee.findUnique({
                where: { billId: bill.id },
                select: {
                    billId: true,
                    committeeId: true,
                },
            })

            if (currentCandidate && currentCandidate.committeeId) {
                const referredDate =
                    currentCandidate.referredDateStr ? new Date(currentCandidate.referredDateStr) : null

                // Upsert current committee assignment
                await prisma.billCurrentCommittee.upsert({
                    where: { billId: bill.id },
                    update: {
                        committeeId: currentCandidate.committeeId,
                        referredDate: referredDate ?? undefined,
                        dataSource: {
                            source: 'legislation.json',
                            matchedFrom: currentCandidate,
                            rawCommittees: {
                                CommitteePrimaryOrigin: item.CommitteePrimaryOrigin,
                                CommitteeSecondaryOrigin: item.CommitteeSecondaryOrigin,
                                CommitteePrimaryOpposite: item.CommitteePrimaryOpposite,
                                CommitteeSecondaryOpposite: item.CommitteeSecondaryOpposite,
                            },
                        },
                    },
                    create: {
                        billId: bill.id,
                        committeeId: currentCandidate.committeeId,
                        referredDate: referredDate ?? undefined,
                        dataSource: {
                            source: 'legislation.json',
                            matchedFrom: currentCandidate,
                            rawCommittees: {
                                CommitteePrimaryOrigin: item.CommitteePrimaryOrigin,
                                CommitteeSecondaryOrigin: item.CommitteeSecondaryOrigin,
                                CommitteePrimaryOpposite: item.CommitteePrimaryOpposite,
                                CommitteeSecondaryOpposite: item.CommitteeSecondaryOpposite,
                            },
                        },
                    },
                })

                // Optional: emit a COMMITTEE_REFERRAL event if it changed
                if (!existingCurrent || existingCurrent.committeeId !== currentCandidate.committeeId) {
                    await prisma.billEvent.create({
                        data: {
                            billId: bill.id,
                            eventType: BillEventType.COMMITTEE_REFERRAL,
                            chamber: currentCandidate.chamber,
                            committeeId: currentCandidate.committeeId,
                            eventTime: referredDate ?? new Date(),
                            summary: `${billNumber}: Referred to ${currentCandidate.name ?? 'committee'}`,
                            payload: {
                                fromCommitteeId: existingCurrent?.committeeId ?? null,
                                toCommitteeId: currentCandidate.committeeId,
                                matchedFrom: currentCandidate,
                            },
                        },
                    })
                }
            } else {
                // No committee in JSON; if we previously had a current committee, clear it
                if (existingCurrent) {
                    await prisma.billCurrentCommittee.delete({
                        where: { billId: bill.id },
                    })
                }
            }

            // Populate committee history for any matched committees (primary/secondary, origin/opposite)
            for (const a of assignments) {
                if (!a.committeeId) continue

                const referredDate = a.referredDateStr ? new Date(a.referredDateStr) : null
                const reportedOutDate = a.reportedOutDateStr ? new Date(a.reportedOutDateStr) : null

                // Find an existing history row for this committee referral (best-effort match)
                const existingHistory = await prisma.billCommitteeHistory.findFirst({
                    where: {
                        billId: bill.id,
                        committeeId: a.committeeId,
                        referredDate: referredDate ?? undefined,
                    },
                    select: { id: true },
                })

                if (!existingHistory) {
                    await prisma.billCommitteeHistory.create({
                        data: {
                            billId: bill.id,
                            committeeId: a.committeeId,
                            referredDate: referredDate ?? undefined,
                            reportedOutDate: reportedOutDate ?? undefined,
                            reportAction: a.reportAction ?? undefined,
                            dataSource: {
                                source: 'legislation.json',
                                matchedFrom: a,
                            },
                        },
                    })
                } else {
                    // Update report fields if they later become available
                    await prisma.billCommitteeHistory.update({
                        where: { id: existingHistory.id },
                        data: {
                            reportedOutDate: reportedOutDate ?? undefined,
                            reportAction: a.reportAction ?? undefined,
                            dataSource: {
                                source: 'legislation.json',
                                matchedFrom: a,
                            },
                        },
                    })
                }
            }


            // @HERE

            // If there's been a change in status, create a BillEvent
            // @TODO compare other things here, not just the straight status (the scraper may have faster info too)
            // @TODO this might be better off in the shared helper, but...
            if ( ! existingBill ) {
                // introduced
                await prisma.billEvent.create({
                    data: {
                        billId: bill.id,
                        eventType: BillEventType.BILL_INTRODUCED,
                        chamber: originChamber,
                        summary: `${billNumber}: Bill created`,
                        payload: {
                            sessionYear,
                            sessionCode,
                            statusDesc,
                        },
                    }
                })
            } else if ( existingBill.statusDesc !== statusDesc ) {
                await prisma.billEvent.create({
                    data: {
                        billId: bill.id,
                        eventType: BillEventType.BILL_STATUS_CHANGED,
                        chamber: originChamber,
                        summary: createStatusChangedSummary(
                            billNumber,
                            existingBill?.statusDesc ?? null,
                            statusDesc
                        ),
                        payload: {
                            oldStatus: existingBill?.statusDesc ?? null,
                            newStatus: statusDesc,
                            sessionYear,
                            sessionCode,
                        },
                        // processedForAlerts defaults to false
                    },
                })
            }

            // Record vote/actions for origin + opposite chamber
            const candidates = buildActionCandidates( item, originChamber )

            for (const c of candidates) { 
                if (!c.dateStr || !c.actionText) continue 

                // Parse YYYY-MM-DD safely
                const actionDate = new Date(c.dateStr) 

                // Resolve committee for report actions (committee votes)
                const committeeId = c.kind === 'REPORT' 
                    ? await resolveCommitteeIdByName(c.committeeName, c.chamber) 
                    : null 

                const up = await upsertBillAction({ 
                    billId: bill.id,
                    chamber: c.chamber,
                    actionDate,
                    description: c.actionText,
                    committeeId,
                    sequence: c.sequence,
                    kind: c.kind,
                    raw: { source: 'legislation.json', side: c.side, ...c },
                })

                // If this action represents a committee vote, emit COMMITTEE_VOTE_RECORDED
                // (Only for report-kind actions; floor vote events can be added later if desired)
                if (c.kind === 'REPORT' && up.isVote) { 
                    await maybeCreateCommitteeVoteEvent({ 
                        billId: bill.id,
                        chamber: c.chamber,
                        committeeId,
                        actionDate,
                        description: c.actionText,
                        actionId: up.actionId,
                    })
                }
            }

            // short circuit after 100 for now @TODO remove
            // if ( billsCount > 11 ) {
            //     return false
            // }

            // Loop
            billsCount++
        }


        await finishScrapeRun(run.id, {
            success: true,
            billsCount,
        })

        return {
            statusCode: 200,
            body: JSON.stringify({ ok: true, bills: billsCount }),
        }
    } catch (err) {
        console.error('MGA bills JSON scraper error', err)
        await finishScrapeRun(run.id, {
            success: false,
            error: err,
        })
        return {
            statusCode: 500,
            body: JSON.stringify({ ok: false, error: String(err) }),
        }
    } finally {
        await prisma.$disconnect()
    }
}
