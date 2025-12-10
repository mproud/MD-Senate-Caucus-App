// Sync bills from the MGA's JSON feed

import 'dotenv/config'
import { BillEventType, Chamber } from '@prisma/client'
import { prisma } from './shared/prisma'
import { fetchJson } from './shared/http'
import { startScrapeRun, finishScrapeRun } from './shared/logging'

// @TODO this needs to pull from the archive link optionally too
const LEGISLATION_JSON_URL =
    'https://web.archive.org/web/20250327170322/https://mgaleg.maryland.gov/2025rs/misc/billsmasterlist/legislation.json'
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

function deriveSessionYearAndCode(item: RawBill): { sessionYear: number; sessionCode: string } {
    // "2025 Regular Session" → 2025
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
            `No Legislator match for "${sponsorPrimary}" (lastName: "${lastName}")`
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

            const chamber = mapChamber(billNumber)

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
            const primarySponsorId = resolvePrimarySponsorId( item.SponsorPrimary, legislatorIndex )

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
                    chamber,
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
                    chamber,
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

            // If there's been a change in status, create a BillEvent
            // @TODO compare other things here, not just the straight status (the scraper may have faster info too)
            // @TODO this might be better off in the shared helper, but...
            if ( ! existingBill ) {
                // introduced
                await prisma.billEvent.create({
                    data: {
                        billId: bill.id,
                        eventType: BillEventType.BILL_INTRODUCED,
                        chamber,
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
                        chamber,
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
