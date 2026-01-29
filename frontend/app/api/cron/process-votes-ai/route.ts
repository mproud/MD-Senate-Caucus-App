import * as cheerio from "cheerio"
import OpenAI from "openai"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { isValidCronSecret } from "@/lib/scrapers/helpers"
import { getActiveSessionCode } from "@/lib/get-active-session"
import { Prisma, Vote as VoteEnum, BillEventType } from "@prisma/client"
import { finishScrapeRun, startScrapeRun } from "@/lib/scrapers/logging"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type VoteAiStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "FAILED_QUOTA"

type VoteAiState = {
    status: VoteAiStatus
    attempts: number
    lastAttemptAt?: string
    nextAttemptAt?: string
    lastError?: string
}

type AiVoteChoice = "yes" | "no" | "abstain" | "excused" | "absent" | "notVoting"

type AiMemberVote = {
    vote: AiVoteChoice
    memberId: number
    memberName: string
    legislatorId: number
}

type VoteCounts = {
    yeas: number
    nays: number
    abstain: number
    excused: number
    absent: number
}

type AiVotePayload = {
    vote: {
        date: string
        type: "committee" | "floor"
        result: string
        details: string
        committee: string
        committeeId: number

        yeas: number
        nays: number
        abstain: number
        excused: number
        absent: number

        totalsRow: {
            yeas: number
            nays: number
            abstain: number
            excused: number
            absent: number
        }

        memberVotes: AiMemberVote[]
    }
    manual: boolean
    billActionId: number
}

type MgaVoteMeta = {
    billUrl?: string
    voteUrl?: string
    voteKeyHints?: {
        actionDateISO?: string
        motion?: string
        committeeId?: number
        chamber?: string
    }
    summary?: {
        yes?: number
        no?: number
        excused?: number
        absent?: number
        notVoting?: number
        finalAction?: string
    }
    rollcall?: {
        yeas?: string[]
        nays?: string[]
        excused?: string[]
        absent?: string[]
        notVoting?: string[]
    }
}

type BillActionDataSource = {
    voteAi?: VoteAiState
    voteAiResult?: AiVotePayload
    mga?: MgaVoteMeta
    [key: string]: unknown
}

/*
    Read and normalize BillAction.dataSource
*/
function getBillActionDataSource(value: unknown): BillActionDataSource {
    if (!value || typeof value !== "object") return {}
    return value as BillActionDataSource
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

/*
    Compute next attempt time using capped exponential-ish backoff.
*/
function computeNextAttemptAt(attempts: number) {
    const minutes = [2, 5, 15, 30]
    const idx = Math.min(Math.max(attempts, 0), minutes.length - 1)
    const ms = minutes[idx] * 60_000
    return new Date(Date.now() + ms)
}

/*
    Create a BillEvent after votes are recorded.

    Idempotency:
    - We avoid creating duplicate events by checking for an existing event
      with the same eventType + billId + committeeId + payload.actionId.
*/
async function createCommitteeVoteRecordedEvent(args: {
    tx: Prisma.TransactionClient
    billId: number
    billActionId: number
    committeeId: number
    pdfUrl: string
}) {
    // NEW: Load committee so we can populate chamber on the BillEvent
    const committee = await args.tx.committee.findUnique({
        where: { id: args.committeeId },
        select: { chamber: true, name: true }
    })

    if (!committee?.chamber) {
        throw new Error(`Committee ${args.committeeId} not found or missing chamber`)
    }

    // Find an existing matching event to prevent duplicates on reruns
    const existing = await args.tx.billEvent.findFirst({
        where: {
            billId: args.billId,
            committeeId: args.committeeId,
            chamber: committee.chamber, // NEW: include chamber match
            eventType: BillEventType.COMMITTEE_VOTE_RECORDED,
            payload: {
                path: ["actionId"],
                equals: args.billActionId
            }
        },
        select: { id: true }
    })

    if (existing) {
        console.log("Existing Event found", { existing })
        return existing.id
    }

    // NEW: make summary a bit more specific using committee name
    const summary = committee.name
        ? `Committee vote recorded from MGA site (${committee.name})`
        : "Committee vote recorded from MGA site"

    const created = await args.tx.billEvent.create({
        data: {
            billId: args.billId,
            committeeId: args.committeeId,
            chamber: committee.chamber, // NEW: populate chamber from committee
            eventType: BillEventType.COMMITTEE_VOTE_RECORDED,
            summary,
            payload: {
                actionId: args.billActionId,
                source: "ai-vote",
                pdf: args.pdfUrl
            } as Prisma.JsonObject
        },
        select: { id: true }
    })

    console.log("Create new bill event", { created })

    return created.id
}



/*
    Returns true if the AI processing is due to run based on nextAttemptAt.
*/
function isDueToRun(ai: VoteAiState | undefined, now: Date) {
    if (!ai?.nextAttemptAt) return true

    const nextDate = new Date(ai.nextAttemptAt)
    if (Number.isNaN(nextDate.getTime())) return true

    return nextDate.getTime() <= now.getTime()
}

/*
    Identify whether an error is an OpenAI quota/rate-limit error
*/
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

/*
    Compute a longer backoff when quota is exceeded.
*/
function computeQuotaBackoffHours(hours: number) {
    return new Date(Date.now() + hours * 60 * 60 * 1000)
}

/*
    Build the canonical MGA bill details URL for a bill
*/
function buildMgaBillDetailsUrl(args: { billNumber: string; sessionCode: string }) {
    const billNumber = args.billNumber.trim()
    const sessionCode = args.sessionCode.trim()
    return `https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/${encodeURIComponent(billNumber)}?ys=${encodeURIComponent(sessionCode)}`
}

/*
    Fetch raw HTML from a URL
*/
async function fetchRawHtml(url: string, timeoutMs = 20000) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "user-agent": "mga-leg-tracker/1.0",
                accept: "text/html,application/xhtml+xml"
            }
        })

        if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching HTML: ${url}`)
        }

        return await res.text()
    } finally {
        clearTimeout(timeout)
    }
}

/*
    Convert a possibly-relative href to an absolute URL
*/
function toAbsoluteUrl(baseUrl: string, href: string) {
    try {
        return new URL(href, baseUrl).toString()
    } catch {
        return href
    }
}

/*
    Discover vote-related PDF links on the bill details page.
*/
function findVotePdfLinksOnBillPage(html: string) {
    const $ = cheerio.load(html)

    const urls: string[] = []
    $("a[href]").each((_, el) => {
        const href = String($(el).attr("href") ?? "").trim()
        if (!href) return

        const lower = href.toLowerCase()
        const isPdf = lower.endsWith(".pdf")

        const isVotePdf =
            lower.includes("/votes/") ||
            lower.includes("/votes_comm/") ||
            lower.includes("/votes_comm")

        if (isPdf && isVotePdf) {
            urls.push(href)
        }
    })

    return Array.from(new Set(urls))
}

/*
    Pick the best vote PDF from a list of discovered vote PDF URLs.
*/
function pickBestVotePdfUrl(args: { voteUrls: string[]; committeeId: number | null }) {
    if (args.voteUrls.length === 0) return null

    if (args.committeeId) {
        const comm = args.voteUrls.find(u => u.toLowerCase().includes("/votes_comm"))
        if (comm) return comm
    }

    const floor = args.voteUrls.find(u => u.toLowerCase().includes("/votes/"))
    if (floor) return floor

    return args.voteUrls[0]
}

/*
    Load a committee roster for matching names to concrete IDs.
*/
async function loadCommitteeRoster(committeeId: number) {
    const now = new Date()

    const members = await prisma.committeeMember.findMany({
        where: {
            committeeId,
            OR: [{ endDate: null }, { endDate: { gt: now } }]
        },
        include: {
            legislator: true,
            committee: true
        },
        orderBy: [{ rank: "asc" }, { id: "asc" }]
    })

    const committeeName = members[0]?.committee?.name ?? ""

    const roster = members.map(m => {
        return {
            memberId: m.id,
            legislatorId: m.legislatorId,
            memberName: m.legislator.fullName,
            memberLastName: m.legislator.lastName ?? "",
            memberFirstName: m.legislator.firstName ?? ""
        }
    })

    return { committeeName, roster }
}

/*
    JSON Schema for Structured Outputs.
*/
function getAiVoteJsonSchema() {
    return {
        name: "mga_vote_parse",
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
                        "committee",
                        "committeeId",
                        "yeas",
                        "nays",
                        "abstain",
                        "excused",
                        "absent",
                        "totalsRow",
                        "memberVotes"
                    ],
                    properties: {
                        date: { type: "string" },
                        type: { type: "string", enum: ["committee", "floor"] },
                        result: { type: "string" },
                        details: { type: "string" },
                        committee: { type: "string" },
                        committeeId: { type: "integer" },

                        yeas: { type: "integer" },
                        nays: { type: "integer" },
                        abstain: { type: "integer" },
                        excused: { type: "integer" },
                        absent: { type: "integer" },

                        totalsRow: {
                            type: "object",
                            additionalProperties: false,
                            required: ["yeas", "nays", "abstain", "excused", "absent"],
                            properties: {
                                yeas: { type: "integer" },
                                nays: { type: "integer" },
                                abstain: { type: "integer" },
                                excused: { type: "integer" },
                                absent: { type: "integer" }
                            }
                        },

                        memberVotes: {
                            type: "array",
                            items: {
                                type: "object",
                                additionalProperties: false,
                                required: ["vote", "memberId", "memberName", "legislatorId"],
                                properties: {
                                    vote: {
                                        type: "string",
                                        enum: ["yes", "no", "absent", "excused", "abstain", "notVoting"]
                                    },
                                    memberId: { type: "integer" },
                                    memberName: { type: "string" },
                                    legislatorId: { type: "integer" }
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

/*
    Compute counts from memberVotes.
*/
function computeCountsFromMemberVotes(memberVotes: AiMemberVote[]): VoteCounts {
    const counts: VoteCounts = {
        yeas: 0,
        nays: 0,
        abstain: 0,
        excused: 0,
        absent: 0
    }

    for (const mv of memberVotes) {
        if (mv.vote === "yes") counts.yeas += 1
        else if (mv.vote === "no") counts.nays += 1
        else if (mv.vote === "abstain" || mv.vote === "notVoting") counts.abstain += 1
        else if (mv.vote === "excused") counts.excused += 1
        else if (mv.vote === "absent") counts.absent += 1
    }

    return counts
}

/*
    Normalize AI output before saving.

    - Dedupes by memberId
    - Normalizes notVoting -> abstain
    - Recomputes counts (authoritative)
*/
function normalizeAiVotePayload(payload: AiVotePayload) {
    const seen = new Set<number>()
    const memberVotes: AiMemberVote[] = []

    for (const m of payload.vote.memberVotes ?? []) {
        const memberId = Number(m.memberId)
        const legislatorId = Number(m.legislatorId)

        if (!Number.isFinite(memberId) || !Number.isFinite(legislatorId)) continue
        if (seen.has(memberId)) continue

        seen.add(memberId)

        const rawVote = m.vote
        const normalizedVote: AiVoteChoice = rawVote === "notVoting" ? "abstain" : rawVote

        memberVotes.push({
            vote: normalizedVote,
            memberId,
            legislatorId,
            memberName: String(m.memberName ?? "")
        })
    }

    const counts = computeCountsFromMemberVotes(memberVotes)

    return {
        ...payload,
        vote: {
            ...payload.vote,
            yeas: counts.yeas,
            nays: counts.nays,
            abstain: counts.abstain,
            excused: counts.excused,
            absent: counts.absent,
            memberVotes
        }
    }
}

/*
    Validate AI output:
    - No duplicate memberId
    - Every roster memberId appears exactly once
    - Counts match totalsRow exactly
*/
function validateAiVotePayload(args: {
    payload: AiVotePayload
    roster: Array<{ memberId: number }>
}) {
    const errors: string[] = []
    const normalized = normalizeAiVotePayload(args.payload)

    const rosterIds = new Set(args.roster.map(r => r.memberId))
    const seen = new Set<number>()

    for (const mv of normalized.vote.memberVotes) {
        if (seen.has(mv.memberId)) {
            errors.push(`Duplicate memberId in memberVotes: ${mv.memberId}`)
        }
        seen.add(mv.memberId)

        if (!rosterIds.has(mv.memberId)) {
            errors.push(`memberVotes includes memberId not in roster: ${mv.memberId}`)
        }
    }

    for (const id of rosterIds) {
        if (!seen.has(id)) {
            errors.push(`Missing roster memberId in memberVotes: ${id}`)
        }
    }

    const computed = computeCountsFromMemberVotes(normalized.vote.memberVotes)
    const totals = normalized.vote.totalsRow

    if (computed.yeas !== totals.yeas) errors.push(`Totals mismatch: computed yeas=${computed.yeas} but totalsRow yeas=${totals.yeas}`)
    if (computed.nays !== totals.nays) errors.push(`Totals mismatch: computed nays=${computed.nays} but totalsRow nays=${totals.nays}`)
    if (computed.abstain !== totals.abstain) errors.push(`Totals mismatch: computed abstain=${computed.abstain} but totalsRow abstain=${totals.abstain}`)
    if (computed.excused !== totals.excused) errors.push(`Totals mismatch: computed excused=${computed.excused} but totalsRow excused=${totals.excused}`)
    if (computed.absent !== totals.absent) errors.push(`Totals mismatch: computed absent=${computed.absent} but totalsRow absent=${totals.absent}`)

    return { errors, normalized }
}

/*
    Map AI vote choice to Prisma Vote enum for the Votes table.

    IMPORTANT:
    - You said "abstain is stored as notVoting in the prisma schema".
      For Votes.vote enum, we attempt NOT_VOTING first (if it exists), otherwise ABSTAIN.
*/
function mapAiVoteToVoteEnum(v: AiVoteChoice): VoteEnum {
    const enumObj = VoteEnum as unknown as Record<string, string>

    function hasKey(key: string) {
        return typeof enumObj[key] === "string"
    }

    // Normalize notVoting to abstain for semantics
    const choice = v === "notVoting" ? "abstain" : v

    if (choice === "yes") {
        if (hasKey("YEA")) return VoteEnum.YEA
        if (hasKey("YES")) return (VoteEnum as any).YES
    }

    if (choice === "no") {
        if (hasKey("NAY")) return VoteEnum.NAY
        if (hasKey("NO")) return (VoteEnum as any).NO
    }

    if (choice === "excused") {
        if (hasKey("EXCUSED")) return (VoteEnum as any).EXCUSED
    }

    if (choice === "absent") {
        if (hasKey("ABSENT")) return (VoteEnum as any).ABSENT
    }

    if (choice === "abstain") {
        // Prefer NOT_VOTING if your enum uses that wording
        if (hasKey("NOT_VOTING")) return (VoteEnum as any).NOT_VOTING
        if (hasKey("ABSTAIN")) return (VoteEnum as any).ABSTAIN
        if (hasKey("ABSTAINED")) return (VoteEnum as any).ABSTAINED
    }

    // Last resort: try NOT_VOTING then ABSTAIN then YES
    if (hasKey("NOT_VOTING")) return (VoteEnum as any).NOT_VOTING
    if (hasKey("ABSTAIN")) return (VoteEnum as any).ABSTAIN
    return (VoteEnum as any).YES ?? (VoteEnum as any).YEA
}

/*
    NEW: Log per-legislator votes into Votes table.

    Behavior:
    - Deletes existing Votes rows for this billActionId (idempotent)
    - Inserts one row per memberVotes entry
*/
async function logVotesToTable(args: {
    billId: number
    billActionId: number
    voteUrl: string
    committeeId: number
    committeeName: string
    memberVotes: AiMemberVote[]
    aiPayload: AiVotePayload
}) {
    // Delete existing rows for this action so reruns don’t duplicate
    await prisma.votes.deleteMany({
        where: {
            billActionId: args.billActionId
        }
    })

    // Insert one row per legislator vote
    const rows = args.memberVotes.map(mv => {
        return {
            billId: args.billId,
            billActionId: args.billActionId,
            legislatorId: mv.legislatorId,
            vote: mapAiVoteToVoteEnum(mv.vote),
            metadata: {
                source: "process-votes-ai",
                voteUrl: args.voteUrl,
                committeeId: args.committeeId,
                committeeName: args.committeeName,
                memberId: mv.memberId,
                memberName: mv.memberName,
                ai: {
                    // Keep a minimal reference here. Full payload is stored on BillAction.dataSource.voteAiResult
                    billActionId: args.aiPayload.billActionId,
                    manual: args.aiPayload.manual,
                    totalsRow: args.aiPayload.vote.totalsRow
                }
            } as Prisma.JsonObject
        }
    })

    // createMany is fast, but some DBs require a unique constraint for skipDuplicates
    // We already deleteMany above, so duplicates shouldn’t happen.
    await prisma.votes.createMany({
        data: rows
    })

    return rows.length
}

/*
    Call OpenAI and validate output.

    Note:
    - This still uses input_file. If you’re doing PDF-as-image for checkboxes,
      keep your image-based version here instead.
*/
async function extractVotesWithAi(args: {
    billActionId: number
    voteUrl: string
    billNumber: string
    sessionCode: string
    chamber: string | null
    committeeId: number
    committeeName: string
    roster: Array<{ memberId: number; legislatorId: number; memberName: string; memberFirstName: string; memberLastName: string }>
    actionDateISO: string
}) {
    const client = getOpenAiClient()

    const rosterText = args.roster
        .map(m => `${m.memberId}\t${m.legislatorId}\t${m.memberName}\t${m.memberLastName}\t${m.memberFirstName}`)
        .join("\n")

    const baseInstructions = [
        "You extract per-person votes from an MGA committee vote sheet PDF.",
        "The PDF contains a table with each member listed on the left and five vote columns:",
        "Yea, Nay, Abstain, Excused, Absent.",
        "Each row has exactly one checkmark in exactly one of those columns.",
        "At the bottom there is a row labeled Totals with the totals for each column.",
        "",
        "CRITICAL REQUIREMENTS:",
        "1) You MUST read the Totals row and fill vote.totalsRow exactly.",
        "2) You MUST output exactly one memberVotes entry for every roster member listed.",
        "3) memberId and legislatorId must come from the roster list only.",
        "4) No duplicates. No non-roster members.",
        "5) The computed totals from memberVotes MUST match vote.totalsRow exactly.",
        "",
        "Mapping:",
        "- Column Yea => vote='yes'",
        "- Column Nay => vote='no'",
        "- Column Abstain => vote='abstain' (Prisma stores this as notVoting)",
        "- Column Excused => vote='excused'",
        "- Column Absent => vote='absent'",
        "",
        "Return JSON only, matching the provided schema exactly."
    ].join(" ")

    const prompt = [
        `BillActionId: ${args.billActionId}`,
        `Bill: ${args.billNumber} (${args.sessionCode})`,
        `Chamber: ${args.chamber ?? "UNKNOWN"}`,
        `ActionDateISO: ${args.actionDateISO}`,
        `Committee: ${args.committeeName} (committeeId=${args.committeeId})`,
        "",
        "Committee roster (memberId, legislatorId, memberFullName, memberLastName, memberFirstName):",
        rosterText,
        "",
        "Task:",
        "Read the attached PDF vote sheet.",
        "Extract one vote per roster member based on the checkmark column, and extract the Totals row.",
        "Set vote.date from the Vote Date shown on the PDF (YYYY-MM-DD).",
        "Set vote.result to the motion outcome shown.",
        "Set vote.details to empty string unless there is a short, important note."
    ].join("\n")

    async function runOnce(extraUserText: string | null) {
        const userText = extraUserText ? `${prompt}\n\nVALIDATION FEEDBACK:\n${extraUserText}` : prompt

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
                        { type: "input_file", file_url: args.voteUrl }
                    ]
                }
            ],
            text: {
                format: {
                    type: "json_schema",
                    ...getAiVoteJsonSchema()
                }
            }
        })

        const raw = response.output_text ?? ""
        const parsed = JSON.parse(raw) as AiVotePayload
        return parsed
    }

    const attempt1 = await runOnce(null)
    attempt1.billActionId = args.billActionId

    const v1 = validateAiVotePayload({ payload: attempt1, roster: args.roster })
    if (v1.errors.length === 0) {
        return v1.normalized
    }

    const feedback = [
        "Your previous output failed validation.",
        "Fix these issues and output corrected JSON:",
        ...v1.errors.map(e => `- ${e}`)
    ].join("\n")

    const attempt2 = await runOnce(feedback)
    attempt2.billActionId = args.billActionId

    const v2 = validateAiVotePayload({ payload: attempt2, roster: args.roster })
    if (v2.errors.length === 0) {
        return v2.normalized
    }

    throw new Error(`AI vote validation failed after 2 attempts:\n${v2.errors.join("\n")}`)
}

/*
    Persist AI vote results into BillAction and Votes table.

    UPDATE:
    - Also logs per-legislator votes to Votes table
    - Transaction ensures BillAction and Votes stay consistent
*/
async function saveAiVoteResult(args: {
    billId: number
    billActionId: number
    ds: BillActionDataSource
    voteUrl: string
    billUrl: string
    payload: AiVotePayload
    attempts: number
}) {
    const now = new Date()
    const normalized = normalizeAiVotePayload(args.payload)

    const nextVoteAi: VoteAiState = {
        status: "DONE",
        attempts: args.attempts,
        lastAttemptAt: now.toISOString(),
        nextAttemptAt: undefined,
        lastError: undefined
    }

    const yesVotes = Number(normalized.vote.yeas)
    const noVotes = Number(normalized.vote.nays)
    const absent = Number(normalized.vote.absent)
    const excused = Number(normalized.vote.excused)
    const abstain = Number(normalized.vote.abstain)

    // Prisma stores abstain as notVoting
    const notVoting = abstain

    const billActionUpdate: Prisma.BillActionUpdateInput = {
        source: "MGA_SCRAPE",

        yesVotes: Number.isFinite(yesVotes) ? yesVotes : undefined,
        noVotes: Number.isFinite(noVotes) ? noVotes : undefined,
        absent: Number.isFinite(absent) ? absent : undefined,
        excused: Number.isFinite(excused) ? excused : undefined,
        notVoting: Number.isFinite(notVoting) ? notVoting : undefined,

        voteResult: normalized.vote.result,

        dataSource: {
            ...args.ds,
            mga: {
                ...(args.ds.mga ?? {}),
                billUrl: args.billUrl,
                voteUrl: args.voteUrl
            },
            voteAi: nextVoteAi,
            voteAiResult: normalized
        }
    }

    // Transaction: update BillAction and replace Votes rows together
        const result = await prisma.$transaction(async tx => {
        const updatedAction = await tx.billAction.update({
            where: { id: args.billActionId },
            data: billActionUpdate,
            select: {
                id: true,
                billId: true,
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
            where: { billActionId: args.billActionId }
        })

        const voteRows = normalized.vote.memberVotes.map(mv => {
            return {
                billId: args.billId,
                billActionId: args.billActionId,
                legislatorId: mv.legislatorId,
                vote: mapAiVoteToVoteEnum(mv.vote),
                metadata: {
                    source: "process-votes-ai",
                    voteUrl: args.voteUrl,
                    committeeId: normalized.vote.committeeId,
                    committeeName: normalized.vote.committee,
                    memberId: mv.memberId,
                    memberName: mv.memberName,
                    totalsRow: normalized.vote.totalsRow
                } as Prisma.JsonObject
            }
        })

        await tx.votes.createMany({
            data: voteRows
        })

        // NEW: Create a BillEvent after votes are recorded
        const committeeId = updatedAction.committeeId ?? normalized.vote.committeeId

        // Committee vote recorded events should always have committeeId
        // If committeeId is missing for some reason, we skip the event to avoid bad data
        let billEventId: number | null = null

        if (committeeId) {
            billEventId = await createCommitteeVoteRecordedEvent({
                tx,
                billId: args.billId,
                billActionId: args.billActionId,
                committeeId,
                pdfUrl: args.voteUrl
            })
        }

        return {
            updatedAction,
            insertedVotes: voteRows.length,
            billEventId
        }
    })

    console.log(">>> Saved vote aggregates + per-legislator votes", result)

    return normalized
}

/*
    Mark an AI attempt as failed and schedule a retry.
*/
async function saveAiVoteFailure(args: {
    billActionId: number
    ds: BillActionDataSource
    billUrl: string
    voteUrl: string | null
    attempts: number
    errorMessage: string
    status: VoteAiStatus
    nextAttemptAtISO: string
}) {
    const now = new Date()

    const nextVoteAi: VoteAiState = {
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
                ...args.ds,
                mga: {
                    ...(args.ds.mga ?? {}),
                    billUrl: args.billUrl,
                    voteUrl: args.voteUrl ?? (args.ds.mga?.voteUrl ?? undefined)
                },
                voteAi: nextVoteAi
            }
        }
    })

    return { nextAttemptAt: args.nextAttemptAtISO }
}

/*
    Process a single BillAction ID using AI.
*/
async function processVoteBillActionAi(billActionId: number) {
    const action = await prisma.billAction.findUnique({
        where: { id: billActionId },
        include: {
            bill: true,
            committee: true
        }
    })

    if (!action) {
        return { billActionId, status: "SKIPPED" as const, reason: "Not found" }
    }

    if (!action.isVote) {
        return { billActionId, status: "SKIPPED" as const, reason: "Not a vote action" }
    }

    if (!action.committeeId) {
        return { billActionId, status: "SKIPPED" as const, reason: "No committeeId on BillAction (requires roster)" }
    }

    const ds = getBillActionDataSource(action.dataSource)
    const now = new Date()

    const existingAi = ds.voteAi
    const attempts = (existingAi?.attempts ?? 0) + 1

    if (!isDueToRun(existingAi, now)) {
        return { billActionId, status: "SKIPPED" as const, reason: "Not due yet" }
    }

    const billUrl =
        ds.mga?.billUrl ??
        buildMgaBillDetailsUrl({
            billNumber: action.bill.billNumber,
            sessionCode: action.bill.sessionCode
        })

    await prisma.billAction.update({
        where: { id: action.id },
        data: {
            dataSource: {
                ...ds,
                voteAi: {
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
        const billHtml = await fetchRawHtml(billUrl)
        const rawVoteLinks = findVotePdfLinksOnBillPage(billHtml)
        const voteLinks = rawVoteLinks.map(href => toAbsoluteUrl(billUrl, href))

        const voteUrl = pickBestVotePdfUrl({
            voteUrls: voteLinks,
            committeeId: action.committeeId
        })

        if (!voteUrl) {
            const nextAttemptAt = computeNextAttemptAt(attempts)

            const retry = await saveAiVoteFailure({
                billActionId: action.id,
                ds,
                billUrl,
                voteUrl: null,
                attempts,
                errorMessage: "No vote PDF found on bill details page yet",
                status: "FAILED",
                nextAttemptAtISO: nextAttemptAt.toISOString()
            })

            return {
                billActionId,
                status: "ERROR" as const,
                billUrl,
                voteUrl: null,
                discoveredVoteUrls: voteLinks,
                error: "No vote PDF found on bill details page yet",
                retry
            }
        }

        const { committeeName, roster } = await loadCommitteeRoster(action.committeeId)

        const aiPayload = await extractVotesWithAi({
            billActionId: action.id,
            voteUrl,
            billNumber: action.bill.billNumber,
            sessionCode: action.bill.sessionCode,
            chamber: action.chamber ?? null,
            committeeId: action.committeeId,
            committeeName: committeeName || (action.committee?.name ?? ""),
            roster,
            actionDateISO: action.actionDate.toISOString()
        })

        aiPayload.billActionId = action.id

        const saved = await saveAiVoteResult({
            billId: action.billId,
            billActionId: action.id,
            ds,
            voteUrl,
            billUrl,
            payload: aiPayload,
            attempts
        })

        return {
            billActionId,
            status: "OK" as const,
            billUrl,
            voteUrl,
            discoveredVoteUrls: voteLinks,
            saved
        }
    } catch (err) {
        const classified = classifyOpenAiError(err)

        let status: VoteAiStatus = "FAILED"
        let nextAttemptAt = computeNextAttemptAt(attempts)

        if (classified.kind === "quota") {
            status = "FAILED_QUOTA"
            nextAttemptAt = computeQuotaBackoffHours(12)
        }

        if (classified.kind === "rate_limit") {
            status = "FAILED"
            nextAttemptAt = new Date(Date.now() + 15 * 60 * 1000)
        }

        const retry = await saveAiVoteFailure({
            billActionId: action.id,
            ds,
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

/*
    Find BillAction candidates to AI-process.
*/
async function findCandidateVoteActions(limit: number) {
    const activeSessionCode = await getActiveSessionCode()

    return prisma.billAction.findMany({
        where: {
            bill: { sessionCode: activeSessionCode },
            isVote: true,
            committeeId: { not: null },
            source: "MGA_JSON"
        },
        select: {
            id: true,
            dataSource: true
        },
        orderBy: [{ actionDate: "desc" }, { id: "desc" }],
        take: limit
    })
}

export async function GET(request: Request) {
    const run = await startScrapeRun('PROCESS_COMMITTEE_VOTES')
    
    try {
        const { userId } = await auth()
        const hasClerkUser = !!userId
        const hasCronSecret = isValidCronSecret(request)

        if (!hasClerkUser && !hasCronSecret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 })
        }

        const url = new URL(request.url)
        const billActionIdParam = url.searchParams.get("billActionId")
        const limitParam = url.searchParams.get("limit")

        if (billActionIdParam) {
            const billActionId = Number(billActionIdParam)
            if (!Number.isFinite(billActionId)) {
                return NextResponse.json({ error: "Invalid billActionId" }, { status: 400 })
            }

            const result = await processVoteBillActionAi(billActionId)

            return NextResponse.json({
                mode: "single",
                result
            })
        }

        const limit = limitParam ? Number(limitParam) : 25
        const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25

        const candidates = await findCandidateVoteActions(safeLimit)
        const now = new Date()

        const dueIds = candidates
            .filter(row => {
                const ds = getBillActionDataSource(row.dataSource)
                const voteAi = ds.voteAi
                const status = voteAi?.status

                if (status === "DONE") return false

                if (status === "PROCESSING" && voteAi?.lastAttemptAt) {
                    const last = new Date(voteAi.lastAttemptAt).getTime()
                    if (!Number.isNaN(last)) {
                        const ageMs = now.getTime() - last
                        if (ageMs < 10 * 60 * 1000) return false
                    }
                }

                if (status === "FAILED_QUOTA") {
                    return isDueToRun(voteAi, now)
                }

                return isDueToRun(voteAi, now)
            })
            .map(row => row.id)

        const results = []
        for (const id of dueIds) {
            results.push(await processVoteBillActionAi(id))
        }

        await finishScrapeRun(run.id, {
            success: true,
        })

        return NextResponse.json({
            mode: "batch",
            requestedLimit: safeLimit,
            candidates: candidates.length,
            due: dueIds.length,
            results
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
