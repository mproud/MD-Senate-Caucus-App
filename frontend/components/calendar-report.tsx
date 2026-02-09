import type { CalendarDay } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { AlertCircle } from "lucide-react"

type CalendarType =
    | "FIRST_READING"
    | "COMMITTEE_REPORT"
    | "THIRD_READING"
    | "SPECIAL_ORDER"
    | "LAID_OVER"
    | (string & {})

type FloorCalendarItem = {
    id: number
    position: number | null
    billNumber: string | null
    notes?: string | null
    actionText?: string | null
    bill?: {
        id: number
        billNumber: string
        shortTitle?: string | null
        statusDesc?: string | null
    } | null
}

type FloorCalendar = {
    id: number
    calendarType: CalendarType
    calendarNumber: number | null // used as "Report No." for committee reports, and "Calendar Number" otherwise
    calendarName?: string | null
    calendarDate: string | Date
    dataSource?: {
        header?: {
            consentCalendar?: number | boolean | null // sometimes present
        }
    } | null
    committee?: {
        abbreviation?: string | null
        name?: string | null
    } | null
    items: FloorCalendarItem[]
}

type OrganizedGroup = {
    /** Stable key for React + grouping */
    key: string
    heading: string
    committeeName?: string | null
    committeeAbbrev?: string | null
    reportNumber?: number | null
    consentCalendarNumber?: number | null
    /** All calendars that fell into this "report" bucket */
    // calendars: Array<{
    //     calendarId: number
    //     calendarNumber: number | null
    //     items: FloorCalendarItem[]
    // }>
    /** Flattened items (optional convenience) */
    items: FloorCalendarItem[]
}

type OrganizedSection = {
    title: string
    groups: OrganizedGroup[]
}

type BillAction = {
    id?: number | string
    chamber?: string | null
    actionCode?: string | null
    committeeId?: number | string | null
    source?: string | null
    voteResult?: string | null
    description?: string | null
    yesVotes?: number | null
    noVotes?: number | null
    absent?: number | null
    excused?: number | null
    notVoting?: number | null
    notes?: string | null
    dataSource?: any
}

// Helpers to pick and format committee votes from billEvents
type VoteCounts = {
    yesVotes?: number | null
    noVotes?: number | null
    abstain?: number | null
    excused?: number | null
    absent?: number | null
    notVoting?: number | null
}

type CommitteeVoteEvent = {
    id?: number | string
    type?: string | null
    eventType?: string | null
    committeeId?: number | string | null
    source?: "MGA" | "MANUAL" | string | null

    // common count field names (support multiple)
    yesVotes?: number | null
    noVotes?: number | null
    abstain?: number | null
    abstains?: number | null
    excused?: number | null
    absent?: number | null
    notVoting?: number | null

    voteCounts?: VoteCounts | null // if you store nested counts
    result?: string | null
    motion?: string | null
    details?: string | null
    date?: string | Date | null

    voteResult?: string | null
}

type BillVote = {
    billActionId: number | string
    vote?: string | null
    legislator?: {
        party?: Party | null
    } | null
}

function toInt(n: unknown): number | null {
    if (typeof n === "number" && Number.isFinite(n)) return n
    if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n)
    return null
}

function extractCountsFromVoteAiResult(action: any): Required<VoteCounts> | null {
    const vr = action?.dataSource?.voteAiResult?.vote
    if (!vr) return null

    // Prefer totalsRow if present (most reliable)
    const t = vr.totalsRow ?? vr

    const yesVotes = toInt(t.yeas) ?? 0
    const noVotes = toInt(t.nays) ?? 0
    const abstain = toInt(t.abstain) ?? 0
    const excused = toInt(t.excused) ?? 0
    const absent = toInt(t.absent) ?? 0

    // your UI includes notVoting but AI payload likely doesn't; default to 0
    const notVoting = toInt(t.notVoting) ?? 0

    return { yesVotes, noVotes, abstain, excused, absent, notVoting }
}

function pickPreferredCommitteeVoteFromActions(
    billActions: any[] | null | undefined
): { action: any; counts: Required<VoteCounts> } | null {
    const actions = Array.isArray(billActions) ? billActions : []
    const committeeVotes = actions.filter((a) => a?.actionCode === "COMMITTEE_VOTE")

    if (committeeVotes.length === 0) return null

    // 1) COMMITTEE_VOTE with voteAiResult (use AI totals if possible; fall back to action counts)
    const withAi = committeeVotes
        .map((a) => {
            const aiCounts = extractCountsFromVoteAiResult(a)
            const actionCounts = extractCounts(a)
            const counts = aiCounts && hasAnyCounts(aiCounts) ? aiCounts : actionCounts
            return { action: a, counts }
        })
        .find((x) => x.action?.dataSource?.voteAiResult && hasAnyCounts(x.counts))

    if (withAi) return withAi

    // 2) COMMITTEE_VOTE manual entered with numbers
    const manualWithNumbers = committeeVotes
        .filter((a) => String(a?.source ?? "").toUpperCase() === "MANUAL")
        .map((a) => ({ action: a, counts: extractCounts(a) }))
        .find((x) => hasAnyCounts(x.counts))

    if (manualWithNumbers) return manualWithNumbers

    // 3) COMMITTEE_VOTE without voteAiResult (any), but prefer one that has counts
    const withoutAiWithCounts = committeeVotes
        .filter((a) => !a?.dataSource?.voteAiResult)
        .map((a) => ({ action: a, counts: extractCounts(a) }))
        .find((x) => hasAnyCounts(x.counts))

    if (withoutAiWithCounts) return withoutAiWithCounts

    // Last resort: return *something* so you can show 0-0 instead of "No recorded counts" if desired
    const fallback = committeeVotes[0]
    return fallback ? { action: fallback, counts: extractCounts(fallback) } : null
}

function getCommitteeVoteStatusText(action: any): string | null {
    if (!action) return null

    // Prefer the most human-friendly fields first
    const direct =
        action.description?.toString().trim() ||
        action.voteResult?.toString().trim() ||
        action.result?.toString().trim() ||
        action.motion?.toString().trim()

    if (direct) return direct

    // If AI parsed a result string, use it as a last resort
    const aiResult = action?.dataSource?.voteAiResult?.vote?.result
    if (typeof aiResult === "string" && aiResult.trim()) return aiResult.trim()

    return null
}

function pickPartyLineActionId(args: {
    sectionType?: CalendarType
    bill?: any
    committeeActionId?: number | string | null
}): number | string | null {
    const { sectionType, bill, committeeActionId } = args

    // For Third Reading, prefer the floor action id (the one bill.votes are tied to)
    if (sectionType === "THIRD_READING") {
        const actions = Array.isArray(bill?.actions) ? bill.actions : []
        const floor = actions.find((a: any) =>
            a?.chamber && (
                a?.actionCode === "THIRD_READING" ||
                a?.actionCode === "PASSAGE" ||
                String(a?.voteResult ?? "").toLowerCase().includes("passed")
            )
        )
        return floor?.id ?? null
    }

    // Otherwise, stick with committee vote action id (what you were doing)
    return committeeActionId ?? null
}

function DebugBlock({ title, data }: { title: string; data: any }) {
    return (
        <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">{title}</summary>
            <pre className="mt-2 max-w-[800px] overflow-auto rounded bg-muted p-2 text-[10px] leading-tight">
                {JSON.stringify(data, null, 2)}
            </pre>
        </details>
    )
}

function pickBestPartyLineVotes(args: {
    bill?: any
    sectionType?: CalendarType
    votes?: BillVote[]
    fallbackCommitteeActionId?: number | string | null
}): { actionId: string | number | null; votes: BillVote[] } {
    const { bill, sectionType, votes = [], fallbackCommitteeActionId } = args

    const byActionId = new Map<string, BillVote[]>()
    for (const v of votes) {
        const k = String(v?.billActionId ?? "")
        if (!k) continue
        if (!byActionId.has(k)) byActionId.set(k, [])
        byActionId.get(k)!.push(v)
    }

    // Helper: return votes for an actionId if present
    const get = (id: any) => (id != null ? byActionId.get(String(id)) ?? [] : [])

    // 1) If we have a fallback committee action id (what you already compute), prefer it if it has votes
    const committeeVotes = get(fallbackCommitteeActionId)
    if (committeeVotes.length > 0) {
        return { actionId: fallbackCommitteeActionId ?? null, votes: committeeVotes }
    }

    // 2) For THIRD_READING, try to find the "Passed" / floor-ish actions and pick the one that actually has votes
    if (sectionType === "THIRD_READING") {
        const actions = Array.isArray(bill?.actions) ? bill.actions : []

        // candidate action ids in preferred order
        const candidateIds = actions
            .filter((a: any) =>
                a?.chamber &&
                (
                    a?.actionCode === "THIRD_READING" ||
                    a?.actionCode === "PASSAGE" ||
                    String(a?.voteResult ?? "").toLowerCase().includes("passed") ||
                    String(a?.description ?? "").toLowerCase().includes("passed")
                )
            )
            .map((a: any) => a.id)
            .filter((id: any) => id != null)

        for (const id of candidateIds) {
            const vs = get(id)
            if (vs.length > 0) return { actionId: id, votes: vs }
        }
    }

    // 3) Otherwise: pick the actionId that has the most votes (works even if action metadata is messy)
    let bestId: string | null = null
    let bestVotes: BillVote[] = []
    for (const [id, vs] of byActionId.entries()) {
        if (vs.length > bestVotes.length) {
            bestId = id
            bestVotes = vs
        }
    }
    if (bestId) return { actionId: bestId, votes: bestVotes }

    // 4) Nothing matched
    return { actionId: null, votes: [] }
}

function extractCounts(e: CommitteeVoteEvent | null | undefined): Required<VoteCounts> {
    const vc = (e?.voteCounts ?? {}) as VoteCounts

    const yesVotes = toInt(e?.yesVotes ?? vc.yesVotes) ?? 0
    const noVotes = toInt(e?.noVotes ?? vc.noVotes) ?? 0
    const abstain = toInt(e?.abstain ?? (e as any)?.abstains ?? vc.abstain) ?? 0
    const excused = toInt(e?.excused ?? vc.excused) ?? 0
    const absent = toInt(e?.absent ?? vc.absent) ?? 0
    const notVoting = toInt(e?.notVoting ?? vc.notVoting) ?? 0

    return { yesVotes, noVotes, abstain, excused, absent, notVoting }
}

function hasAnyCounts(counts: VoteCounts): boolean {
    return (
        (counts.yesVotes ?? 0) > 0 ||
        (counts.noVotes ?? 0) > 0 ||
        (counts.abstain ?? 0) > 0 ||
        (counts.excused ?? 0) > 0 ||
        (counts.absent ?? 0) > 0 ||
        (counts.notVoting ?? 0) > 0
    )
}

function looksLikeCommitteeVote(e: CommitteeVoteEvent): boolean {
    // @TODO this isn't working as neatly as I had hoped.
    // Some events aren't logged as committee votes, or they're in the "events" not "actions"
    return true

    // const t = (e.type ?? e.eventType ?? "").toString().toUpperCase()
    // // adjust this to the actual BillEventType(s)
    // return t.includes("COMMITTEE") && (t.includes("VOTE") || t.includes("ACTION"))
}


function pickHouseFloorVote(bill: any) {
    if (!bill?.actions?.length) return null

    return bill.actions.find((a: any) =>
        a.chamber === "HOUSE" &&
        (
            a.actionCode === "THIRD_READING" ||
            a.actionCode === "PASSAGE" ||
            a.voteResult?.toLowerCase().includes("passed")
        ) &&
        (a.yesVotes ?? 0) > 0
    ) ?? null
}

// >>>>>>>>>>>>> this needs to use billActions, not billEvents

function pickCommitteeVoteForCommittee(args: {
    billNumber: string
    billActions: CommitteeVoteEvent[]
    committeeId: number | string | null | undefined
}): {
    action: CommitteeVoteEvent | null
    counts: Required<VoteCounts> | null
    source: "MGA_SCRAPE" | "MANUAL" | string | null
    usedManualCountsToFillMGA: boolean
    manualEvent: CommitteeVoteEvent | null
} {
    const { billNumber, billActions, committeeId } = args
    // console.log('----- Pick committe vote', billNumber, committeeId, { billActions } )
    if (!committeeId) {
        return {
            action: null,
            counts: null,
            source: null,
            usedManualCountsToFillMGA: false,
            manualEvent: null,
        }
    }

    const relevant = (billActions ?? []).filter((e) => {
        const sameCommittee = String(e.committeeId ?? "") === String(committeeId)
        return sameCommittee && looksLikeCommitteeVote(e)
    })

    if (relevant.length === 0) {
        return {
            action: null,
            counts: null,
            source: null,
            usedManualCountsToFillMGA: false,
            manualEvent: null,
        }
    }

    // const mga = relevant.filter((e) => (e.source ?? "").toString().toUpperCase() === "MGA_SCRAPE")
    // const manual = relevant.filter((e) => (e.source ?? "").toString().toUpperCase() === "MANUAL")

    const mga = relevant.filter((e) => (e.source ?? "").toString().toUpperCase().startsWith("MGA"))
    const manual = relevant.filter((e) => (e.source ?? "").toString().toUpperCase() === "MANUAL")

    // console.log( billNumber, { relevant, mga, manual })

    const bestManual = manual[0] ?? null
    const bestMga = mga[0] ?? null

    const mgaCounts = bestMga ? extractCounts(bestMga) : null
    const manualCounts = bestManual ? extractCounts(bestManual) : null

    const mgaHasCounts = mgaCounts ? hasAnyCounts(mgaCounts) : false
    const manualHasCounts = manualCounts ? hasAnyCounts(manualCounts) : false

    // Prefer MGA *if* it has counts
    if (bestMga && mgaHasCounts) {
        return {
            action: bestMga,
            counts: mgaCounts!,
            source: bestMga.source ?? "MGA_SCRAPE",
            usedManualCountsToFillMGA: false,
            manualEvent: bestManual,
        }
    }

    // MGA exists but has no counts -> fill counts from manual if possible
    if (bestMga && !mgaHasCounts && bestManual && manualHasCounts) {
        return {
            action: bestMga,
            counts: manualCounts!,
            source: bestMga.source ?? "MGA",
            usedManualCountsToFillMGA: true,
            manualEvent: bestManual,
        }
    }

    // Otherwise fall back to manual (even if it's also empty, at least you can show motion/result)
    if (bestManual) {
        return {
            action: bestManual,
            counts: manualCounts ?? extractCounts(bestManual),
            source: bestManual.source ?? "MANUAL",
            usedManualCountsToFillMGA: false,
            manualEvent: bestManual,
        }
    }

    // Last resort: MGA (no counts)
    return {
        action: bestMga,
        counts: mgaCounts ?? (bestMga ? extractCounts(bestMga) : null),
        source: bestMga?.source ?? "MGA",
        usedManualCountsToFillMGA: false,
        manualEvent: bestManual,
    }
}

function formatCountsShort(counts: Required<VoteCounts> | null): string {
    if (!counts) return "--"
    // short common display
    return `${counts.yesVotes}-${counts.noVotes}`
}

function formatCountsBreakdown(counts: Required<VoteCounts> | null): string | null {
    if (!counts) return null
    // full breakdown like 8-2-0-1 (yea-nay-abstain-absent) + optionally excused/notVoting if you want
    const core = `${counts.yesVotes}-${counts.noVotes}` // -${counts.abstain}-${counts.absent}`
    // const extras =
    //     counts.excused > 0 || counts.notVoting > 0
    //         ? ` (E:${counts.excused} NV:${counts.notVoting})`
    //         : ""
    // return core + extras
    return core // @TODO add absent, excused, etc
}



// Shorten the name of the sponsor
const shortenSponsor = ( name: string ) => {
    return name.replace('Senator ', 'Sen. ').replace('Delegate ', 'Del. ').replace(' Committee', '').trim()
}

const toDate = (d: string | Date) => (d instanceof Date ? d : new Date(d))

function sectionDateLabel(rawCalendars: FloorCalendar[], calendarType: CalendarType) {
    const dates = rawCalendars
        .filter((c) => c.calendarType === calendarType)
        .map((c) => {
            if (c.calendarDate instanceof Date) {
                return c.calendarDate
            }

            // Force YYYY-MM-DD to be treated as UTC
            if (typeof c.calendarDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.calendarDate)) {
                return new Date(`${c.calendarDate}T00:00:00.000Z`)
            }

            return new Date(c.calendarDate)
        })
        .filter((d) => !Number.isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())

    if (dates.length === 0) return ""

    const fmt = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    })

    const first = dates[0]
    const last = dates[dates.length - 1]

    const sameDay =
        first.getUTCFullYear() === last.getUTCFullYear() &&
        first.getUTCMonth() === last.getUTCMonth() &&
        first.getUTCDate() === last.getUTCDate()

    if (sameDay) {
        return fmt.format(first)
    }

    return `${fmt.format(first)} – ${fmt.format(last)}`
}


function organizeFloorCalendars(raw: FloorCalendar[] | undefined | null): { sections: OrganizedSection[] } {
    const safeRaw: FloorCalendar[] = Array.isArray(raw) ? raw : []

    const sectionDefs: Array<{ title: string; match: (t: CalendarType) => boolean }> = [
        { title: "First Reading Calendar", match: (t) => t === "FIRST_READING" },
        { title: "Second Reading Calendar", match: (t) => t === "COMMITTEE_REPORT" },
        { title: "Third Reading Calendar", match: (t) => t === "THIRD_READING" },
        { title: "Special Order Calendar", match: (t) => t === "SPECIAL_ORDER" },
        { title: "Laid Over Bills Calendar", match: (t) => t === "LAID_OVER" },
        { title: "Vetoed Bills Calendar", match: (t) => t === "VETOED" },
    ]

    const getConsentNumber = (c: FloorCalendar): number | null => {
        const v = c.dataSource?.header?.consentCalendar
        if (typeof v === "number") return v
        // if API ever sends boolean true, we can't infer a number, so treat as null
        return null
    }

    const committeeLabel = (c: FloorCalendar) =>
        c.committee?.name?.trim() ||
        c.committee?.abbreviation?.trim() ||
        "Committee"

    const groupKeyFor = (c: FloorCalendar): string => {
        if (c.calendarType === "COMMITTEE_REPORT") {
            const committee = committeeLabel(c)
            const reportNo = c.calendarNumber ?? -1
            const consentNo = getConsentNumber(c)
            return `COMMITTEE_REPORT|${committee}|report:${reportNo}|consent:${consentNo ?? "none"}`
        }

        // Non-committee calendars are grouped by calendar number
        const n = c.calendarNumber ?? -1
        return `${c.calendarType}|calendar:${n}`
    }

    const headingFor = (c: FloorCalendar): string => {
        if (c.calendarType === "COMMITTEE_REPORT") {
            const committee = committeeLabel(c)
            const reportNo = c.calendarNumber ?? ""
            const consentNo = getConsentNumber(c)

            // matches the required "committee name, report X, consent calendar Z" variant when present
            return consentNo != null
                ? `${committee} - Report ${reportNo}, Consent Calendar ${consentNo}`
                : `${committee} - Report ${reportNo}`
        }

        if ( c.calendarName ) {
            return c.calendarName
        }

        return `Calendar Number ${c.calendarNumber ?? ""}`
    }

    const sortItems = (items: FloorCalendarItem[]) =>
        (items ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    const buildSection = (title: string, calendars: FloorCalendar[]): OrganizedSection => {
        const map = new Map<string, OrganizedGroup>()

        for (const cal of calendars) {
            const key = groupKeyFor(cal)

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    heading: headingFor(cal),
                    committeeName: cal.committee?.name ?? null,
                    committeeAbbrev: cal.committee?.abbreviation ?? null,
                    reportNumber: cal.calendarType === "COMMITTEE_REPORT" ? cal.calendarNumber ?? null : null,
                    consentCalendarNumber: cal.calendarType === "COMMITTEE_REPORT" ? getConsentNumber(cal) : null,
                    items: [],
                })
            }

            //                     calendars: [],

            const group = map.get(key)!

            const sorted = sortItems(cal.items ?? [])
            // group.calendars.push({
            //     calendarId: cal.id,
            //     calendarNumber: cal.calendarNumber ?? null,
            //     items: sorted,
            // })

            // convenience: flatten all items into one list for the table with each of the bills in the report
            group.items.push(...sorted)
        }

        // Sort groups in a predictable way:
        // - Committee reports: by reportNumber, then consentCalendarNumber
        // - Others: by calendarNumber
        const groups = [...map.values()].sort((a, b) => {
            const aIsCommittee = a.reportNumber != null
            const bIsCommittee = b.reportNumber != null

            // Committee reports: sort by committee name first, then report #
            if (aIsCommittee && bIsCommittee) {
                const an = (a.committeeName ?? a.committeeAbbrev ?? a.heading).trim()
                const bn = (b.committeeName ?? b.committeeAbbrev ?? b.heading).trim()

                const byName = an.localeCompare(bn, undefined, { sensitivity: "base" })
                if (byName !== 0) return byName

                const ar = a.reportNumber ?? Number.MAX_SAFE_INTEGER
                const br = b.reportNumber ?? Number.MAX_SAFE_INTEGER
                if (ar !== br) return ar - br

                const ac = a.consentCalendarNumber ?? Number.MAX_SAFE_INTEGER
                const bc = b.consentCalendarNumber ?? Number.MAX_SAFE_INTEGER
                if (ac !== bc) return ac - bc

                return a.heading.localeCompare(b.heading)
            }

            // Non-committee calendars: keep numeric calendar ordering
            const ar = a.reportNumber ?? Number.MAX_SAFE_INTEGER
            const br = b.reportNumber ?? Number.MAX_SAFE_INTEGER
            if (ar !== br) return ar - br

            const ac = a.consentCalendarNumber ?? Number.MAX_SAFE_INTEGER
            const bc = b.consentCalendarNumber ?? Number.MAX_SAFE_INTEGER
            if (ac !== bc) return ac - bc

            return a.heading.localeCompare(b.heading)
        })

        return { title, groups }
    }

    const sections: OrganizedSection[] = sectionDefs.map((def) => {
        const calendars = safeRaw.filter((c) => def.match(c.calendarType))
        return buildSection(def.title, calendars)
    })

    return { sections }
}

// @TODO these need to be responsive
const COLS = {
    flag: "w-[28px]",
    bill: "w-[92px] print:w-[80px]",
    sponsor: "w-[100px] lg:w-[140px] print:w-[100px]",
    title: "w-[350px] lg:w-[520px] print:w-[250px]",
    committee: "w-[95px] lg:w-[160px]",
    vote: "w-[100px]",
    action: "w-[95px] lg:w-[180px]",
    notes: "w-[260px] print:text-sm",
} as const

const cellBase = "align-top whitespace-normal"

type Party = "Democrat" | "Republican"

type ActionVote = {
    vote?: string | null
    legislator?: {
        party?: Party | null
    } | null
}

type CommitteeActionWithVotes = {
    votes?: ActionVote[] | null
}

const normalizeVote = (v: string | null | undefined) => (v ?? "").trim().toUpperCase()

const normalizeYeaNay = (v: string | null | undefined): "YEA" | "NAY" | null => {
    const val = normalizeVote(v)

    if (val === "YEA" || val === "AYE" || val === "YES" || val === "Y") {
        return "YEA"
    }

    if (val === "NAY" || val === "NO" || val === "N") {
        return "NAY"
    }

    return null
}

function getCommitteePartyLineLabel( input: CommitteeActionWithVotes | ActionVote[] | null | undefined ): "Unanimous" | "Party Line" | "Party Split" | null {
    const votes = Array.isArray(input) ? input : (input?.votes ?? [])

    const considered = votes.filter((v): v is ActionVote => {
        if (!v) return false

        const val = normalizeYeaNay(v.vote)
        const party = v.legislator?.party ?? null

        return val !== null && (party === "Democrat" || party === "Republican")
    })

    if (considered.length === 0) {
        return null
    }

    let totalYea = 0
    let totalNay = 0
    let dYea = 0
    let dNay = 0
    let rYea = 0
    let rNay = 0

    for (const v of considered) {
        const val = normalizeYeaNay(v.vote)
        const party = v.legislator?.party ?? null

        if (val === "YEA") {
            totalYea += 1
            if (party === "Democrat") dYea += 1
            if (party === "Republican") rYea += 1
        }

        if (val === "NAY") {
            totalNay += 1
            if (party === "Democrat") dNay += 1
            if (party === "Republican") rNay += 1
        }
    }

    if (totalYea > 0 && totalNay === 0) {
        return "Unanimous"
    }

    const dTotal = dYea + dNay
    const rTotal = rYea + rNay

    const isPartyLine_DYea_RNay =
        dTotal > 0 &&
        rTotal > 0 &&
        dYea === dTotal &&
        rNay === rTotal

    const isPartyLine_DNay_RYea =
        dTotal > 0 &&
        rTotal > 0 &&
        dNay === dTotal &&
        rYea === rTotal

    if (isPartyLine_DYea_RNay || isPartyLine_DNay_RYea) {
        return "Party Line"
    }

    return "Party Split"
}

function renderPartyLineBadge(label: "Unanimous" | "Party Line" | "Party Split" | null) {
    if (!label) return null

    if (label === "Unanimous") {
        return (
            <Badge variant="secondary" className="mt-1 inline-flex items-center gap-1">
                <span>Unanimous</span>
            </Badge>
        )
    }

    if (label === "Party Line") {
        return (
            <Badge variant="destructive" className="mt-1 inline-flex items-center gap-1">
                <span className="font-bold">!!</span>
                <span>Party line</span>
            </Badge>
        )
    }

    return (
        <Badge variant="destructive" className="mt-1 inline-flex items-center gap-1">
            <span className="font-bold">!!</span>
            <span>Party split</span>
        </Badge>
    )
}

export async function CalendarReport({ calendarData, hideCalendars }: { calendarData: CalendarDay, hideCalendars?: string }) {
    // Show the filter by date, checkbox to show all bills or split votes only, show alert bills

    // @TODO fix this eventually. Need central/correct type decs
    const rawCalendars = ((calendarData as any).calendars ?? []) as FloorCalendar[]

    const hiddenIds = (hideCalendars ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

    const hiddenTypes = new Set(
        hiddenIds
            .map((id) => {
                const map: Record<string, CalendarType> = {
                    first: "FIRST_READING",
                    second: "COMMITTEE_REPORT",
                    third: "THIRD_READING",
                    special: "SPECIAL_ORDER",
                    laid_over: "LAID_OVER",
                    vetoed: "VETOED",
                }
                return map[id]
            })
            .filter(Boolean)
    )

    const visibleCalendars = hiddenTypes.size
        ? rawCalendars.filter((c) => !hiddenTypes.has(c.calendarType))
        : rawCalendars

    const calendars = organizeFloorCalendars(visibleCalendars)

    // Need to find -- Second Reading, find vote with Committee ID. Prefer official if there are numbers, or unofficial if there aren't any numbers
    //                 Match house votes if this bill was in the house OR if it has a crossfile with motion
    
    // return <code><pre>{JSON.stringify(rawCalendars, null, 2)}</pre></code>
    
    const typeByTitle: Record<string, CalendarType> = {
        "First Reading Calendar": "FIRST_READING",
        "Second Reading Calendar": "COMMITTEE_REPORT",
        "Third Reading Calendar": "THIRD_READING",
        "Special Order Calendar": "SPECIAL_ORDER",
        "Laid Over Bills Calendar": "LAID_OVER",
        "Vetoed Bills Calendar": "VETOED",
    }

    return (
        <>
            {calendars.sections.map(( section, index ) => {
                const sectionType = typeByTitle[section.title]
                const isExplicitlyHidden = sectionType ? hiddenTypes.has(sectionType) : false
                const hasBills = section.groups.length > 0

                if (isExplicitlyHidden && !hasBills) {
                    return null
                }

                const isLast = index === calendars.sections.length - 1

                return (
                    <div key={`${index}-${section.title}`} className={!isLast ? 'page-break-after' : undefined}>
                        <h2 className="text-2xl font-bold tracking-tight text-center">
                            {section.title}
                        </h2>
                        <p className="text-xl font-medium tracking-tight text-center mb-4">
                            {(() => {
                                // map section title -> calendarType used in your organizer defs
                                const typeByTitle: Record<string, CalendarType> = {
                                    "First Reading Calendar": "FIRST_READING",
                                    "Second Reading Calendar": "COMMITTEE_REPORT",
                                    "Third Reading Calendar": "THIRD_READING",
                                    "Special Order Calendar": "SPECIAL_ORDER",
                                    "Laid Over Bills Calendar": "LAID_OVER",
                                    "Vetoed Bills Calendar": "VETOED",
                                }

                                const t = typeByTitle[section.title]
                                return t ? sectionDateLabel(rawCalendars, t) : ""
                            })()}
                        </p>

                        {(section.groups.length == 0) && (
                            <div className="mb-6">No Bills on this calendar</div>
                        )}

                        {section.groups.map(( group, groupIndex ) => (
                            <div key={`${groupIndex}-${group.key}`}>
                                <div className="mb-8 w-full no-print-scroll overflow-x-auto">
                                    <Table className="min-w-[980px] table-fixed print-friendly">
                                        <colgroup>
                                            <col className={COLS.flag} />
                                            <col className={COLS.bill} />
                                            <col className={`hidden md:table-column print:!table-column ${COLS.sponsor}`} />
                                            <col className={COLS.title} />
                                            <col className={`hidden md:table-column print:!table-column ${COLS.committee}`} />
                                            <col className={`hidden lg:table-column print:!table-column ${COLS.vote}`} />
                                            <col className={`hidden xl:table-column print:!table-column ${COLS.action}`} />
                                            <col className={`hidden xl:table-column print:!table-column ${COLS.notes}`} />
                                        </colgroup>

                                        <TableHeader>
                                            <TableRow>
                                                <TableHead
                                                    colSpan={8}
                                                    className="text-md text-left border-0 border-t-2 border-b-2 border-black"
                                                >
                                                    <span className="font-semibold">{group.heading}</span>
                                                </TableHead>
                                            </TableRow>

                                            <TableRow className="font-semibold">
                                                <TableHead className={COLS.flag} />
                                                <TableHead className={COLS.bill}>Bill</TableHead>
                                                <TableHead className={`hidden md:table-cell print:!table-cell ${COLS.sponsor}`}>Sponsor</TableHead>
                                                <TableHead className={COLS.title}>Title</TableHead>
                                                <TableHead className={`hidden md:table-cell print:!table-cell ${COLS.committee}`}>Committee</TableHead>
                                                <TableHead className={`hidden lg:table-cell print:!table-cell ${COLS.vote}`}>Vote</TableHead>
                                                <TableHead className={`hidden xl:table-cell print:!table-cell ${COLS.action}`}>Action</TableHead>
                                                <TableHead className={`hidden xl:table-cell print:!table-cell ${COLS.notes}`}>Notes</TableHead>
                                            </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                            {group.items.map((item: any) => {
                                                const DEBUG_BILL = "000000000" // Change this to a bill number if needed - debug party line split
                                                const debugThisRow = item.billNumber === DEBUG_BILL

                                                // pull billEvents + current committee id for this row/section
                                                // const billEvents = (item.bill?.events ?? []) as CommitteeVoteEvent[]
                                                const billActions = ((item.bill?.actions ?? []) as BillAction[])
                                                const currentCommitteeId = item.committeeId ?? item.committee?.id ?? null

                                                const bill = item.bill

                                                // Case 1: Bill started in HOUSE and already passed there
                                                const houseVote =
                                                    bill?.originChamber === "HOUSE"
                                                        ? pickHouseFloorVote(bill)
                                                        : null

                                                // Case 2: Senate bill with a crossfile that passed the House
                                                const crossfileHouseVote =
                                                    !houseVote && bill?.crossFileExternalId
                                                        ? pickHouseFloorVote(bill.crossFile)
                                                        : null

                                                const houseFloorVote = houseVote ?? crossfileHouseVote

                                                // On THIRD_READING items, CalendarItem.committeeId is often null.
                                                // Prefer BillCurrentCommittee.committeeId, and for vote display prefer lastVoteAction when available.
                                                const effectiveCommitteeId =
                                                    item.committeeId ??
                                                    item.committee?.id ??
                                                    item.bill?.currentCommittee?.committeeId ??
                                                    null

                                                const lastVoteAction = item.bill?.currentCommittee?.lastVoteAction ?? null

                                                const committeeVote = lastVoteAction
                                                    ? {
                                                        action: lastVoteAction,
                                                        counts: extractCounts(lastVoteAction),
                                                        source: lastVoteAction.source ?? null,
                                                        usedManualCountsToFillMGA: false,
                                                        manualEvent: null,
                                                    }
                                                    : pickCommitteeVoteForCommittee({
                                                        billNumber: item.billNumber,
                                                        billActions,
                                                        committeeId: effectiveCommitteeId,
                                                    })

                                                const actionId = committeeVote.action?.id ?? null

                                                // console.log('>>>> item', { currentCommitteeId, committeeId: item.committeeId })
                                                // console.log('>>> item', item.billNumber, { billActions, item })

                                                //  Change these for third reading
                                                // const committeeVote = pickCommitteeVoteForCommittee({
                                                //     billNumber: item.billNumber,
                                                //     billActions,
                                                //     committeeId: currentCommitteeId,
                                                // })

                                                // const actionId = committeeVote.action?.id ?? null

                                                const votes = (item.bill?.votes ?? []) as BillVote[]

                                                const committeeVotesForAction =
                                                    actionId != null
                                                        ? votes.filter((v: BillVote) => String(v.billActionId) === String(actionId))
                                                        : []

                                                const partyLineActionId = pickPartyLineActionId({
                                                    sectionType,
                                                    bill: item.bill,
                                                    committeeActionId: actionId,
                                                })

                                                const votesForPartyLine =
                                                    partyLineActionId != null
                                                        ? votes.filter((v: BillVote) => String(v.billActionId) === String(partyLineActionId))
                                                        : []

                                                
                                                // Since things are inconsistent, try finding a few ways
                                                const committeeVotes = billActions.filter(
                                                    (a) => a.actionCode === "COMMITTEE_VOTE"
                                                )

                                                const selectedCommitteeVote =
                                                    // 1. Prefer one with notes
                                                    committeeVotes.find((v) => v.notes) ||

                                                    // 2. Otherwise one with voteAi
                                                    committeeVotes.find((v) => v.dataSource?.voteAi) ||

                                                    // 3. Otherwise manual
                                                    committeeVotes.find((v) => v.dataSource?.manual) ||

                                                    // 4. Fallback
                                                    committeeVotes[0]

                                                const preferredCommitteeVote = pickPreferredCommitteeVoteFromActions(billActions)
                                                const chosenActionForStatus = committeeVote.action ?? preferredCommitteeVote?.action ?? null
                                                const chosenStatusText = getCommitteeVoteStatusText(chosenActionForStatus)

                                                // const partyLineLabel = getCommitteePartyLineLabel(committeeVotesForAction)

                                                const partyLinePicked = pickBestPartyLineVotes({
                                                    bill: item.bill,
                                                    sectionType,
                                                    votes,
                                                    fallbackCommitteeActionId: actionId,
                                                })

                                                const partyLineLabel = getCommitteePartyLineLabel(partyLinePicked.votes)

                                                const isFlagged = Boolean(item.bill?.isFlagged)

                                                if ( ! item.bill ) return

                                                return (
                                                    <TableRow key={item.id} className={isFlagged ? "bg-yellow-100 hover:bg-yellow-200" : ""}>
                                                        {/* <TableCell>
                                                            <pre>{JSON.stringify(item.bill, null, 2)}</pre>
                                                        </TableCell> */}
                                                        <TableCell className={`${cellBase} ${COLS.flag} font-medium`}>
                                                            {isFlagged ? (
                                                                <span
                                                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-black text-xs font-extrabold"
                                                                    aria-label="Flagged bill"
                                                                    title="Flagged bill"
                                                                >
                                                                    !
                                                                </span>
                                                            ) : null}
                                                        </TableCell>
                                                        <TableCell className={`${cellBase} ${COLS.bill} font-medium`}>
                                                            <Link href={`/bills/${item.billNumber}`} className="text-primary hover:underline">
                                                                {item.billNumber}
                                                            </Link>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden md:table-cell print:table-cell ${COLS.sponsor}`}>
                                                            <div className="line-clamp-4">
                                                                {shortenSponsor(item.bill.sponsorDisplay)}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} ${COLS.title}`}>
                                                            {/* 3-line clamp with ellipsis */}
                                                            <div className="line-clamp-3 print:line-clamp-8 leading-snug">
                                                                {item.bill.shortTitle}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden md:table-cell print:!table-cell ${COLS.committee}`}>
                                                            {/* { item.committee?.abbreviation && item.committee.abbreviation } */}
                                                            { item.bill.currentCommittee ? (
                                                                <>{item.bill.currentCommittee.committee.abbreviation}</>
                                                            ): (
                                                                <>---</>
                                                            )}
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden lg:table-cell print:!table-cell ${COLS.vote}`}>
                                                            <div className="text-sm">
                                                                {committeeVote.action && (
                                                                    <>
                                                                        {/* <div className="flex items-center gap-2">
                                                                            <span className="font-medium">
                                                                                {formatCountsShort(committeeVote.counts)}
                                                                            </span>

                                                                            <Badge variant={String(committeeVote.source).toUpperCase() === "MGA" ? "default" : "destructive"}>
                                                                                {String(committeeVote.source ?? "--").toUpperCase()}
                                                                                {committeeVote.usedManualCountsToFillMGA ? " (counts from manual)" : ""}
                                                                            </Badge>
                                                                        </div> */}

                                                                        {/* breakdown line (optional) */}
                                                                        {/* {committeeVote.counts && hasAnyCounts(committeeVote.counts) ? (
                                                                            <div>
                                                                                {formatCountsBreakdown(committeeVote.counts)}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="mt-1 text-xs text-muted-foreground">No recorded counts</div>
                                                                        )} */}

                                                                        {committeeVote.counts && hasAnyCounts(committeeVote.counts) ? (
                                                                            <div>{formatCountsBreakdown(committeeVote.counts)}</div>
                                                                        ) : preferredCommitteeVote && hasAnyCounts(preferredCommitteeVote.counts) ? (
                                                                            <div>{formatCountsBreakdown(preferredCommitteeVote.counts)}</div>
                                                                        ) : (
                                                                            <div className="mt-1 text-xs text-muted-foreground">No recorded counts</div>
                                                                        )}
                                                                        
                                                                        {/* Optional: show motion/result if I can grab it? @TODO ---
                                                                        {(committeeVote.action.motion || committeeVote.action.result) && (
                                                                            <div className="mt-1 text-xs">
                                                                                {committeeVote.action.motion ?? committeeVote.action.result}
                                                                            </div>
                                                                        )}*/}
                                                                    </>
                                                                )}
                                                                {( ! committeeVote.action && selectedCommitteeVote ) && (
                                                                    <div>
                                                                        {selectedCommitteeVote?.yesVotes}-{selectedCommitteeVote?.noVotes}
                                                                    </div>
                                                                )}

                                                                {( ! committeeVote.action && ! selectedCommitteeVote ) && (
                                                                    <div className="text-muted-foreground">----</div>
                                                                )}
                                                                {/* <textarea>{JSON.stringify({ selectedCommitteeVote })}</textarea> */}

                                                                {partyLineLabel && (
                                                                    <>
                                                                        {/* <span className="text-xs">
                                                                            {partyLineLabel}
                                                                        </span>
                                                                        <br /> */}
                                                                        {renderPartyLineBadge(partyLineLabel)}
                                                                    </>
                                                                )}

                                                                {debugThisRow && (
                                                                    <DebugBlock
                                                                        title="Party line debug"
                                                                        data={{
                                                                            sectionType,
                                                                            billNumber: item.billNumber,
                                                                            actionIdFromCommitteeVote: actionId,
                                                                            partyLineActionId,
                                                                            votesTotal: votes.length,
                                                                            votesForPartyLineCount: votesForPartyLine.length,
                                                                            votesForPartyLineSample: votesForPartyLine.slice(0, 5),
                                                                            // show what floor/committee actions exist
                                                                            actionsSummary: (billActions ?? []).map((a: any) => ({
                                                                                id: a.id,
                                                                                chamber: a.chamber,
                                                                                actionCode: a.actionCode,
                                                                                voteResult: a.voteResult,
                                                                                description: a.description,
                                                                                yesVotes: a.yesVotes,
                                                                                noVotes: a.noVotes,
                                                                            })),
                                                                        }}
                                                                    />
                                                                )}

                                                            </div>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden xl:table-cell print:!table-cell ${COLS.action}`}>
                                                            <div className="line-clamp-4">
                                                                {(() => {
                                                                    // If actionText exists, show it and do NOT show the committee action
                                                                    if (item.actionText?.trim()) {
                                                                        return (
                                                                            <>
                                                                                {item.actionText}
                                                                            </>
                                                                        )
                                                                    }

                                                                    // Otherwise fall back to committee action text (from the chosen vote)
                                                                    const committeeActionText =
                                                                        chosenStatusText ||
                                                                        committeeVote.action?.voteResult?.trim() ||
                                                                        committeeVote.action?.motion?.trim() ||
                                                                        committeeVote.action?.result?.trim()

                                                                    return committeeActionText ? <>{committeeActionText}</> : null
                                                                })()}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className={`${cellBase} hidden xl:table-cell print:!table-cell ${COLS.notes}`}>
                                                            <div className="line-clamp-5">
                                                                {item.bill.crossFileExternalId && (
                                                                    <>
                                                                        <span className="font-sm">
                                                                            X-Filed Bill: {item.bill.crossFileExternalId}
                                                                        </span>
                                                                        <br />
                                                                    </>
                                                                )}

                                                                {houseFloorVote && (
                                                                    <>
                                                                        <span className="text-xs">
                                                                            House Vote: ({houseFloorVote.yesVotes}-{houseFloorVote.noVotes})
                                                                        </span>
                                                                        <br />
                                                                    </>
                                                                )}

                                                                {/* {item.bill.crossFileExternalId && (
                                                                    <>
                                                                        --- @TODO - get the house vote if there is one ---
                                                                        <span className="font-sm">
                                                                            House Vote: (90-42-1-1)
                                                                        </span>
                                                                        <br />
                                                                    </>
                                                                )} */}

                                                                <div>
                                                                    {item.bill.notes
                                                                        .slice()
                                                                        .filter((note: any) => note.visibility !== "HIDDEN")
                                                                        // Pinned notes first, then unpinned
                                                                        .sort((a: any, b: any) => {
                                                                            const aPinned = a.visibility === "PINNED"
                                                                            const bPinned = b.visibility === "PINNED"

                                                                            if (aPinned !== bPinned) return aPinned ? -1 : 1

                                                                            // Within each group, most recent first
                                                                            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                                                                        })
                                                                        .map((note: any) => (
                                                                            <p key={note.id}>{note.content}</p>
                                                                        ))
                                                                    }
                                                                    {selectedCommitteeVote?.notes && (
                                                                        <p>{selectedCommitteeVote.notes}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                            </div>
                        ))}
                    </div>
                )
            })}
        </>
    )
}