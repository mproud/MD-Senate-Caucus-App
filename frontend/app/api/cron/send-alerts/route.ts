/*

    To Do -----

    Expand more alert types
    Calendar subscription?
    Need default user preferences. Set this in onboarding/welcome email too?
    Update user preferences doesn't work - doesn't switch from digest to realtime
    special mark/alert for "alert" bills

    Add to user preferences
        Bill Introduced, and others
    
    Hearing scheduled doesn't seem to be triggered??

*/

import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { sendTemplateEmail } from "@/lib/resend"
import { auth } from "@clerk/nextjs/server"
import { isValidCronSecret } from "@/lib/scrapers/helpers"
import {
    Prisma,
    AlertDeliveryChannel,
    AlertDeliveryStatus,
    AlertDigestCadence,
    AlertSendMode,
    AlertType,
    BillEventAlertsStatus,
    BillEventType,
} from "@prisma/client"
import { finishScrapeRun, startScrapeRun } from "@/lib/scrapers/logging"

function normalizeChamber(text: string): string {
    text = text.trim()
    return text[0].toUpperCase() + text.slice(1).toLowerCase()
}

function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (c) => {
        switch (c) {
            case "&":
                return "&amp;"
            case "<":
                return "&lt;"
            case ">":
                return "&gt;"
            case '"':
                return "&quot;"
            case "'":
                return "&#39;"
            default:
                return c
        }
    })
}

function stripHtml(s: string) {
    return s
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function truncate(s: string, max: number) {
    if (s.length <= max) {
        return s
    }
    return `${s.slice(0, max - 1)}…`
}

function toPreviewText(s: string, max = 120) {
    return truncate(stripHtml(s), max)
}

function billDashboardUrl(billNumber: string, eventType?: BillEventType) {
    const base = `https://www.caucusreport.com/bills/${encodeURIComponent(billNumber)}`

    if (eventType && eventType === "COMMITTEE_VOTE_RECORDED") {
        return `${base}?activeTab=votes`
    }

    return base
}

/**
 * Flagged bill helpers (high priority styling)
 */
function isFlaggedBill(event: any) {
    return event?.bill?.isFlagged === true
}

function importantPrefixText(event: any) {
    return isFlaggedBill(event) ? "IMPORTANT: " : ""
}

function importantSubjectPrefix(event: any) {
    return isFlaggedBill(event) ? "🚨 IMPORTANT: " : ""
}

function importantBannerHtml(event: any) {
    if (!isFlaggedBill(event)) {
        return ""
    }

    return `
        <div style="
            margin:0 0 14px;
            padding:12px 14px;
            border:1px solid #ef4444;
            background:#fee2e2;
            border-radius:10px;
            font-family: Arial, Helvetica, sans-serif;
        ">
            <div style="font-weight:700;color:#991b1b;font-size:14px;line-height:1.2;text-align:center;">
                🚨 🚨 This bill has been flagged by the caucus. 🚨 🚨
            </div>
        </div>
    `
}

function importantContainerStyle(event: any) {
    if (!isFlaggedBill(event)) {
        return `font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;`
    }

    return `
        font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        border-left: 6px solid #ef4444;
        background: #fff7f7;
        padding: 14px 14px 14px 12px;
        border-radius: 10px;
    `
}

function importantRowStyle(event: any) {
    return isFlaggedBill(event)
        ? "background:#fff1f2;border-top:1px solid #fecaca;"
        : "border-top:1px solid #eee;"
}

function importantPillHtml(event: any) {
    if (!isFlaggedBill(event)) {
        return ""
    }

    return `
        <span style="
            display:inline-block;
            margin-left:8px;
            padding:2px 8px;
            border-radius:999px;
            font-size:11px;
            font-weight:700;
            color:#991b1b;
            background:#fee2e2;
            border:1px solid #fecaca;
            vertical-align:middle;
        ">IMPORTANT</span>
    `
}

function getZonedParts(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "long",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    }).formatToParts(date)

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""

    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour: get("hour"),
        minute: get("minute"),
        dayPeriod: get("dayPeriod"),
    }
}

/**
 * Friendly date in Maryland timezone.
 * If local time is 12:00 AM (midnight), omit the time portion.
 */
function formatMarylandWhen(value: Date | string) {
    const timeZone = "America/New_York"
    const date = value instanceof Date ? value : new Date(value)

    const dateFmt = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "long",
        day: "numeric",
    })

    const timeFmt = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    })

    const { hour, minute, dayPeriod } = getZonedParts(date, timeZone)

    // Midnight check in 12-hour format: 12:00 AM
    const isMidnight = hour === "12" && minute === "00" && dayPeriod.toUpperCase() === "AM"

    if (isMidnight) {
        return dateFmt.format(date)
    }

    return `${dateFmt.format(date)} at ${timeFmt.format(date)}`
}

/**
 * Event type labels used in emails (and for UI display).
 * If an event type is missing here, we’ll fall back to a humanized label.
 */
const EVENT_TYPE_LABELS: Record<string, string> = {
    BILL_STATUS_CHANGED: "Bill status changed",
    BILL_INTRODUCED: "New bill introduced",
    BILL_NEW_ACTION: "New action",
    BILL_ADDED_TO_CALENDAR: "Added to calendar",
    BILL_REMOVED_FROM_CALENDAR: "Removed from calendar",
    COMMITTEE_REFERRAL: "Referred to committee",
    COMMITTEE_VOTE_RECORDED: "Committee vote recorded",
    HEARING_SCHEDULED: "Hearing scheduled",
    HEARING_CHANGED: "Hearing changed",
    HEARING_CANCELED: "Hearing canceled",
    CALENDAR_PUBLISHED: "Calendar published",
    CALENDAR_UPDATED: "Calendar updated",
}

function humanizeEventType(eventType: string, summary?: string): string {
    if (summary) return summary

    return (
        EVENT_TYPE_LABELS[eventType] ??
        eventType
            .toLowerCase()
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
    )
}

type CalendarChamberPreference = "house" | "senate" | "both"

/**
 * Preference keys used in user.userSettings.preferences.enabledAlertTypes.
 * These keys power the "notification settings" page, so we keep them stable.
 *
 * Note:
 * - committeeReferral and committeeVoteRecorded are intentionally separate.
 * - committeeVote remains as a legacy fallback for older saved preferences.
 */
type EnabledAlertTypes = {
    floorVote?: boolean
    newCrossfile?: boolean
    committeeReferral?: boolean
    committeeVoteRecorded?: boolean
    billStatusChange?: boolean
    hearingScheduled?: boolean
    billIntroduced?: boolean
    committeeVote?: boolean
    billAddedToCalendar?: boolean
    billRemovedFromCalendar?: boolean
    calendarPublished?: boolean
    calendarUpdated?: boolean
    [key: string]: boolean | undefined
}

/**
 * User preferences are stored in user.userSettings JSON.
 */
type UserPreferences = {
    digestDay?: string
    digestTime?: string
    phoneNumber?: string
    alertFrequency?: "realtime" | "daily_digest" | "weekly_digest"
    enabledAlertTypes?: EnabledAlertTypes
    alertDeliveryMethod?: "email" | "sms"
    calendarChamber?: CalendarChamberPreference
}

function getUserPreferences(userSettings: unknown): UserPreferences {
    if (!userSettings || typeof userSettings !== "object") {
        return {}
    }

    const obj = userSettings as any

    if (obj.preferences && typeof obj.preferences === "object") {
        return obj.preferences as UserPreferences
    }

    return {}
}

function chamberToPreferenceValue(chamber: unknown): "house" | "senate" | null {
    if (typeof chamber !== "string") {
        return null
    }

    const c = chamber.trim().toLowerCase()

    if (c === "house" || c === "h") {
        return "house"
    }

    if (c === "senate" || c === "s") {
        return "senate"
    }

    return null
}

function userWantsCalendarChamber(preferences: UserPreferences, event: any) {
    // Back-compat: default to both
    const pref = (preferences.calendarChamber ?? "both") as CalendarChamberPreference

    if (pref === "both") {
        return true
    }

    const eventChamber = chamberToPreferenceValue(event?.chamber)
    if (!eventChamber) {
        return true
    }

    return pref === eventChamber
}

// Force sending an alert if it's a flagged bill
function shouldForceSendFlagged(event: any) {
    return event?.bill?.isFlagged === true
}

function hhmmToMinutes(hhmm: string) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
    if (!m) {
        return null
    }

    const hh = Number(m[1])
    const mm = Number(m[2])

    if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return null
    }

    return hh * 60 + mm
}

function getNowPartsInTimeZone(timeZone: string) {
    const dt = new Date()
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(dt)

    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Monday"
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00"
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00"

    return {
        weekdayLower: weekday.toLowerCase(),
        minutesSinceMidnight: Number(hour) * 60 + Number(minute),
    }
}

/**
 * Digest due check:
 * - daily_digest: every day at digestTime (default 06:00 ET)
 * - weekly_digest: digestDay + digestTime (default Monday 06:00 ET)
 */
function isDigestDue(args: {
    preferences: UserPreferences
    timeZone: string
    windowMinutes?: number
}) {
    const { preferences, timeZone } = args
    const windowMinutes = args.windowMinutes ?? 5

    const freq = preferences.alertFrequency
    if (freq !== "daily_digest" && freq !== "weekly_digest") {
        return false
    }

    const digestTime = preferences.digestTime ?? "06:00"
    const targetMinutes = hhmmToMinutes(digestTime)
    if (targetMinutes === null) {
        return false
    }

    const nowParts = getNowPartsInTimeZone(timeZone)

    if (freq === "weekly_digest") {
        const digestDay = (preferences.digestDay ?? "monday").toLowerCase()
        if (nowParts.weekdayLower !== digestDay) {
            return false
        }
    }

    const diff = Math.abs(nowParts.minutesSinceMidnight - targetMinutes)
    return diff <= windowMinutes
}

/**
 * Canonical mapping from BillEventType -> enabledAlertTypes preference key.
 */
const EVENT_TYPE_TO_PREFERENCE_KEY: Partial<Record<BillEventType, keyof EnabledAlertTypes>> = {
    BILL_STATUS_CHANGED: "billStatusChange",
    BILL_INTRODUCED: "billIntroduced",
    BILL_ADDED_TO_CALENDAR: "billAddedToCalendar",
    BILL_REMOVED_FROM_CALENDAR: "billRemovedFromCalendar",
    CALENDAR_PUBLISHED: "calendarPublished",
    CALENDAR_UPDATED: "calendarUpdated",
    COMMITTEE_REFERRAL: "committeeReferral",
    COMMITTEE_VOTE_RECORDED: "committeeVoteRecorded",
    HEARING_SCHEDULED: "hearingScheduled",
    HEARING_CHANGED: "hearingScheduled",
    HEARING_CANCELED: "hearingScheduled",
}

function eventTypeToPreferenceKey(eventType: BillEventType): keyof EnabledAlertTypes | null {
    return EVENT_TYPE_TO_PREFERENCE_KEY[eventType] ?? null
}

function userWantsEmail(preferences: UserPreferences) {
    return preferences.alertDeliveryMethod === "email"
}

function userWantsEvent(preferences: UserPreferences, eventType: BillEventType) {
    const enabled = preferences.enabledAlertTypes ?? {}

    if (eventType === "COMMITTEE_REFERRAL") {
        return enabled.committeeReferral === true
    }

    if (eventType === "COMMITTEE_VOTE_RECORDED") {
        return enabled.committeeVoteRecorded === true || enabled.committeeVote === true
    }

    const key = eventTypeToPreferenceKey(eventType)
    if (!key) {
        return false
    }

    return enabled[key] === true
}

function eventTypeToAlertType(eventType: BillEventType): AlertType {
    switch (eventType) {
        case "BILL_STATUS_CHANGED":
            return AlertType.BILL_STATUS
        case "BILL_INTRODUCED":
            return AlertType.BILL
        case "COMMITTEE_VOTE_RECORDED":
        case "COMMITTEE_REFERRAL":
            return AlertType.COMMITTEE_ACTION
        case "HEARING_SCHEDULED":
        case "HEARING_CHANGED":
        case "HEARING_CANCELED":
            return AlertType.HEARING
        case "BILL_ADDED_TO_CALENDAR":
        case "BILL_REMOVED_FROM_CALENDAR":
        case "CALENDAR_PUBLISHED":
        case "CALENDAR_UPDATED":
            return AlertType.CALENDAR
        default:
            return AlertType.CUSTOM
    }
}

function frequencyToSendMode(prefs: UserPreferences): AlertSendMode {
    if (prefs.alertFrequency === "realtime") {
        return AlertSendMode.INSTANT
    }

    return AlertSendMode.DIGEST
}

function frequencyToDigestCadence(prefs: UserPreferences): AlertDigestCadence | null {
    if (prefs.alertFrequency === "daily_digest") {
        return AlertDigestCadence.DAILY
    }

    if (prefs.alertFrequency === "weekly_digest") {
        return AlertDigestCadence.WEEKLY
    }

    return null
}

/**
 * Helpers for throttling + error persistence
 */
function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function safeStringify(value: unknown) {
    try {
        const seen = new WeakSet<object>()

        return JSON.stringify(
            value,
            (_key, val) => {
                if (typeof val === "object" && val !== null) {
                    if (seen.has(val)) {
                        return "[Circular]"
                    }
                    seen.add(val)
                }
                return val
            },
            2
        )
    } catch {
        return null
    }
}

function capString(s: string, max = 4000) {
    if (s.length <= max) {
        return s
    }
    return `${s.slice(0, max - 1)}…`
}

function formatError(err: unknown) {
    if (err instanceof Error) {
        const stack = typeof err.stack === "string" ? `\n${err.stack}` : ""
        return `${err.name}: ${err.message}${stack}`.trim()
    }

    if (typeof err === "string") {
        return err
    }

    if (err && typeof err === "object") {
        const anyErr = err as any

        const code =
            typeof anyErr.code === "string"
                ? anyErr.code
                : typeof anyErr.name === "string"
                    ? anyErr.name
                    : null

        const msg =
            typeof anyErr.message === "string"
                ? anyErr.message
                : typeof anyErr.error === "string"
                    ? anyErr.error
                    : null

        if (code && msg) {
            return `${code}: ${msg}`
        }

        if (msg) {
            return msg
        }

        const json = safeStringify(err)
        if (json) {
            return json
        }
    }

    return String(err)
}

function isRateLimitError(err: unknown) {
    const msg = formatError(err).toLowerCase()
    return msg.includes("rate_limit") || msg.includes("too many requests") || msg.includes("429")
}

/**
 * Committee vote payload extraction (defensive).
 */
type PartyCounts = Record<string, number>

type VoteCounts = {
    yes?: number
    no?: number
    excused?: number
    absent?: number
    notVoting?: number
}

type CommitteeVoteInfo = {
    hasAnyCounts: boolean
    hasPdf: boolean
    pdfUrl: string | null
    counts: VoteCounts
    party: {
        yes: PartyCounts
        no: PartyCounts
    } | null
}

function asNumber(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) {
        return v
    }

    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v)
        if (Number.isFinite(n)) {
            return n
        }
    }

    return null
}

function normalizePartyKey(k: string) {
    const s = k.trim().toLowerCase()

    if (s === "d" || s === "dem" || s === "democrat" || s === "democratic") {
        return "D"
    }

    if (s === "r" || s === "rep" || s === "republican") {
        return "R"
    }

    if (s === "i" || s === "ind" || s === "independent") {
        return "I"
    }

    return k.trim().toUpperCase().slice(0, 8)
}

function normalizePartyCounts(obj: unknown): PartyCounts {
    if (!obj || typeof obj !== "object") {
        return {}
    }

    const out: PartyCounts = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const n = asNumber(v)
        if (n !== null) {
            const key = normalizePartyKey(k)
            out[key] = (out[key] ?? 0) + n
        }
    }

    return out
}

function sumPartyCounts(pc: PartyCounts) {
    return Object.values(pc).reduce((acc, n) => acc + n, 0)
}

function computePartyLineLabel(info: CommitteeVoteInfo): "Unanimous" | "Party Line" | "Mixed Party" | "Unknown" {
    const yesTotal = info.counts.yes ?? 0
    const noTotal = info.counts.no ?? 0

    if (yesTotal > 0 && noTotal === 0) {
        return "Unanimous"
    }

    if (!info.party) {
        return "Unknown"
    }

    const yesByParty = info.party.yes
    const noByParty = info.party.no

    const parties = Array.from(new Set([...Object.keys(yesByParty), ...Object.keys(noByParty)]))
    if (parties.length === 0) {
        return "Unknown"
    }

    const partiesWithYes = parties.filter((p) => (yesByParty[p] ?? 0) > 0)
    const partiesWithNo = parties.filter((p) => (noByParty[p] ?? 0) > 0)

    if (partiesWithNo.length === 0 && sumPartyCounts(yesByParty) > 0) {
        return "Unanimous"
    }

    if (partiesWithYes.length === 1 && partiesWithNo.length === 1 && partiesWithYes[0] !== partiesWithNo[0]) {
        const yesParty = partiesWithYes[0]
        const noParty = partiesWithNo[0]

        if ((noByParty[yesParty] ?? 0) === 0 && (yesByParty[noParty] ?? 0) === 0) {
            return "Party Line"
        }
    }

    return "Mixed Party"
}

function extractCommitteeVoteInfo(payload: unknown): CommitteeVoteInfo {
    const p = payload && typeof payload === "object" ? (payload as any) : {}

    const pdfUrlRaw =
        p.votePdfUrl ??
        p.pdfUrl ??
        p.urlPdf ??
        p.votePdf ??
        p.vote_pdf_url ??
        p.vote_pdf ??
        null

    const pdfUrl = typeof pdfUrlRaw === "string" && pdfUrlRaw.trim() !== "" ? pdfUrlRaw.trim() : null

    const countsObj = (p.voteCounts ?? p.counts ?? p.vote ?? p.rollup ?? p) as any

    const counts: VoteCounts = {
        yes: asNumber(countsObj?.yesVotes ?? countsObj?.yes ?? countsObj?.yea ?? countsObj?.yeas ?? countsObj?.y) ?? undefined,
        no: asNumber(countsObj?.noVotes ?? countsObj?.no ?? countsObj?.nay ?? countsObj?.nays ?? countsObj?.n) ?? undefined,
        excused: asNumber(countsObj?.excused ?? countsObj?.excusedVotes ?? countsObj?.exc) ?? undefined,
        absent: asNumber(countsObj?.absent ?? countsObj?.absentVotes ?? countsObj?.abs) ?? undefined,
        notVoting: asNumber(countsObj?.notVoting ?? countsObj?.notVotingVotes ?? countsObj?.nv) ?? undefined,
    }

    const hasAnyCounts =
        typeof counts.yes === "number" ||
        typeof counts.no === "number" ||
        typeof counts.excused === "number" ||
        typeof counts.absent === "number" ||
        typeof counts.notVoting === "number"

    const pbRaw = p.partyBreakdown ?? p.party_breakdown ?? p.breakdownByParty ?? p.party ?? null
    let party: CommitteeVoteInfo["party"] = null

    if (pbRaw && typeof pbRaw === "object") {
        const yesRaw = (pbRaw as any).yes ?? (pbRaw as any).yea ?? (pbRaw as any).yeas ?? null
        const noRaw = (pbRaw as any).no ?? (pbRaw as any).nay ?? (pbRaw as any).nays ?? null

        party = {
            yes: normalizePartyCounts(yesRaw),
            no: normalizePartyCounts(noRaw),
        }
    }

    return {
        hasAnyCounts,
        hasPdf: !!pdfUrl,
        pdfUrl,
        counts,
        party,
    }
}

function formatCountsInline(counts: VoteCounts) {
    const parts: string[] = []

    if (typeof counts.yes === "number") {
        parts.push(`Yes ${counts.yes}`)
    }

    if (typeof counts.no === "number") {
        parts.push(`No ${counts.no}`)
    }

    if (typeof counts.excused === "number") {
        parts.push(`Excused ${counts.excused}`)
    }

    if (typeof counts.absent === "number") {
        parts.push(`Absent ${counts.absent}`)
    }

    if (typeof counts.notVoting === "number") {
        parts.push(`Not voting ${counts.notVoting}`)
    }

    return parts.join(" · ")
}

function formatPartyBreakdownLine(info: CommitteeVoteInfo) {
    if (!info.party) {
        return null
    }

    const yesParts = Object.entries(info.party.yes)
        .filter(([, n]) => n > 0)
        .map(([p, n]) => `${p} ${n}`)
        .join(", ")

    const noParts = Object.entries(info.party.no)
        .filter(([, n]) => n > 0)
        .map(([p, n]) => `${p} ${n}`)
        .join(", ")

    if (!yesParts && !noParts) {
        return null
    }

    return `Yes: ${yesParts || "-"} | No: ${noParts || "-"}`
}

/**
 * Calendar published payload extraction (defensive).
 */
type CalendarItemRow = {
    position: number | null
    billNumber: string | null
    notes: string | null
    actionText: string | null
}

function extractCalendarItems(payload: unknown): CalendarItemRow[] {
    const p = payload && typeof payload === "object" ? (payload as any) : {}

    const candidates =
        p.items ??
        p.calendarItems ??
        p.calendar?.items ??
        p.data?.items ??
        p.calendar?.calendarItems ??
        null

    if (!Array.isArray(candidates)) {
        return []
    }

    return candidates
        .map((it: any): CalendarItemRow | null => {
            if (!it || typeof it !== "object") {
                return null
            }

            const position =
                typeof it.position === "number"
                    ? it.position
                    : typeof it.position === "string" && it.position.trim() !== "" && Number.isFinite(Number(it.position))
                        ? Number(it.position)
                        : null

            const billNumber =
                typeof it.billNumber === "string"
                    ? it.billNumber.trim()
                    : typeof it.bill?.billNumber === "string"
                        ? it.bill.billNumber.trim()
                        : typeof it.billNumberDisplay === "string"
                            ? it.billNumberDisplay.trim()
                            : null

            const notes =
                typeof it.notes === "string"
                    ? it.notes.trim()
                    : typeof it.note === "string"
                        ? it.note.trim()
                        : null

            const actionText =
                typeof it.actionText === "string"
                    ? it.actionText.trim()
                    : typeof it.action === "string"
                        ? it.action.trim()
                        : null

            if (!position && !billNumber && !notes && !actionText) {
                return null
            }

            return {
                position,
                billNumber: billNumber || null,
                notes: notes || null,
                actionText: actionText || null,
            }
        })
        .filter((v): v is CalendarItemRow => !!v)
}

function buildCalendarItemsTableHtml(items: CalendarItemRow[], maxRows = 40) {
    if (items.length === 0) {
        return `
            <p style="margin:0 0 8px;">
                <strong>Calendar items:</strong> No items were included with this event.
            </p>
        `
    }

    const limited = items.slice(0, maxRows)

    const rows = limited
        .map((it) => {
            const pos = it.position !== null ? String(it.position) : "-"
            const href = it.billNumber ? billDashboardUrl(it.billNumber) : "#"
            const bill = it.billNumber ? escapeHtml(it.billNumber) : "-"
            const action = it.actionText ? escapeHtml(it.actionText) : ""
            const notes = it.notes ? escapeHtml(it.notes) : ""

            return `
                <tr>
                    <td style="padding:8px;border-top:1px solid #eee;vertical-align:top;width:70px;">${escapeHtml(pos)}</td>
                    <td style="padding:8px;border-top:1px solid #eee;vertical-align:top;width:140px;">
                        ${it.billNumber ? `<a href="${escapeHtml(href)}">${bill}</a>` : "-"}
                    </td>
                    <td style="padding:8px;border-top:1px solid #eee;vertical-align:top;">
                        ${action ? `<div style="font-weight:600;">${action}</div>` : ""}
                        ${notes ? `<div style="color:#444;margin-top:4px;">${notes}</div>` : ""}
                    </td>
                </tr>
            `
        })
        .join("")

    const moreNote =
        items.length > limited.length
            ? `<p style="margin:8px 0 0;color:#666;font-size:12px;">Showing ${limited.length} of ${items.length} items.</p>`
            : ""

    return `
        <div style="margin:12px 0 0;">
            <h3 style="margin:0 0 8px;font-size:16px;">Calendar items</h3>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr>
                        <th align="left" style="padding:8px;border-bottom:1px solid #eee;">Pos</th>
                        <th align="left" style="padding:8px;border-bottom:1px solid #eee;">Bill</th>
                        <th align="left" style="padding:8px;border-bottom:1px solid #eee;">Details</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            ${moreNote}
        </div>
    `
}

function getBillNumberFromEvent(event: any) {
    const billNumber = typeof event?.bill?.billNumber === "string" ? event.bill.billNumber.trim() : ""
    return billNumber || null
}

function getBillTitleFromEvent(event: any) {
    const title = typeof event?.bill?.shortTitle === "string" ? event.bill.shortTitle.trim() : ""
    return title || null
}

function buildInstantPreviewText(args: { event: any }) {
    const { event } = args
    const prefix = importantPrefixText(event)
    const billNumber = getBillNumberFromEvent(event)
    const eventLabel = humanizeEventType(event.eventType)

    if (event.eventType === "COMMITTEE_VOTE_RECORDED") {
        const info = extractCommitteeVoteInfo(event.payload)
        const partyLine = computePartyLineLabel(info)

        if (info.hasAnyCounts) {
            const countsInline = formatCountsInline(info.counts)
            const base = billNumber
                ? `${billNumber}: Committee vote - ${countsInline} (${partyLine})`
                : `Committee vote - ${countsInline} (${partyLine})`
            return truncate(`${prefix}${base}`, 120)
        }

        return truncate(
            `${prefix}${
                billNumber
                    ? `${billNumber}: Committee vote recorded - details not yet posted`
                    : "Committee vote recorded - details not yet posted"
            }`,
            120
        )
    }

    if (event.eventType === "CALENDAR_PUBLISHED") {
        const items = extractCalendarItems(event.payload)
        const base = items.length > 0 ? `${normalizeChamber(event.chamber)} ${event.summary} - ${items.length} items` : "Calendar published"
        return truncate(`${prefix}${base}`, 120)
    }

    const summary = typeof event.summary === "string" ? event.summary : ""
    const base = billNumber ? `${billNumber}: ${eventLabel} - ${summary}` : `${eventLabel} - ${summary}`
    return truncate(`${prefix}${base}`.replace(/\s+/g, " ").trim(), 120)
}

function buildDigestPreviewText(args: { items: Array<{ event: any }> }) {
    const { items } = args
    const count = items.length

    const top = items
        .slice()
        .sort((a, b) => new Date(b.event.eventTime).getTime() - new Date(a.event.eventTime).getTime())
        .slice(0, 3)
        .map(({ event }) => {
            const prefix = importantPrefixText(event)
            const billNumber = getBillNumberFromEvent(event) ?? humanizeEventType(event.eventType)

            if (event.eventType === "COMMITTEE_VOTE_RECORDED") {
                const info = extractCommitteeVoteInfo(event.payload)
                const partyLine = computePartyLineLabel(info)
                const countsInline = info.hasAnyCounts ? formatCountsInline(info.counts) : "details pending"
                return `${prefix}${billNumber} (${countsInline}, ${partyLine})`
            }

            if (event.eventType === "CALENDAR_PUBLISHED") {
                const itemsList = event.floorCalendar.items
                return `${prefix}Calendar (${itemsList.length || 0} items)`
            }

            return `${prefix}${billNumber}`
        })
        .join(", ")

    const base = count <= 3 ? `${count} update${count === 1 ? "" : "s"}: ${top}` : `${count} updates: ${top}, and more`
    return truncate(base, 120)
}

function buildBillLineHtml(event: any) {
    const billNumber = getBillNumberFromEvent(event)
    if (!billNumber) {
        return ""
    }

    const billTitle = getBillTitleFromEvent(event)
    const billLabel = billTitle ? `${billNumber} - ${billTitle}` : billNumber

    return `
        <p style="margin:0 0 8px;">
            <strong>Bill:</strong>
            ${escapeHtml(billLabel)}
            ${importantPillHtml(event)}
        </p>
    `
}

function buildDashboardLineHtml(event: any, label: string) {
    const billNumber = getBillNumberFromEvent(event)
    if (!billNumber) {
        return ""
    }

    const url = billDashboardUrl(billNumber, event.eventType)

    const isImportant = isFlaggedBill(event)
    const buttonBg = isImportant ? "#dc2626" : "#000000"

    return `
        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:25px auto 20px;">
            <tr>
                <td align="center" bgcolor="${escapeHtml(buttonBg)}" style="border-radius:8px;">
                    <a href="${escapeHtml(url)}"
                        target="_blank"
                        style="
                            display:inline-block;
                            padding:12px 24px;
                            font-family: Arial, Helvetica, sans-serif;
                            font-size:12px;
                            color:#ffffff;
                            text-decoration:none;
                            border-radius:8px;
                            background-color:${escapeHtml(buttonBg)};
                        ">
                        ${escapeHtml(label)}
                    </a>
                </td>
            </tr>
        </table>
    `
}

function buildInstantEmailHtml(args: { event: any }) {
    const { event } = args
    const eventLabel = humanizeEventType(event.eventType)

    if (event.eventType === "COMMITTEE_VOTE_RECORDED") {
        const info = extractCommitteeVoteInfo(event.payload)
        const partyLine = computePartyLineLabel(info)
        const countsInline = info.hasAnyCounts ? formatCountsInline(info.counts) : null
        const partyLineBreakdown = formatPartyBreakdownLine(info)

        const pdfBlock = info.hasPdf
            ? `
                <p style="margin:0 0 8px;">
                    <strong>Committee vote PDF:</strong>
                    <a href="${escapeHtml(info.pdfUrl as string)}">${escapeHtml("Open PDF")}</a>
                </p>
            `
            : ""

        const countsBlock = info.hasAnyCounts
            ? `
                <p style="margin:0 0 8px;"><strong>Vote totals:</strong> ${escapeHtml(countsInline as string)}</p>
                <p style="margin:0 0 8px;"><strong>Party line:</strong> ${escapeHtml(partyLine)}</p>
                ${partyLineBreakdown ? `<p style="margin:0 0 8px;"><strong>Party breakdown:</strong> ${escapeHtml(partyLineBreakdown)}</p>` : ""}
            `
            : `
                <p style="margin:0 0 8px;">
                    <strong>Vote details:</strong> A committee vote was recorded, but the official PDF and vote counts have not been posted yet.
                </p>
            `

        const billLine = buildBillLineHtml(event)
        const dashboardLine = buildDashboardLineHtml(event, "View on dashboard")

        return `
            <div style="${importantContainerStyle(event)}">
                ${importantBannerHtml(event)}

                <h2 style="margin:0 0 12px;">
                    ${escapeHtml(eventLabel)}
                </h2>

                ${billLine}

                <p style="margin:0 0 8px;"><strong>When:</strong> ${escapeHtml(formatMarylandWhen(event.eventTime))}</p>

                ${pdfBlock}
                ${countsBlock}
                ${dashboardLine}

                <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
                <p style="margin:0;color:#666;font-size:12px;">Event ID: ${escapeHtml(String(event.id))}</p>
            </div>
        `
    }

    if (event.eventType === "CALENDAR_PUBLISHED") {
        const { items } = event.floorCalendar
        const table = buildCalendarItemsTableHtml(items, Number(process.env.ALERTS_MAX_CALENDAR_ROWS ?? "100"))

        return `
            <div style="${importantContainerStyle(event)}">
                ${importantBannerHtml(event)}

                <h2 style="margin:0 0 12px;">
                    ${normalizeChamber(event.chamber)} ${escapeHtml(event.summary)}
                </h2>

                <p style="margin:0 0 8px;"><strong>When:</strong> ${escapeHtml(formatMarylandWhen(event.eventTime))}</p>

                ${table}

                <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
                <p style="margin:0;color:#666;font-size:12px;">Event ID: ${escapeHtml(String(event.id))}</p>
            </div>
        `
    }

    const billLine = buildBillLineHtml(event)
    const dashboardLine = buildDashboardLineHtml(event, "View on dashboard")
    const summary = typeof event.summary === "string" ? event.summary : ""

    return `
        <div style="${importantContainerStyle(event)}">
            ${importantBannerHtml(event)}

            <h2 style="margin:0 0 12px;">
                ${escapeHtml(eventLabel)}
            </h2>

            ${billLine}
            <p style="margin:0 0 8px;"><strong>When:</strong> ${escapeHtml(formatMarylandWhen(event.eventTime))}</p>
            ${summary ? `<p style="margin:0 0 8px;"><strong>Summary:</strong> ${escapeHtml(summary)}</p>` : ""}

            ${dashboardLine}

            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
            <p style="margin:0;color:#666;font-size:12px;">Event ID: ${escapeHtml(String(event.id))}</p>
        </div>
    `
}

/**
 * DIGEST HTML RULES
 */
function buildDigestEmailHtml(args: { items: Array<{ event: any }> }) {
    const { items } = args

    const maxCalendarRows = Number(process.env.ALERTS_MAX_CALENDAR_ROWS_DIGEST ?? "25")

    const rows = items
        .sort((a, b) => new Date(b.event.eventTime).getTime() - new Date(a.event.eventTime).getTime())
        .map(({ event }) => {
            const billNumber = getBillNumberFromEvent(event)
            const billTitle = getBillTitleFromEvent(event)
            const dash = billNumber ? billDashboardUrl(billNumber, event.eventType) : null

            if (event.eventType === "COMMITTEE_VOTE_RECORDED") {
                const info = extractCommitteeVoteInfo(event.payload)
                const partyLine = computePartyLineLabel(info)

                const countsInline = info.hasAnyCounts
                    ? `Yes ${info.counts.yes ?? "-"} · No ${info.counts.no ?? "-"}`
                    : "Vote details pending"

                const billCellTitle = billNumber ? escapeHtml(billNumber) : "Committee vote"
                const billCellSubtitle = billTitle ? escapeHtml(billTitle) : ""

                return `
                    <tr style="${importantRowStyle(event)}">
                        <td style="padding:10px;vertical-align:top;">
                            <div style="font-weight:600;">
                                ${billCellTitle}
                                ${importantPillHtml(event)}
                            </div>
                            ${billCellSubtitle ? `<div style="color:#666;font-size:12px;">${billCellSubtitle}</div>` : ""}
                        </td>
                        <td style="padding:10px;vertical-align:top;">
                            <div style="font-weight:600;">Committee vote</div>
                            <div>${escapeHtml(`${countsInline} (${partyLine})`)}</div>
                            ${dash ? `<div style="margin-top:6px;"><a href="${escapeHtml(dash)}">View on dashboard</a></div>` : ""}
                        </td>
                    </tr>
                `
            }

            if (event.eventType === "CALENDAR_PUBLISHED") {
                const when = formatMarylandWhen(event.eventTime)
                const eventLabel = humanizeEventType(event.eventType)
                const itemsList = event.floorCalendar.items
                const table = buildCalendarItemsTableHtml(itemsList, maxCalendarRows)

                return `
                    <tr style="${importantRowStyle(event)}">
                        <td style="padding:10px;vertical-align:top;">
                            <div style="font-weight:600;">
                                ${escapeHtml(eventLabel)}
                                ${importantPillHtml(event)}
                            </div>
                            <div style="color:#666;font-size:12px;">${escapeHtml(when)}</div>
                        </td>
                        <td style="padding:10px;vertical-align:top;">
                            ${table}
                        </td>
                    </tr>
                `
            }

            const eventLabel = humanizeEventType(event.eventType)
            const when = formatMarylandWhen(event.eventTime)
            const summary = typeof event.summary === "string" ? event.summary : ""

            const leftTitle = billNumber ? escapeHtml(billNumber) : escapeHtml(eventLabel)
            const leftSubtitle = billTitle ? escapeHtml(billTitle) : ""

            return `
                <tr style="${importantRowStyle(event)}">
                    <td style="padding:10px;vertical-align:top;">
                        <div style="font-weight:600;">
                            ${leftTitle}
                            ${importantPillHtml(event)}
                        </div>
                        ${leftSubtitle ? `<div style="color:#666;font-size:12px;">${leftSubtitle}</div>` : ""}
                    </td>
                    <td style="padding:10px;vertical-align:top;">
                        ${billNumber ? `<div style="font-weight:600;">${escapeHtml(eventLabel)}</div>` : ""}
                        <div style="color:#666;font-size:12px;">${escapeHtml(when)}</div>
                        ${summary ? `<div>${escapeHtml(summary)}</div>` : ""}
                        ${dash ? `<div style="margin-top:6px;"><a href="${escapeHtml(dash)}">View on dashboard</a></div>` : ""}
                    </td>
                </tr>
            `
        })
        .join("")

    return `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
            <h2 style="margin:0 0 12px;">Bill updates digest</h2>
            <p style="margin:0 0 14px;color:#666;">
                ${escapeHtml(String(items.length))} update${items.length === 1 ? "" : "s"}
            </p>

            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr>
                        <th align="left" style="padding:10px;border-bottom:1px solid #eee;">Item</th>
                        <th align="left" style="padding:10px;border-bottom:1px solid #eee;">Update</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `
}

/**
 * Find or create an Alert row used only to anchor AlertDelivery records.
 */
async function getOrCreateDeliveryAnchorAlert(args: {
    clerkUserId: string
    target: string
    alertType: AlertType
    eventTypeFilter: BillEventType
    sendMode: AlertSendMode
    digestCadence: AlertDigestCadence | null
}) {
    const { clerkUserId, target, alertType, eventTypeFilter, sendMode, digestCadence } = args

    const existing = await prisma.alert.findFirst({
        where: {
            clerkUserId,
            active: true,
            alertType,
            deliveryChannel: AlertDeliveryChannel.EMAIL,
            target,
            sendMode,
            digestCadence,
            eventTypeFilter,
        },
        select: { id: true },
    })

    if (existing) {
        return existing
    }

    return prisma.alert.create({
        data: {
            clerkUserId,
            active: true,
            alertType,
            deliveryChannel: AlertDeliveryChannel.EMAIL,
            target,
            sendMode,
            digestCadence,
            eventTypeFilter,
        },
        select: { id: true },
    })
}

function computeNextAttemptAt(args: { attempts: number; now: Date }) {
    const { attempts, now } = args

    const schedule = [2, 5, 10, 20, 40, 60]
    const idx = Math.min(attempts, schedule.length - 1)
    const minutes = schedule[idx]
    return new Date(now.getTime() + minutes * 60 * 1000)
}

type PerEventResult = {
    billEventId: number
    billEventType: string
    status: "DONE" | "FAILED"
    attemptedDeliveries: number
    createdDeliveries: number
    sentInstant: number
    queuedDigest: number
    skipped: number
    failed: number
    error?: string
}

export async function GET(request: Request) {
    const { userId } = await auth()
    const hasClerkUser = !!userId
    const hasCronSecret = isValidCronSecret(request)

    if (!hasClerkUser && !hasCronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const run = await startScrapeRun("ALERT_SENDER")

    try {

        const now = new Date()
        const timeZone = "America/New_York"

        const events = await prisma.billEvent.findMany({
            where: {
                alertsStatus: {
                    in: [BillEventAlertsStatus.PENDING, BillEventAlertsStatus.FAILED],
                },
                OR: [
                    { alertsNextAttemptAt: null },
                    { alertsNextAttemptAt: { lte: now } },
                ],
            },
            include: {
                bill: true,
                committee: true,
                floorCalendar: {
                    include: {
                        items: true,
                    },
                },
            },
            orderBy: [
                { alertsStatus: "asc" },
                { id: "asc" },
                // { eventTime: "asc" },
            ],
            take: 50,
        })

        if (events.length === 0) {
            await finishScrapeRun(run.id, {
                success: true,
            })

            return NextResponse.json({
                ok: true,
                message: "No events pending alert processing",
                processed: 0,
            })
        }

        const users = await prisma.user.findMany({
            where: {
                email: {
                    not: "",
                },
                userSettings: {
                    not: Prisma.JsonNull,
                },
            },
            select: {
                id: true,
                clerkId: true,
                email: true,
                userSettings: true,
            },
            take: Number(process.env.ALERTS_MAX_USERS ?? "5000"),
        })

        const unknownEventTypes = new Set<string>()
        const preferenceKeyHints = new Set<string>()

        const results = {
            ok: true,
            eventsFetched: events.length,
            usersFetched: users.length,
            eventTypeToPreferenceKey: EVENT_TYPE_TO_PREFERENCE_KEY,
            eventTypeLabels: EVENT_TYPE_LABELS,
            unmappedEventTypesSeenThisRun: [] as string[],
            events: [] as Array<PerEventResult>,
            digests: {
                attempted: 0,
                sent: 0,
                failed: 0,
            },
        }

        const digestAlertIdsTouched = new Set<number>()

        for (const event of events) {
            const perEvent: PerEventResult = {
                billEventId: event.id,
                billEventType: event.eventType,
                status: "DONE",
                attemptedDeliveries: 0,
                createdDeliveries: 0,
                sentInstant: 0,
                queuedDigest: 0,
                skipped: 0,
                failed: 0,
                error: undefined,
            }

            const key = eventTypeToPreferenceKey(event.eventType)
            if (!key) {
                unknownEventTypes.add(String(event.eventType))
            } else {
                preferenceKeyHints.add(String(key))
            }

            const claimed = await prisma.billEvent.updateMany({
                where: {
                    id: event.id,
                    alertsStatus: {
                        in: [BillEventAlertsStatus.PENDING, BillEventAlertsStatus.FAILED],
                    },
                },
                data: {
                    alertsStatus: BillEventAlertsStatus.PROCESSING,
                    alertsAttempts: { increment: 1 },
                    alertsLastError: null,
                    alertsNextAttemptAt: null,
                },
            })

            if (claimed.count === 0) {
                continue
            }

            try {
                for (const user of users) {
                    const clerkId = user.clerkId
                    if (!clerkId) {
                        perEvent.skipped += 1
                        continue
                    }

                    const preferences = getUserPreferences(user.userSettings)
                    if (!userWantsEmail(preferences)) {
                        perEvent.skipped += 1
                        continue
                    }

                    const enabledKeys = preferences.enabledAlertTypes && Object.keys(preferences.enabledAlertTypes).length > 0
                    if (!enabledKeys) {
                        perEvent.skipped += 1
                        continue
                    }

                    // If a bill is flagged, user gets the alert anyway
                    const forceFlagged = shouldForceSendFlagged(event)

                    if (!forceFlagged && !userWantsEvent(preferences, event.eventType)) {
                        perEvent.skipped += 1
                        continue
                    }

                    if (event.eventType === "CALENDAR_PUBLISHED") {
                        if (!userWantsCalendarChamber(preferences, event)) {
                            perEvent.skipped += 1
                            continue
                        }
                    }

                    perEvent.attemptedDeliveries += 1

                    // const sendMode = frequencyToSendMode(preferences)
                    // const digestCadence = frequencyToDigestCadence(preferences)
                    
                    // Force alerts on flagged bill instantly
                    const sendMode = forceFlagged ? AlertSendMode.INSTANT : frequencyToSendMode(preferences)
                    // const digestCadence = forceFlagged ? null : frequencyToDigestCadence(preferences)

                    // But flagged bills still need to appear in the digest
                    const digestCadence = frequencyToDigestCadence(preferences)

                    const alertType = eventTypeToAlertType(event.eventType)

                    const anchorAlert = await getOrCreateDeliveryAnchorAlert({
                        clerkUserId: clerkId,
                        target: user.email,
                        alertType,
                        eventTypeFilter: event.eventType,
                        sendMode,
                        digestCadence,
                    })

                    let deliveryId: number | null = null
                    try {
                        const created = await prisma.alertDelivery.create({
                            data: {
                                alertId: anchorAlert.id,
                                billEventId: event.id,
                                status: AlertDeliveryStatus.QUEUED,
                            },
                            select: { id: true },
                        })

                        deliveryId = created.id
                        perEvent.createdDeliveries += 1
                    } catch (err) {
                        perEvent.skipped += 1
                        continue
                    }

                    if (sendMode === AlertSendMode.INSTANT) {
                        const eventTypeLabel = humanizeEventType(event.eventType)
                        const billNumber = getBillNumberFromEvent(event)

                        let subject = billNumber
                            ? `${billNumber} - ${eventTypeLabel}`
                            : eventTypeLabel

                        if (
                            event.eventType === "CALENDAR_PUBLISHED" &&
                            event.summary?.trim()
                        ) {
                            subject = `${normalizeChamber(event.chamber!)} ${event.summary}`
                        }

                        subject = `${importantSubjectPrefix(event)}${subject}`

                        const html = buildInstantEmailHtml({ event })
                        const preview = buildInstantPreviewText({ event })

                        const { error } = await sendTemplateEmail({
                            to: user.email,
                            subject,
                            html,
                            preview,
                            important: isFlaggedBill(event),
                        })

                        if (error) {
                            perEvent.failed += 1

                            await prisma.alertDelivery.update({
                                where: { id: deliveryId as number },
                                data: {
                                    status: AlertDeliveryStatus.FAILED,
                                    error: capString(formatError(error)),
                                },
                            })

                            await sleep(isRateLimitError(error) ? 2000 : 550)
                            continue
                        }

                        perEvent.sentInstant += 1

                        await prisma.alertDelivery.update({
                            where: { id: deliveryId as number },
                            data: {
                                status: AlertDeliveryStatus.SENT,
                                sentAt: new Date(),
                                error: null,
                            },
                        })

                        await prisma.alert.update({
                            where: { id: anchorAlert.id },
                            data: { lastTriggeredAt: new Date() },
                        })

                        await sleep(550)
                        continue
                    }

                    perEvent.queuedDigest += 1
                    digestAlertIdsTouched.add(anchorAlert.id)
                }

                await prisma.billEvent.update({
                    where: { id: event.id },
                    data: {
                        alertsStatus: BillEventAlertsStatus.DONE,
                        alertsProcessedAt: new Date(),
                        processedForAlerts: true,
                    },
                })

                results.events.push(perEvent)
            } catch (err) {
                perEvent.status = "FAILED"
                perEvent.error = capString(formatError(err))

                const refreshed = await prisma.billEvent.findUnique({
                    where: { id: event.id },
                    select: { alertsAttempts: true },
                })

                const attempts = refreshed?.alertsAttempts ?? 1
                const nextAttemptAt = computeNextAttemptAt({ attempts, now })

                await prisma.billEvent.update({
                    where: { id: event.id },
                    data: {
                        alertsStatus: BillEventAlertsStatus.FAILED,
                        alertsLastError: capString(formatError(err)),
                        alertsNextAttemptAt: nextAttemptAt,
                    },
                })

                results.events.push(perEvent)
            }
        }

        for (const alertId of Array.from(digestAlertIdsTouched)) {
            const alert = await prisma.alert.findUnique({
                where: { id: alertId },
                include: {
                    user: true,
                },
            })

            if (!alert || !alert.user) {
                continue
            }

            if (alert.sendMode !== AlertSendMode.DIGEST) {
                continue
            }

            const prefs = getUserPreferences(alert.user.userSettings)
            if (!userWantsEmail(prefs)) {
                continue
            }

            if (!isDigestDue({ preferences: prefs, timeZone })) {
                continue
            }

            if (alert.lastTriggeredAt) {
                const ms = now.getTime() - alert.lastTriggeredAt.getTime()
                const minGapMs = 30 * 60 * 1000
                if (ms < minGapMs) {
                    continue
                }
            }

            const queued = await prisma.alertDelivery.findMany({
                where: {
                    alertId,
                    status: AlertDeliveryStatus.QUEUED,
                },
                include: {
                    billEvent: {
                        include: { bill: true },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
                take: Number(process.env.ALERTS_MAX_DIGEST_ITEMS ?? "100"),
            })

            if (queued.length === 0) {
                await prisma.alert.update({
                    where: { id: alertId },
                    data: { lastTriggeredAt: new Date() },
                })
                continue
            }

            results.digests.attempted += 1

            const subject = `Bill updates digest (${queued.length})`
            const html = buildDigestEmailHtml({
                items: queued.map((q) => ({ event: q.billEvent })),
            })
            const preview = buildDigestPreviewText({
                items: queued.map((q) => ({ event: q.billEvent })),
            })

            // Figure out if there's a priority bill in the digest
            const digestImportant = queued.some((q) => q.billEvent?.bill?.isFlagged === true)

            const { error } = await sendTemplateEmail({
                to: alert.target,
                subject,
                html,
                preview,
                important: digestImportant,
            })

            if (error) {
                results.digests.failed += 1

                await prisma.alertDelivery.updateMany({
                    where: { id: { in: queued.map((q) => q.id) } },
                    data: {
                        status: AlertDeliveryStatus.FAILED,
                        error: capString(formatError(error)),
                    },
                })

                await sleep(isRateLimitError(error) ? 2000 : 550)
                continue
            }

            results.digests.sent += 1

            await prisma.alertDelivery.updateMany({
                where: { id: { in: queued.map((q) => q.id) } },
                data: {
                    status: AlertDeliveryStatus.SENT,
                    sentAt: new Date(),
                    error: null,
                },
            })

            await prisma.alert.update({
                where: { id: alertId },
                data: { lastTriggeredAt: new Date() },
            })

            await sleep(550)
        }

        results.unmappedEventTypesSeenThisRun = Array.from(unknownEventTypes)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const preferenceKeysUsedThisRun = Array.from(preferenceKeyHints)

        await finishScrapeRun(run.id, {
            success: true,
        })

        return NextResponse.json(results)
    } catch ( error ) {
        console.error( `Alert sender error`, error )

        await finishScrapeRun(run.id, {
            success: false,
            error,
        })

        return NextResponse.json({
            ok: false,
            error: String( error )
        }, { status: 500 })
    } finally {
        await prisma.$disconnect()
    }
}
