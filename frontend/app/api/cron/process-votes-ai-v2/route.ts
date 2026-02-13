import * as cheerio from "cheerio"
import OpenAI from "openai"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isValidCronSecret } from "@/lib/scrapers/helpers"
import { auth } from "@clerk/nextjs/server"
import { BillAction, BillEventType, Chamber, Prisma, Vote } from "@prisma/client"
import { finishScrapeRun, startScrapeRun } from "@/lib/scrapers/logging"
import { fetchRawHtml } from "@/lib/scrapers/http"
import { getActiveSessionCode } from "@/lib/get-system-setting"

type VoteProcessingStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "FAILED_QUOTA"

type VoteChoice = "yes" | "no" | "notVoting" | "excused" | "absent"

type MemberVote = {
    legislatorId: number
    vote: VoteChoice
    memberName: string
}

type VoteCounts = {
    yeas: number
    nays: number
    notVoting: number
    excused: number
    absent: number
}

type VoteTotals = {
    yes: number
    no: number
    notVoting: number
    excused: number
    absent: number
}

type VotePayload = {
    vote: {
        date: string
        type: "committee" | "floor" | string
        result: string
        details: string

        totalsRow?: {
            yeas: number
            nays: number
            notVoting: number
            excused: number
            absent: number
        }

        yeas?: number
        nays?: number
        notVoting?: number
        excused?: number
        absent?: number

        memberVotes: MemberVote[]
    }
    manual: boolean
    billActionId: number
}

type BillEventDataSource = {
    actionId?: number
    source?: string
    pdf?: string
    voteTotals?: VoteTotals
    pdfStatus?: string
}

type BillActionDataSource = {
    mga?: {
        billUrl?: string
        voteUrl?: string
    }
    voteProcessing?: {
        status?: VoteProcessingStatus
        attempts?: number
        lastError?: string
        lastAttemptAt?: Date
        nextAttemptAt?: Date
        voteUrl?: string
    }
    voteResult?: VotePayload
    [key: string]: unknown
}

type VoteState = {
    status: VoteProcessingStatus
    attempts: number
    lastAttemptAt: Date | string
    nextAttemptAt?: Date | string
    lastError?: string[] | string
}

interface VotePDFLinksResponse {
    voteText: string
    href: string
    parentText: string
    chamber: string
}

// Map vote codes to actual messages
const voteResultMap: Record<string, string> = {
    FAV: "Favorable",
    FWA: "Favorable with Amendment",
    UNF: "Unfavorable",
}

/*
    Create an OpenAI client

    Requires:
    - OPENAI_API_KEY in environment variables
*/
function getOpenAiClient() {
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    })
}

// Convert a string version of the Chamber to the Prisma type
const stringToChamber = ( chamber: string ): Chamber => {
    if ( chamber.toUpperCase() === "HOUSE" ) {
        return Chamber.HOUSE
    } else {
        return Chamber.SENATE
    }
}

// Format the legislator name like it is in the vote sheet
const formatMemberName = ( legislator: {
    id: number
    fullName: string
    firstName: string | null
    middleName: string | null
    lastName: string | null
}): string => {
    const firstName = legislator.firstName ?? ""
    const middleName = legislator.middleName ?? ""
    const lastName = legislator.lastName ?? ""

    // If the middle name is more than two characters, include it as a second last name
    if ( middleName.length > 2 ) {
        return `${middleName} ${lastName}, ${firstName.charAt(0)},`
    }

    return `${lastName}, ${firstName.charAt(0)}.`
}

// JSON schema for floor votes
function getAiFloorVoteJsonSchema() {
    return {
        name: "mga_floor_vote_parse",
        strict: true,
        schema: {
            type: "object",
            additionalProperties: false,
            required: ["vote", "manual", "billActionId"],
            properties: {
                vote: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                        "date",
                        "type",
                        "result",
                        "details",
                        "totalsRow",
                        "memberVotes"
                    ],
                    properties: {
                        date: { type: "string" },
                        type: { type: "string", enum: ["floor"] },
                        result: { type: "string", minLength: 1 },
                        details: { type: "string" },

                        totalsRow: {
                            type: "object",
                            additionalProperties: false,
                            required: ["yeas", "nays", "notVoting", "excused", "absent"],
                            properties: {
                                yeas: { type: "integer" },
                                nays: { type: "integer" },
                                notVoting: { type: "integer" },
                                excused: { type: "integer" },
                                absent: { type: "integer" }
                            }
                        },

                        memberVotes: {
                            type: "array",
                            items: {
                                type: "object",
                                additionalProperties: false,
                                required: ["vote", "legislatorId", "memberName"],
                                properties: {
                                    vote: {
                                        type: "string",
                                        enum: ["yes", "no", "notVoting", "excused", "absent"]
                                    },
                                    legislatorId: { type: "integer" },
                                    memberName: { type: "string" }
                                }
                            }
                        }
                    }
                },
                manual: { type: "boolean" },
                billActionId: { type: "integer" }
            }
        }
    }
}

// Read and normalize BillAction.dataSource
function getBillActionDataSource(value: unknown): BillActionDataSource {
    if (!value || typeof value !== "object") return {}
    return value as BillActionDataSource
}

// Read and normalize BillEvent.dataSource
function getBillEventDataSource(value: unknown): BillEventDataSource {
    if (!value || typeof value !== "object") return {}
    return value as BillEventDataSource
}

function normalizeVoteText(s: unknown): string {
    return String(s ?? "").replace(/\s+/g, " ").trim()
}

function normalizeVoteValue(v: unknown): VoteChoice {
    const raw = String(v ?? "").trim().toLowerCase()

    if (raw === "yea" || raw === "yay" || raw === "yes") return "yes"
    if (raw === "nay" || raw === "no") return "no"

    if (raw === "abstain" || raw === "abstained" || raw === "not voting" || raw === "notvoting") return "notVoting"

    if (raw === "excused") return "excused"
    if (raw === "absent") return "absent"
    if (raw === "excused (absent)" || raw === "excused absent") return "absent"

    return "notVoting"
}

function mapVoteValueToEnum( raw: string ): Vote {
    if ( raw === "yea" || raw === "yay" || raw === "yes" ) return Vote.YEA
    if ( raw === "nay" || raw === "no" ) return Vote.NAY

    if ( raw === "abstain" || raw === "abstained" || raw === "not voting" || raw === "notvoting" ) return Vote.ABSTAIN

    if ( raw === "excused" ) return Vote.EXCUSED
    if ( raw === "absent" || raw === "excused (absent)" || raw === "excused absent" ) return Vote.ABSENT
    
    return Vote.ABSTAIN
}

// Find BillActions to process
const findCandidateVoteActions = async ( limit: number ) => {
    const activeSessionCode = await getActiveSessionCode()

    const nowIso = new Date().toISOString()

    return prisma.billAction.findMany({
        where: {
            bill: { sessionCode: activeSessionCode },
            isVote: true,
            source: "MGA_JSON",
            // @TODO change out for committees, but focus on floor only for now
            // Revised - find only second and third reading AND not processing.done AND due according to time/retries
            AND: [
                // kind is SECOND or THIRD
                {
                    OR: [
                        { dataSource: { path: ["kind"], equals: "SECOND" } },
                        { dataSource: { path: ["kind"], equals: "THIRD" } },
                    ],
                },

                // voteProcessing.status != DONE (but include missing/null)
                {
                    OR: [
                        { dataSource: { path: ["voteProcessing", "status"], not: "DONE" } },
                        // include rows where voteProcessing.status is missing or null
                        { dataSource: { path: ["voteProcessing", "status"], equals: Prisma.AnyNull } },
                    ],
                },

                // Include any that haven't been processed yet or need it according to time
                {
                    OR: [
                        { dataSource: { path: ["voteProcessing", "lastAttemptAt"], equals: Prisma.AnyNull } },
                        { dataSource: { path: ["voteProcessing", "nextAttemptAt"], lt: nowIso } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            dataSource: true
        },
        orderBy: [
            // { actionDate: "desc" },
            // { id: "desc" },
            { id: "asc" },
        ],
        take: limit
    })
}

/*
    Create a BillEvent after floor votes are recorded

    Avoid creating duplicates by checking for extisting with the same eventType + billID + chamber + payload.actionId
*/
async function createFloorVoteRecordedEvent(args: {
    tx: Prisma.TransactionClient
    billId: number
    billActionId: number
    chamber: Chamber
    pdfUrl: string
    voteTotals: VoteTotals
}) {
    const { voteTotals } = args

    const existing = await args.tx.billEvent.findFirst({
        where: {
            billId: args.billId,
            chamber: args.chamber,
            eventType: BillEventType.FLOOR_VOTE_RECORDED,
            payload: {
                path: ["actionId"],
                equals: args.billActionId
            }
        },
        select: { id: true, payload: true }
    })

    let id = null

    if (existing) {
        const existingPayload = getBillEventDataSource( existing.payload )

        await args.tx.billEvent.update({
            where: { id: existing.id },
            data: {
                payload: {
                    ...existingPayload,
                    source: "ai-vote-v2",
                    pdf: args.pdfUrl,
                    counts: voteTotals,
                    pdfStatus: "PROCESSED",
                }
            }
        })

        id = existing.id
    } else {
        const summary =
            args.chamber === Chamber.HOUSE
                ? "Floor vote recorded from MGA site (House)"
                : "Floor vote recorded from MGA site (Senate)"

        const created = await args.tx.billEvent.create({
            data: {
                billId: args.billId,
                committeeId: null,
                chamber: args.chamber,
                eventType: BillEventType.FLOOR_VOTE_RECORDED,
                summary,
                payload: {
                    actionId: args.billActionId,
                    source: "ai-vote-v2",
                    pdf: args.pdfUrl,
                    voteTotals,
                    pdfStatus: "PROCESSED",
                } as Prisma.JsonObject
            },
            select: { id: true }
        })

        id = created.id
    }

    // Create a new event just for updating the results
    await args.tx.billEvent.create({
        data: {
            billId: args.billId,
            chamber: args.chamber,
            eventType: BillEventType.FLOOR_VOTE_RESULTS_RECORDED,
            summary: "Vote totals processed from PDF",
            payload: {
                source: "ai-vote-v2",
                actionId: args.billActionId,
                counts: voteTotals,
                originalEventId: id,
            },
        }
    })

    return id
}

// Figure out if the action is due
function isDueToRun( nextAttemptAt: Date | undefined, now: Date) {
    if ( ! nextAttemptAt ) return true

    const nextDate = new Date( nextAttemptAt )

    if (Number.isNaN(nextDate.getTime())) return true

    return nextDate.getTime() <= now.getTime()
}

// Identify whether an error is an OpenAI quota/rate-limit error
function classifyOpenAiError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)

    const is429 = message.includes("429")
    const isQuota =
        message.toLowerCase().includes("exceeded your current quota") ||
        message.toLowerCase().includes("insufficient_quota") ||
        message.toLowerCase().includes("billing details")

    const isRateLimit =
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("too many requests")

    if (is429 && isQuota) {
        return { kind: "quota" as const, message }
    }

    if (is429 && isRateLimit) {
        return { kind: "rate_limit" as const, message }
    }

    if (is429) {
        return { kind: "rate_limit" as const, message }
    }

    return { kind: "other" as const, message }
}

// Compute a longer backoff when quota is exceeded
function computeQuotaBackoffHours(hours: number) {
    return new Date(Date.now() + hours * 60 * 60 * 1000)
}

// Build a bill URL based on the bill number and session code
function buildMgaBillDetailsUrl({ billNumber, sessionCode } : { billNumber: string; sessionCode: string }) {
    return `https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/${encodeURIComponent(billNumber.trim())}?ys=${encodeURIComponent(sessionCode.trim())}`
}

// Compute counts from memberVotes
function computeCountsFromMemberVotes(memberVotes: MemberVote[]): VoteCounts {
    const counts: VoteCounts = {
        yeas: 0,
        nays: 0,
        notVoting: 0,
        excused: 0,
        absent: 0
    }

    for (const mv of memberVotes) {
        if (mv.vote === "yes") counts.yeas += 1
        else if (mv.vote === "no") counts.nays += 1
        else if (mv.vote === "notVoting") counts.notVoting += 1
        else if (mv.vote === "excused") counts.excused += 1
        else if (mv.vote === "absent") counts.absent += 1
    }

    return counts
}

// Find vote links on the bill page
function findVotePdfLinksOnBillPage( billUrl: string, html: string) {
    const $ = cheerio.load(html)

    const output: VotePDFLinksResponse[] = []

    $("table#detailsHistory a[href]").each((_, el) => {
        const href = String($(el).attr("href") ?? "").trim()
        if ( ! href ) return

        const lower = href.toLowerCase()
        const isPdf = lower.endsWith(".pdf")

        const isVotePdf =
            lower.includes("/votes/") ||
            lower.includes("/votes_comm/") ||
            lower.includes("/votes_comm")

        if ( isPdf && isVotePdf ) {
            const voteText = $(el).text().trim()
            const parentText = $(el).parent().text().trim()
            const row = $(el).closest("tr")
            const chamber = row.find("td").first().text().trim()

            output.push({
                voteText,
                href: toAbsoluteUrl( billUrl, href ),
                parentText,
                chamber,
            })
        }
    })

    return Array.from(new Set(output))
}

// Convert a possibly-relative href to an absolute URL
function toAbsoluteUrl(baseUrl: string, href: string) {
    try {
        return new URL(href, baseUrl).toString()
    } catch {
        return href
    }
}

// Pick the best vote PDF from a list of discovered vote PDF URLs.
function pickBestVotePdfUrl({
    chamber,
    rawVoteLinks,
    billUrl,
    actionCode,
}: {
    chamber: string
    rawVoteLinks?: VotePDFLinksResponse[]
    billUrl: string
    actionCode: string
}): { voteText: string; href: string; parentText: string; chamber: string } | null {
    if ( ! rawVoteLinks ) return null

    if ( rawVoteLinks.length === 0 ) return null

    // Ignore this for now. We'll add committee votes in later
    // if ( committeeId ) {
    //     const committeeVoteUrl = voteUrls.find(u => u.toLowerCase().includes("/votes_comm"))
    //     if ( committeeVoteUrl ) return committeeVoteUrl
    // }

    // Find all votes from the target chamber
    const chamberVotes = rawVoteLinks.filter( u => u.chamber.toLowerCase() === chamber.toLowerCase() )

    // Find the vote for the actionCode (ex - Third Reading, etc)
    // @TODO change this so it's actually using actionCode and action (ex - second reading vote, amendments eventually, committee, etc)
    const match = chamberVotes.find(v =>
        /third reading/i.test(v.parentText || "") &&
        /passed/i.test(v.parentText || "")
    )

    // Bail if there's no third reading vote. Fix this for the senate counts eventually
    if ( ! match ) return null

    return {
        ...match,
        href: toAbsoluteUrl( billUrl, match.href ),
    }
}

// Compute next attempt time using capped exponential-ish backoff
function computeNextAttemptAt(attempts: number) {
    const minutes = [2, 5, 15, 30]
    const idx = Math.min(Math.max(attempts, 0), minutes.length - 1)
    const ms = minutes[idx] * 60_000
    return new Date(Date.now() + ms)
}

// Normalize the Floor Vote response from OpenAI
function normalizeVotePayload( payload: VotePayload ): VotePayload {
    const { vote } = payload

    const normalizedMemberVotes = (vote.memberVotes ?? []).map(mv => ({
        legislatorId: Number(mv.legislatorId),
        memberName: normalizeVoteText(mv.memberName),
        vote: normalizeVoteValue(mv.vote)
    }))

    const totalsRow = vote.totalsRow ?? vote ?? ({} as any)

    const normalized: VotePayload = {
        billActionId: Number(payload.billActionId),
        manual: Boolean(payload.manual),
        vote: {
            date: normalizeVoteText(vote.date),
            type: "floor",
            result: normalizeVoteText(vote.result),
            details: normalizeVoteText(vote.details),

            yeas: Number(totalsRow.yeas),
            nays: Number(totalsRow.nays),
            notVoting: Number(totalsRow.notVoting),
            excused: Number(totalsRow.excused),
            absent: Number(totalsRow.absent),

            memberVotes: normalizedMemberVotes
        }
    }

    return normalized
}

// Validate the result
function validateVotePayload({ payload, roster }: {
    payload: VotePayload
    roster: Array<{
        legislatorId: number
        memberName: string
        memberFormattedName: string
        memberFirstName: string
        memberMiddleName: string
        memberLastName: string
    }>
}) {
    const errors: string[] = []
    const normalized = normalizeVotePayload(payload)

    const rosterIds = new Set(roster.map(r => r.legislatorId))
    const seen = new Set<number>()
    const duplicates: number[] = []

    for (const mv of normalized.vote.memberVotes) {
        if (seen.has(mv.legislatorId)) {
            duplicates.push(mv.legislatorId)
        }
        seen.add( mv.legislatorId )

        if (!rosterIds.has(mv.legislatorId)) {
            errors.push(`memberVotes includes legislatorId not in roster: ${mv.legislatorId}`)
        }
    }

    if (duplicates.length > 0) {
        const uniq = Array.from(new Set(duplicates)).slice(0, 10)
        errors.push(`Duplicate legislatorId in memberVotes: ${uniq.join(", ")}${duplicates.length > 10 ? " ..." : ""}`)
    }

    const computed = computeCountsFromMemberVotes(normalized.vote.memberVotes)
    const { vote: totals } = normalized

    const expectedLength =
        Number(totals.yeas) +
        Number(totals.nays) +
        Number(totals.notVoting) +
        Number(totals.excused) +
        Number(totals.absent)

    const uniqueCount = seen.size

    if (normalized.vote.memberVotes.length !== expectedLength) {
        errors.push(`memberVotes length mismatch: got ${normalized.vote.memberVotes.length} but totals imply ${expectedLength}`)
    }

    if (uniqueCount !== expectedLength) {
        errors.push(`memberVotes unique legislatorId count mismatch: got ${uniqueCount} but totals imply ${expectedLength}`)
    }

    if (computed.yeas !== totals.yeas) errors.push(`Totals mismatch: computed yeas=${computed.yeas} but totals yeas=${totals.yeas}`)
    if (computed.nays !== totals.nays) errors.push(`Totals mismatch: computed nays=${computed.nays} but totals nays=${totals.nays}`)
    if (computed.notVoting !== totals.notVoting) errors.push(`Totals mismatch: computed notVoting=${computed.notVoting} but totals notVoting=${totals.notVoting}`)
    if (computed.excused !== totals.excused) errors.push(`Totals mismatch: computed excused=${computed.excused} but totals excused=${totals.excused}`)
    if (computed.absent !== totals.absent) errors.push(`Totals mismatch: computed absent=${computed.absent} but totals absent=${totals.absent}`)

    const underVoteCount = expectedLength - uniqueCount
    if (underVoteCount > 0) {
        // Build a set of all legislators seen in memberVotes
        const votedIds = new Set(normalized.vote.memberVotes.map(v => v.legislatorId))

        // Filter the roster to only those that aren't in memberVotes
        const missingFromMemberVotes = roster.filter( r => !votedIds.has( r.legislatorId ))

        console.log('Missing Members', { missingFromMemberVotes, length: roster.length })

        errors.push(`Undervote detected: missing ${underVoteCount} memberVotes relative to totals`)

        if (missingFromMemberVotes.length === 0) {
            errors.push(`Unable to list missing legislators because all rosterIds appear present, but uniqueCount is still short. Check for non-roster ids or parsing errors.`)
        } else if (missingFromMemberVotes.length <= 25) {
            errors.push(`Missing legislators: ${missingFromMemberVotes.join(", ")}`)
        } else {
            errors.push(`Missing legislators (first 25): ${missingFromMemberVotes.join(", ")}. Total missing from roster: ${missingFromMemberVotes.length}`)
        }
    }

    return { errors, normalized, computed, totals, expectedLength, uniqueCount }
}

// Build the list of legislators the prompt expects
// legislatorId firstName middleName lastName fullName lastFirstInitial
const buildLegislatorRoster = async ( chamber: Chamber, asOf: Date ) => {
    const legislators = await prisma.legislator.findMany({
        where: {
            terms: {
                some: {
                    chamber,
                    startDate: { lte: asOf },
                    OR: [
                        { endDate: null },
                        { endDate: { gt: asOf } }
                    ],
                }
            }
        },
        select: {
            id: true,
            fullName: true,
            firstName: true,
            middleName: true,
            lastName: true
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    })

    return legislators.map(legislator => ({
        legislatorId: legislator.id,
        memberName: legislator.fullName,
        memberFormattedName: formatMemberName(legislator),
        memberFirstName: legislator.firstName ?? "",
        memberMiddleName: legislator.middleName ?? "",
        memberLastName: legislator.lastName ?? "",
    }))
}

const extractVotesWithAi = async ({ url, action }: { url: string; action: BillAction }) => {
    const client = getOpenAiClient()

    // Get the list of legislators
    const chamber = stringToChamber( action.chamber ?? "" )

    const roster = await buildLegislatorRoster( chamber, action.actionDate )
    const rosterText = roster
        .map(m => `${m.legislatorId}\t${m.memberName}\t${m.memberFormattedName}\t${m.memberFirstName}\t${m.memberMiddleName}\t${m.memberLastName}`)
        .join("\n")

    const baseInstructions = [
        "You extract per-person votes from an MGA FLOOR roll-call vote PDF.",
        "The PDF shows totals near the top (Yeas, Nays, Not Voting, Excused, Absent).",
        "Then it lists names under headings such as Voting Yea, Voting Nay, Not Voting, Excused from Voting, Absent/Excused (Absent).",
        "",
        "NAME MATCHING (CRITICAL):",
        "1) Names in the PDF are commonly formatted as 'LASTNAME, F' (last name comma first initial).",
        "2) Some last names repeat, you MUST use first initial to disambiguate (JOHNSON, A vs JOHNSON, S).",
        "3) You MUST match names ONLY using the provided roster list and output roster legislatorId values only.",
        `4) There may be a line for "Mr. President" or "President". If so, map that to Bill Ferguson (legislatorId: 1681)`,
        `5) There may be a line for "Speaker". If so, map that to Joseline A. Peña-Melnyk (legislatorId: 1929)`,
        "",
        "RECONCILIATION STEP (CRITICAL):",
        "Before you output JSON, you MUST reconcile the list with the PDF totals:",
        "- Count how many names are under Voting Yea, Voting Nay, Not Voting, Excused, Absent headings",
        "- Those counts MUST equal the totals near the top",
        "- If they do not match, re-scan the headings and move the mis-bucketed names until counts match exactly",
        "",
        "OUTPUT SIZE (CRITICAL):",
        "You MUST output exactly the number of memberVotes implied by totalsRow.",
        "Do NOT add extra roster members who are not listed in the PDF.",
        "The PDF totals determine how many people are in the vote.",
        "",
        "CRITICAL REQUIREMENTS:",
        "1) vote.totalsRow MUST match the PDF totals exactly.",
        "2) You MUST output exactly totalsRow.yeas + totalsRow.nays + totalsRow.notVoting + totalsRow.excused + totalsRow.absent memberVotes.",
        "Do NOT output extra names to try to cover the full roster.",
        "3) No duplicates. No non-roster members.",
        "4) The computed totals from memberVotes MUST match vote.totalsRow exactly.",
        "",
        "OUTPUT INTEGRITY (CRITICAL):",
        "- Every legislatorId must be unique (no duplicates).",
        "- The total number of names you output MUST equal the totals near the top.",
        "",
        "OUTPUT FORMAT (CRITICAL):",
        "- For each person, you MUST output legislatorId and memberName from the roster list.",
        "- legislatorId MUST be taken from the roster list only (no guessing, no made-up IDs).",
        "- You may include pdfName optionally, but legislatorId is required.",
        "- Include only the people who appear under the headings in the PDF.",
        "",
        "Mapping:",
        "- Listed under Voting Yea => vote='yes'",
        "- Listed under Voting Nay => vote='no'",
        "- Listed under Not Voting => vote='notVoting'",
        "- Listed under Absent or Excused (Absent) => vote='absent'",
        "- Listed under Excused from Voting => vote='excused'",
        "",
        "Return JSON only, matching the provided schema exactly."
    ].join(" ")

    const prompt = [
        `BillActionId: ${action.id}`,
        // `Bill: ${action.bill.billNumber} (${args.sessionCode})`,
        `Chamber: ${action.chamber ?? "UNKNOWN"}`,
        `ActionDateISO: ${action.actionDate}`,
        "",
        "Chamber roster (legislatorId, fullName, rosterKey(LAST, F), firstName, middleName, lastName):",
        rosterText,
        "",
        "Task:",
        "Read the attached FLOOR roll-call vote PDF.",
        "Extract votes by finding each name under the correct heading.",
        "Use rosterKey(LAST, F) to disambiguate same-last-name legislators.",
        "Use the totals near the top of the PDF for vote.totalsRow.",
        "Set vote.date from the Vote Date shown on the PDF (YYYY-MM-DD).",
        "Set vote.result to the motion outcome shown (Passed/Failed/etc.).",
        "Set vote.details to empty string unless there is a short, important note.",
        "Set vote.type to 'floor'."
    ].join("\n")

    async function runOnce(extraUserText: string | null) {
        const floorExtra = "\n\nIMPORTANT: When matching PDF names, use rosterKey(LAST, F). Do not guess between same-last-name entries."

        const userText = extraUserText
            ? `${prompt}${floorExtra}\n\nVALIDATION FEEDBACK:\n${extraUserText}`
            : `${prompt}${floorExtra}`

        const response = await client.responses.create({
            model: process.env.OPENAI_VOTE_MODEL ?? "gpt-4o-mini",
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: baseInstructions }]
                },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: userText },
                        { type: "input_file", file_url: url }
                    ]
                }
            ],
            text: {
                format: {
                    type: "json_schema",
                    ...(getAiFloorVoteJsonSchema())
                }
            }
        })

        const raw = response.output_text ?? ""
        const json = JSON.parse(raw) as VotePayload

        return normalizeVotePayload(json)
    }

    const attempt1 = await runOnce(null)

    // Validate the attempt
    const validateAttempt1Result = validateVotePayload({ payload: attempt1, roster })

    if ( validateAttempt1Result.errors.length === 0 ) {
        // Success! Bail
        console.log('Return attempt 1', { validateAttempt1Result })

        return validateAttempt1Result.normalized
    }

    // Give the model some feedback and try again
    const feedback = [
        "Your previous output failed validation.",
        "",
        "You MUST match the PDF totals exactly.",
        `PDF totals: yeas=${validateAttempt1Result.totals.yeas} nays=${validateAttempt1Result.totals.nays} notVoting=${validateAttempt1Result.totals.notVoting} excused=${validateAttempt1Result.totals.excused} absent=${validateAttempt1Result.totals.absent}`,
        `Expected total names: ${validateAttempt1Result.expectedLength}`,
        "",
        "Remember:",
        `1) There may be a line for "Mr. President" or "President". If so, map that to Bill Ferguson (legislatorId: 1681)`,
        `2) There may be a line for "Speaker". If so, map that to Joseline A. Peña-Melnyk (legislatorId: 1929)`,
        "",
        "Fix rules:",
        `- Output exactly ${validateAttempt1Result.expectedLength} entries`,
        "",
        "Re-scan the PDF headings and find the missing name(s).",
        "",
        "Fix these issues and output corrected JSON:",
        ...validateAttempt1Result.errors.map(e => `- ${e}`)
    ].join("\n")

    const attempt2 = await runOnce(feedback)

    // Validate the second attempt
    const validateAttempt2Result = validateVotePayload({ payload: attempt2, roster })

    if ( validateAttempt2Result.errors.length === 0 ) {
        // Success! Bail
        console.log('Return attempt 2', { validateAttempt2Result })
        return validateAttempt2Result.normalized
    }

    /////// Log/alert the failure somehow?
    throw new Error(`AI floor vote validation failed after 2 attempts:\n${validateAttempt2Result.errors.join("\n")}`)
}

// Save the vote failure so it can try again
const saveVoteFailure = async ( args: {
    billActionId: number
    dataSource: BillActionDataSource
    billUrl: string
    voteUrl: string | null
    attempts: number
    errorMessage: string
    status: VoteProcessingStatus
    nextAttemptAtISO: string
}) => {
    const now = new Date()

    const nextVoteProcessing: VoteState = {
        status: args.status,
        attempts: args.attempts,
        lastAttemptAt: now.toISOString(),
        nextAttemptAt: args.nextAttemptAtISO,
        lastError: args.errorMessage
    }

    await prisma.billAction.update({
        where: { id: args.billActionId },
        data: {
            dataSource: {
                ...args.dataSource,
                mga: {
                    ...(args.dataSource.mga ?? {}),
                    billUrl: args.billUrl,
                    voteUrl: args.voteUrl ?? (args.dataSource.mga?.voteUrl ?? undefined)
                },
                voteProcessing: nextVoteProcessing
            }
        }
    })

    return { nextAttemptAt: args.nextAttemptAtISO }
}

// Save the vote result to the database
const saveVoteResult = async ({
    action,
    votePayload,
    attempts,
    billUrl,
    voteUrl,
}: {
    action: BillAction
    votePayload: VotePayload
    attempts: number
    billUrl: string
    voteUrl: string
}) => {
    const now = new Date()

    // The type here needs to be fixed.
    const dataSource = getBillActionDataSource(action.dataSource)

    // Update the datasource in the row
    const nextVoteProcessing: VoteState = {
        status: "DONE",
        attempts,
        lastAttemptAt: now.toISOString(),
        nextAttemptAt: undefined,
        lastError: undefined
    }

    const { vote } = votePayload

    const yesVotes = Number(vote.yeas)
    const noVotes = Number(vote.nays)
    const notVoting = Number(vote.notVoting)
    const excused = Number(vote.excused)
    const absent = Number(vote.absent)

    const voteTotals = {
        yes: yesVotes,
        no: noVotes,
        notVoting,
        excused,
        absent,
    }

    const billActionUpdate: Prisma.BillActionUpdateInput = {
        source: "MGA_SCRAPE",

        yesVotes: Number.isFinite(yesVotes) ? yesVotes : undefined,
        noVotes: Number.isFinite(noVotes) ? noVotes : undefined,
        absent: Number.isFinite(absent) ? absent : undefined,
        excused: Number.isFinite(excused) ? excused : undefined,
        notVoting: Number.isFinite(notVoting) ? notVoting : undefined,

        // Map FWA and FAV etc to the full status
        voteResult: voteResultMap[ vote.result ] ?? vote.result,

        dataSource: {
            ...dataSource,
            mga: {
                ...(dataSource.mga ?? {}),
                billUrl: billUrl,
                voteUrl: voteUrl,
            },
            voteProcessing: nextVoteProcessing,
        }
    }

    // Transaction: update BillAction and replace Votes rows together
    const result = await prisma.$transaction(async tx => {
        const updatedAction = await tx.billAction.update({
            where: { id: action.id },
            data: billActionUpdate,
            select: {
                id: true,
                billId: true,
                chamber: true,
                committeeId: true,
                yesVotes: true,
                noVotes: true,
                absent: true,
                excused: true,
                notVoting: true,
                voteResult: true,
                source: true
            }
        })

        // Replace Votes rows for this BillAction
        await tx.votes.deleteMany({
            where: { billActionId: action.id }
        })

        const voteRows = vote.memberVotes.map(mv => {
            return {
                billId: action.billId,
                billActionId: action.id,
                legislatorId: mv.legislatorId,
                vote: mapVoteValueToEnum(mv.vote),
                metadata: {
                    source: "process-votes-ai-v2",
                    voteUrl: voteUrl,
                    // committeeId: vote.committeeId, // These aren't in here yet, we're just looking at floor votes
                    // committeeName: vote.committee,
                    // memberId: mv.memberId,
                    // memberName: mv.memberName,
                    legislatorId: mv.legislatorId,
                    legislatorName: mv.memberName,
                    totalsRow: vote.totalsRow
                } as Prisma.JsonObject
            }
        })

        await tx.votes.createMany({
            data: voteRows
        })

        // Create a BillEvent for Vote Recorded
        const billEventId = await createFloorVoteRecordedEvent({
            tx,
            billId: action.billId,
            billActionId: action.id,
            chamber: stringToChamber( action.chamber ?? "" ),
            pdfUrl: voteUrl,
            voteTotals
        })

        return {
            updatedAction,
            insertedVotes: voteRows.length,
            billEventId
        }
    })
    
    return { ...vote, result }
}

// Process a single bill action
const processBillAction = async (
    billActionId: number,
    options?: {
        force?: boolean
        dryRun?: boolean
    },
) => {
    const force = options?.force ?? false
    const dryRun = options?.dryRun ?? false

    if (force) {
        console.log(`Force processing billActionId=${billActionId}`)
    }

    if ( dryRun ) {
        console.log(`Dry run processing billActionId=${billActionId}`)
    }

    const action = await prisma.billAction.findUnique({
        where: { id: billActionId },
        include: {
            bill: true,
            committee: true,
        }
    })

    if ( ! action ) {
        return { billActionId, status: "SKIPPED" as const, reason: "Not found" }
    }

    if ( ! action.isVote ) {
        return { billActionId, status: "SKIPPED" as const, reason: "Not a vote action" }
    }

    // Get the current action's data
    const ds = getBillActionDataSource( action.dataSource )
    const now = new Date()

    const existingVoteProcessing = ds.voteProcessing
    const attempts = ( existingVoteProcessing?.attempts ?? 0 ) + 1

    // Skip if it's not time to run
    if ( ! isDueToRun( existingVoteProcessing?.nextAttemptAt, now) && ! force ) {
        return { billActionId, status: "SKIPPED" as const, reason: "Not due yet" }
    }

    // Use the billAction to find the vote URL
    const billUrl =
        ds.mga?.billUrl ??
            buildMgaBillDetailsUrl({
                billNumber: action.bill.billNumber,
                sessionCode: action.bill.sessionCode
            })

    // If there's a "kind" in the datasource, update the "motion" with Second Reading, Third Reading, etc
    const motionFromKind =
        ds.kind === "SECOND" ? "Second Reading"
            : ds.kind === "THIRD" ? "Third Reading"
            : undefined
    
    // Update the row to show we're processing
    await prisma.billAction.update({
        where: { id: action.id },
        data: {
            // Only set motion if it doesn't already exist
            ...( action.motion ? {} : motionFromKind ? { motion: motionFromKind } : {}),

            dataSource: {
                ...ds,
                voteProcessing: {
                    status: "PROCESSING",
                    attempts,
                    lastAttemptAt: now.toISOString(),
                    nextAttemptAt: undefined,
                    lastError: undefined
                },
                mga: {
                    ...(ds.mga ?? {}),
                    billUrl
                }
            }
        }
    })

    try {
        // Parse the HTML to find the vote link
        const billHtml = await fetchRawHtml( billUrl )
        const rawVoteLinks = findVotePdfLinksOnBillPage( billUrl, billHtml )

        // @TODO this needs to handle committee votes eventually too
        const picked = pickBestVotePdfUrl({
            chamber: action.chamber ?? "",
            rawVoteLinks,
            billUrl,
            actionCode: action.actionCode ?? "",
        })

        if ( ! picked ) {
            const nextAttemptAt = computeNextAttemptAt(attempts)

            const retry = await saveVoteFailure({
                billActionId: action.id,
                dataSource: ds,
                billUrl,
                voteUrl: null,
                attempts,
                errorMessage: "No vote PDF found on bill details page yet",
                status: "FAILED",
                nextAttemptAtISO: nextAttemptAt.toISOString()
            })

            return {
                billActionId,
                motion: ds.kind,
                chamber: ds.chamber,
                status: "ERROR" as const,
                billUrl,
                voteUrl: null,
                discoveredVoteUrls: rawVoteLinks,
                error: "No vote PDF found on bill details page yet",
                retry
            }
        }

        const { href: url } = picked

        // Ignore this for now - Don't call the AI for debugging
        const votePayload = await extractVotesWithAi({ url, action })
        const testing__votePayload: VotePayload = {
            "billActionId": 3904,
            "manual": false,
            "vote": {
                "date": "2026-02-02",
                "type": "floor",
                "result": "Passed",
                "details": "",
                "yeas": 99,
                "nays": 37,
                "notVoting": 0,
                "excused": 0,
                "absent": 5,
                "memberVotes": [
                    {
                        "legislatorId": 1929,
                        "memberName": "Joseline A. Peña-Melnyk",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1830,
                        "memberName": "Bonnie Cullison",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1884,
                        "memberName": "Dana Jones",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1934,
                        "memberName": "Lily Qi",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1979,
                        "memberName": "Kym Taylor",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1778,
                        "memberName": "Gabriel Acevero",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1832,
                        "memberName": "Debra Davis",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1886,
                        "memberName": "Anne R. Kaiser",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1936,
                        "memberName": "Pam Queen",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1981,
                        "memberName": "Jen Terrasa",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1782,
                        "memberName": "Jackie Addison",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1833,
                        "memberName": "Eric Ebersole",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1887,
                        "memberName": "Aaron M. Kaufman",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1939,
                        "memberName": "Kent Roberson",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1983,
                        "memberName": "Karen Toles",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1783,
                        "memberName": "Nick Allen",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1835,
                        "memberName": "Mark Edelson",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1889,
                        "memberName": "Kenneth Kerr",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1941,
                        "memberName": "Denise Roberts",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1986,
                        "memberName": "Veronica Turner",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1785,
                        "memberName": "Tiffany T. Alston",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1837,
                        "memberName": "Elizabeth Embry",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1893,
                        "memberName": "Marc Korman",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1943,
                        "memberName": "Mike Rogers",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1988,
                        "memberName": "Kriselda Valderrama",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1787,
                        "memberName": "Marlon Amprey",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1838,
                        "memberName": "Kris Fair",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1895,
                        "memberName": "Mary A. Lehman",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1947,
                        "memberName": "Samuel I. Rosenberg",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1992,
                        "memberName": "Joe Vogel",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1796,
                        "memberName": "Heather Bagnall",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1840,
                        "memberName": "Jessica Feldmark",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1896,
                        "memberName": "Robbyn Lewis",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1949,
                        "memberName": "Kim Ross",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1994,
                        "memberName": "Courtney Watson",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1799,
                        "memberName": "Ben Barnes",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1842,
                        "memberName": "Diana M. Fennell",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1898,
                        "memberName": "Jeffrie E. Long, Jr.",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1951,
                        "memberName": "Malcolm P. Ruff",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1996,
                        "memberName": "Melissa Wells",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1801,
                        "memberName": "J. Sandy Bartlett",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1846,
                        "memberName": "Linda Foley",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1902,
                        "memberName": "Lesley J. Lopez",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1952,
                        "memberName": "Sheila Ruth",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1998,
                        "memberName": "Jennifer White Holland",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1805,
                        "memberName": "Dylan Behler",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1847,
                        "memberName": "Catherine M. Forbes",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1906,
                        "memberName": "Ashanti Martinez",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1956,
                        "memberName": "Matthew J. Schindler",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1999,
                        "memberName": "Jheanelle K. Wilkins",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1807,
                        "memberName": "Harry Bhandari",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1849,
                        "memberName": "David Fraser-Hidalgo",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1907,
                        "memberName": "Aletheia McCaskill",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1959,
                        "memberName": "Emily Shetty",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2001,
                        "memberName": "Nicole A. Williams",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1808,
                        "memberName": "Adrian Boafo",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1857,
                        "memberName": "Michele Guyton",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1915,
                        "memberName": "Bernice Mireku-North",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1961,
                        "memberName": "Gary Simmons",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2003,
                        "memberName": "C. T. Wilson",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1812,
                        "memberName": "Regina T. Boyce",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1858,
                        "memberName": "Pam Lanman Guzzone",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1770,
                        "memberName": "David Moon",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1963,
                        "memberName": "Karen Simpson",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2005,
                        "memberName": "Greg Wims",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1814,
                        "memberName": "Jon S. Cardin",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1860,
                        "memberName": "Andrea Fletcher Harrison",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2676,
                        "memberName": "Gabriel M. Moreno",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1965,
                        "memberName": "Stephanie Smith",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2008,
                        "memberName": "Sarah Wolek",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1816,
                        "memberName": "Mark S. Chang",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1864,
                        "memberName": "Anne Healey",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2686,
                        "memberName": "Darrell Odom",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1967,
                        "memberName": "Jared Solomon",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2010,
                        "memberName": "Jamila J. Woods",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1817,
                        "memberName": "Lorig Charkoudian",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1865,
                        "memberName": "Terri L. Hill",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1924,
                        "memberName": "Julie Palakovich Carr",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1968,
                        "memberName": "Ryan Spiegel",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2012,
                        "memberName": "Teresa Woorman",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1823,
                        "memberName": "Luke Clippinger",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1869,
                        "memberName": "Marvin E. Holmes, Jr.",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1925,
                        "memberName": "Cheryl E. Pasteur",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1769,
                        "memberName": "Dana Stein",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2014,
                        "memberName": "Chao Wu",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2575,
                        "memberName": "Derrick Coley",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1877,
                        "memberName": "Julian Ivey",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1927,
                        "memberName": "Edith J. Patterson",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1970,
                        "memberName": "Vaughn Stewart",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2015,
                        "memberName": "Caylin Young",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1825,
                        "memberName": "Frank M. Conaway, Jr.",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1880,
                        "memberName": "Andre V. Johnson, Jr.",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1930,
                        "memberName": "N. Scott Phillips",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1972,
                        "memberName": "Sean A. Stinnett",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 2017,
                        "memberName": "Natalie Ziegler",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1828,
                        "memberName": "Charlotte Crutchfield",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1882,
                        "memberName": "Steve Johnson",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1932,
                        "memberName": "Andrew C. Pruski",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1978,
                        "memberName": "Deni Taveras",
                        "vote": "yes"
                    },
                    {
                        "legislatorId": 1780,
                        "memberName": "Christopher T. Adams",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1844,
                        "memberName": "Mark N. Fisher",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1875,
                        "memberName": "Thomas S. Hutchinson",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1913,
                        "memberName": "April Miller",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1954,
                        "memberName": "Sheree Sample-Hughes",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1791,
                        "memberName": "Steven J. Arentz",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1851,
                        "memberName": "Jefferson L. Ghrist",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1878,
                        "memberName": "Jay A. Jacobs",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1916,
                        "memberName": "Matthew Morgan",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1958,
                        "memberName": "Stuart Michael Schmidt, Jr.",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1793,
                        "memberName": "Lauren Arikan",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1853,
                        "memberName": "Robin L. Grammer, Jr.",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1891,
                        "memberName": "Nicholaus R. Kipke",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1918,
                        "memberName": "Todd B. Morgan",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1974,
                        "memberName": "Joshua J. Stonko",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1798,
                        "memberName": "Terry L. Baker",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1855,
                        "memberName": "Mike Griffith",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1900,
                        "memberName": "Robert B. Long",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1920,
                        "memberName": "Ryan Nawrocki",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1976,
                        "memberName": "Kathy Szeliga",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1803,
                        "memberName": "Barry Beauchamp",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1862,
                        "memberName": "Wayne A. Hartman",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1904,
                        "memberName": "Nino Mangione",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1922,
                        "memberName": "LaToya Nkongolo",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1984,
                        "memberName": "Chris Tomlinson",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1774,
                        "memberName": "Jason C. Buckel",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1867,
                        "memberName": "Jim Hinebaugh, Jr.",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1909,
                        "memberName": "Susan K. McComas",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1776,
                        "memberName": "Jesse T. Pippy",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1990,
                        "memberName": "William Valentine",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1819,
                        "memberName": "Brian Chisholm",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1871,
                        "memberName": "Kevin B. Hornberger",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1911,
                        "memberName": "Ric Metzgar",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1938,
                        "memberName": "Teresa E. Reilly",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 2007,
                        "memberName": "William J. Wivell",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1821,
                        "memberName": "Barrie S. Ciliberti",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1873,
                        "memberName": "Seth A. Howard",
                        "vote": "no"
                    },
                    {
                        "legislatorId": 1789,
                        "memberName": "H. Kevin Anderson",
                        "vote": "absent"
                    },
                    {
                        "legislatorId": 1810,
                        "memberName": "Christopher Eric Bouchat",
                        "vote": "absent"
                    },
                    {
                        "legislatorId": 1826,
                        "memberName": "Brian M. Crosby",
                        "vote": "absent"
                    },
                    {
                        "legislatorId": 1767,
                        "memberName": "Adrienne A. Jones",
                        "vote": "absent"
                    },
                    {
                        "legislatorId": 1945,
                        "memberName": "April Rose",
                        "vote": "absent"
                    }
                ]
            }
        }

        const saved = await saveVoteResult({
            action,
            votePayload,
            attempts,
            billUrl,
            voteUrl: url,
        })

        return { saved }
    } catch ( error ) {
        // If there's an error, figure out why before we jump ship
        const classified = classifyOpenAiError( error )

        let status: VoteProcessingStatus = "FAILED"
        let nextAttemptAt = computeNextAttemptAt( attempts )

        if (classified.kind === "quota") {
            status = "FAILED_QUOTA"
            nextAttemptAt = computeQuotaBackoffHours( 12 )
        }

        if (classified.kind === "rate_limit") {
            status = "FAILED"
            nextAttemptAt = new Date(Date.now() + 15 * 60 * 1000)
        }

        const retry = await saveVoteFailure({
            billActionId: action.id,
            dataSource: ds,
            billUrl,
            voteUrl: ds.mga?.voteUrl ?? null,
            attempts,
            errorMessage: classified.message,
            status,
            nextAttemptAtISO: nextAttemptAt.toISOString()
        })

        return {
            billActionId,
            status: "ERROR" as const,
            billUrl,
            voteUrl: ds.mga?.voteUrl ?? null,
            error: classified.message,
            errorKind: classified.kind,
            retry
        }
    }
}

export const GET = async ( request: Request) => {
    const { userId } = await auth()
    const hasClerkUser = !!userId
    const hasCronSecret = isValidCronSecret( request )

    if ( ! hasClerkUser && ! hasCronSecret ) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if ( ! process.env.OPENAI_API_KEY ) {
        return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 })
    }

    const url = new URL( request.url )
    const billActionIdParam = url.searchParams.get("billActionId")
    const limitParam = url.searchParams.get("limit")
    const forceParam = url.searchParams.get("force")
    const dryRunParam = url.searchParams.get("dryRun")

    const force =
        forceParam === "1" ||
        forceParam === "true" ||
        forceParam === "yes"

    const dryRun =
        dryRunParam === "1" ||
        dryRunParam === "true" ||
        dryRunParam === "yes"

    const limit = limitParam ? Number(limitParam) : 25
    const hardMaximum = 25
    const safeLimit = Number.isFinite(limit) ? Math.min( Math.max(limit, 1), hardMaximum ) : 25

    const run = await startScrapeRun('PROCESS_FLOOR_VOTES')

    try {
        // Handle when a single bill action is requested
        if ( billActionIdParam ) {
            const billActionId = Number( billActionIdParam )

            if ( ! Number.isFinite( billActionId ) ) {
                return NextResponse.json({ error: "Invalid billActionId" }, { status: 400 })
            }

            const result = await processBillAction( billActionId, { force })

            await finishScrapeRun(run.id, { success: true })

            return NextResponse.json({
                mode: "single",
                actionId: billActionId,
                result
            })
        }
        
        // Find Candidate action to process
        const candidates = await findCandidateVoteActions(safeLimit)
        const now = new Date()

        // bail for debugging
        if ( dryRun ) {
            return NextResponse.json({
                mode: "batch",
                requestedLimit: safeLimit,
                totalCandidates: candidates.length,
                candidates,
            })
        }

        // Filter candidates to find out which ones are due now
        const dueIds = candidates
            .filter(row => {
                const dataSource = getBillActionDataSource(row.dataSource)
                const voteProcessing = dataSource.voteProcessing
                const status = voteProcessing?.status

                if ( status === "DONE" ) return false

                if ( status === "PROCESSING" && voteProcessing?.lastAttemptAt ) {
                    const last = new Date( voteProcessing.lastAttemptAt ).getTime()

                    if ( ! Number.isNaN( last ) ) {
                        const ageMs = now.getTime() - last
                        if ( ageMs < 10 * 60 * 1000 ) return false
                    }
                }

                if (status === "FAILED_QUOTA") {
                    return isDueToRun( voteProcessing?.nextAttemptAt, now )
                }

                return isDueToRun( voteProcessing?.nextAttemptAt, now )
            })
            .map( row => row.id )
        
        // Loop through each of the IDs that are due to process them
        const results = []
        for (const id of dueIds) {
            results.push( await processBillAction( id ) )
        }

        await finishScrapeRun(run.id, {
            success: true,
            processedCount: results.length,
        })

        return NextResponse.json({
            mode: "batch",
            requestedLimit: safeLimit,
            candidates: candidates.length,
            due: dueIds.length,
            results,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)

        await finishScrapeRun(run.id, {
            success: false,
            error: err,
        })

        return NextResponse.json({ error: message }, { status: 500 })
    } finally {
        await prisma.$disconnect()
    }
}