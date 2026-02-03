import { NextResponse } from "next/server"
import * as cheerio from 'cheerio'
import { prisma } from "@/lib/prisma"
import { MGA_BASE } from "@/lib/scrapers/mga-base"
import { fetchHtml } from "@/lib/scrapers/http"
import { startScrapeRun, finishScrapeRun } from "@/lib/scrapers/logging"
import { BillEventType, CalendarType, Chamber, FloorCalendar, Prisma } from "@prisma/client"
import { isValidCronSecret, normalizeDate } from "@/lib/scrapers/helpers"
import { auth } from "@clerk/nextjs/server"
import { getScraperDays } from "@/lib/get-system-setting"


const CHAMBERS = ['SENATE', 'HOUSE', 'JOINT'] as const
const isChamber = (value: string): value is Chamber => CHAMBERS.includes(value as Chamber)

// build the MGA agenda URL for a given chamber + date
function buildAgendaUrl(chamber: Chamber, date: Date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const yyyy = date.getFullYear()

    return `https://mgaleg.maryland.gov/mgawebsite/FloorActions/Agenda/${chamber.toLowerCase()}-${mm}${dd}${yyyy}`
}

// Scrape today's agenda from the MGA site
// v3 (v1 got messy, v2 was standalone)

interface ParsedHeader extends Prisma.JsonObject {
    calendarType: string // This should be a structured calendar, but leave it a string for now
    calendarNumber?: number | null
    consentCalendar: number | boolean | null // this is the consent calendar if it is one
    distributionDate?: string | null // this should be formatted as a date
    readingDate?: string | null // this should be formatted as a date
    heading?: string | null // the original heading
    headerId?: string | null // the ID from the agenda table
    committeeName?: string | null // get the committee name from the heading
}

interface ParsedAgendaItem extends Prisma.JsonObject {
    headerId: string | null          // table / header anchor id (e.g. CommitteeReport20fin)
    billNumber: string               // e.g. SB0215
    billUrl: string | null           // absolute or relative URL
    disposition: string | null       // e.g. Favorable with Amendments(2)
    sponsor: string | null           // e.g. Chair, Finance Committee
    description: string | null       // bill title text
    status: string | null            // e.g. FAVORABLE (from the bold/underlined row)
}

interface ParsedSection {
    headerId?: string | null
    header: ParsedHeader | null
    items: ParsedAgendaItem[]
}

// Detect if there's no agenda
function isNoAgendaPage($: cheerio.CheerioAPI): boolean {
    const pageText = $("body").text().replace(/\s+/g, " ").trim()

    return /\bno\s+(senate|house)\s+agenda\b/i.test(pageText)
}

// Parse the header for things like Second Reading, Third Reading, Consent Calendar, Special Order Calendar, etc
// some bills can be second reading x consent y
// @TODO handle laid over bills, etc (what others??)
function parseAgendaHeader( header: string, headerId: string ): ParsedHeader | null {
    const primaryPatterns = [
        // { type: 'committee_report', regex: /Committee Report No\.\s*(\d+)/i },
        { type: 'committee_report', regex: /^(?:(.*?)\s+)?Committee Report No\.\s*(\d+)/i }, // grab the full heading from the committee report
        { type: 'third_reading_calendar', regex: /Third Reading Calendar No\.\s*(\d+)/i },
        { type: 'special_order_calendar', regex: /Special Order Calendar No\.\s*(\d+)/i },
        { type: "vetoed_bills_calendar", regex: /Calendar of Vetoed(?:\s+(Senate|House))?\s+Bills?\s+No\.\s*(\d+)/i },
        { type: 'first_reading_calendar', regex: /Introductory\s+(House|Senate)\s+Bills?\s+No\.\s*(\d+)/i },
    ] as const

    const consentRegex = /Consent(?: Calendar)? No\.\s*(\d+)/i

    // old code to make the heading one line
    // const heading = header.replace(/\s+/g, ' ').trim()

    const rawHeading = header.replace(/\r\n/g, "\n").trim()
    const headingLines = rawHeading.split("\n").map(l => l.trim()).filter(Boolean)
    const heading = headingLines.join(" ")

    // Prefer dates from the full multi-line heading, not the condensed one\
    const dateSourceText = headingLines.join("\n")

    // Extract leading header date from the first non-empty line (e.g. "January 14, 2026")
    const leadingDateLine = headingLines[0] ?? ""
    const leadingDateMatch = leadingDateLine.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\b/)
    const headerDate = normalizeDate(
        leadingDateMatch ? `${leadingDateMatch[1]} ${leadingDateMatch[2]}, ${leadingDateMatch[3]}` : undefined
    )

    // Extract Distribution/Reading dates
    const distributionMatch = dateSourceText.match(/Distribution Date:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i)
    const readingMatch = dateSourceText.match(/(First|Second|Third|Fourth|Fifth)?\s*Reading Date:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i)

    // Prefer explicit fields, but fall back to headerDate
    const distributionDate = normalizeDate(distributionMatch?.[1]) ?? headerDate ?? null
    const readingDate = normalizeDate(readingMatch?.[2]) ?? headerDate ?? null

    // Extract consent calendar number
    const consentMatch = heading.match(consentRegex)
    const consentCalendar = consentMatch ? parseInt(consentMatch[1], 10) : false

    // Derive a clean displayed heading (e.g. "Introductory Senate Bills No. 1")
    let displayHeading = heading
    for (const { regex } of primaryPatterns) {
        const m = heading.match(regex)
        if (m) {
            displayHeading = m[0].replace(/\s+/g, " ").trim()
            break
        }
    }

    if (displayHeading === heading) {
        const consentOnly = heading.match(consentRegex)
        if (consentOnly) {
            displayHeading = consentOnly[0].replace(/\s+/g, " ").trim()
        }
    }

    // Find primary calendar
    for (const { type, regex } of primaryPatterns) {
        const match = heading.match(regex)
        if (match) {
            let number: number | null = null
            let committeeName: string | null = null
            let finalHeading = displayHeading

            if (type === "committee_report") {
                // match[1] = optional committee prefix, match[2] = number
                committeeName = match[1]?.trim() ?? null
                number = parseInt(match[2], 10)

                /**
                 * Newly added: keep the committee name in the heading so that:
                 * - the calendar name is unique/human-friendly
                 * - extractCommitteeNameFromHeader works reliably
                 */
                finalHeading = committeeName
                    ? `${committeeName} Committee Report No. ${number}`
                    : `Committee Report No. ${number}`
            } else if (type === "vetoed_bills_calendar") {
                number = parseInt(match[2], 10)
            } else if (type === "first_reading_calendar") {
                number = parseInt(match[2], 10)
            } else {
                number = parseInt(match[1], 10)
            }

            return {
                calendarType: type,
                calendarNumber: number,
                consentCalendar,
                distributionDate,
                readingDate,
                heading: finalHeading,
                headerId,
                committeeName,
            }
        }
    }

    // If *only* a consent calendar exists, treat it as the primary
    if (consentCalendar !== false) {
        return {
            calendarType: "consent_calendar",
            calendarNumber: consentCalendar,
            consentCalendar,
            distributionDate,
            readingDate,
            heading: displayHeading,
            headerId,
        }
    }

    return null
}

async function scrapeAgendaUrl( url: string ) {
    // @TODO handle any errors! (log them!)
    const $ = await fetchHtml( url )
    // const html = $.html() // not sure if we need this, but just in case...

    // Bail if there's no agenda
    if (isNoAgendaPage($)) {
        return []
    }

    const sections: ParsedSection[] = []

    $('table').each(( _, el ) => {
        const $table = $(el)

        // const headerText = $table.find('thead th').text().replace(/\s+/g, ' ').trim()
        const headerText = $table.find('thead th').text().trim()

        // Bail on tables without a header
        if ( ! headerText ) return

        const rawHeaderText = $table.find('thead th').text().trim()

        const headerId =
            $table.find('thead a[id]').attr('id') ??
            rawHeaderText
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '')

        const parsedHeader = parseAgendaHeader( headerText, headerId )

        if ( ! parsedHeader ) return

        const items: ParsedAgendaItem[] = []

        // Each agenda item is one outer <tr> inside this table's <tbody>
        $table.find('tbody > tr').each((__, row) => {
            const $row = $(row)

            const innerTable = $row.find('table').first()
            if (!innerTable.length) return

            const innerRows = innerTable.find('tbody > tr')
            if (!innerRows.length) return

            // --- 1. Optional status row (FAVORABLE / UNFAVORABLE / etc.) ---
            let status: string | null = null
            let startIdx = 0

            const firstRowText = innerRows.eq(0).text().replace(/\s+/g, ' ').trim()
            if (
                firstRowText &&
                /FAVORABLE|UNFAVORABLE|ADVERSE|LAID OVER|REFERRED/i.test(firstRowText)
            ) {
                status = firstRowText
                startIdx = 1
            }

            // --- 2. Find the first row that actually has a bill link (<a>) ---
            let billRowIndex: number | null = null

            innerRows.each((idx, r) => {
                if (idx < startIdx) return

                const hasLink = $(r).find('a').length > 0
                if (hasLink) {
                    billRowIndex = idx
                    // cheerio: returning false breaks out of .each
                    return false as any
                }
            })

            if (billRowIndex === null) return

            const billRow = innerRows.eq(billRowIndex)

            const billLink = billRow.find('a').first()
            const billNumber = billLink.text().replace(/\s+/g, ' ').trim()
            if (!billNumber) return

            const billUrl = billLink.attr('href') || null

            // --- 3. Disposition + Sponsor from remaining cells ---
            const billCells = billRow.find('td')
            const extraTexts: string[] = []

            billCells.slice(1).each((i, td) => {
                const txt = $(td).text().replace(/\s+/g, ' ').trim()
                if (txt) {
                    extraTexts.push(txt)
                }
            })

            let disposition: string | null = null
            let sponsor: string | null = null

            for (const txt of extraTexts) {
                if (/Favorable|Unfavorable|Adverse|with Amendments|Laid Over|Special Order/i.test(txt)) {
                    disposition = txt
                    break
                }
            }

            for (const txt of extraTexts) {
                if (txt !== disposition && !sponsor) {
                    sponsor = txt
                }
            }

            // --- 4. Description row is usually the next row after the bill row ---
            const descriptionRow = innerRows.eq(billRowIndex + 1)
            let description: string | null = null

            if (descriptionRow && descriptionRow.length) {
                const descText = descriptionRow.text().replace(/\s+/g, ' ').trim()
                description = descText || null
            }

            // @TODO there's a committee in some of these. Is this needed or should it just be pulled from the JSON?

            // Some of these may not be needed since technically we only need to know that the bills are on the agenda, teh rest we already have
            items.push({
                headerId,
                billNumber,
                billUrl,
                disposition,
                sponsor, // remove
                description, // remove
                status, // I don't care about this. remove
            })
        })

        sections.push({
            headerId: parsedHeader.headerId,
            header: parsedHeader,
            items,
        })
    })

    return sections
}

function extractCommitteeNameFromHeader(header: ParsedHeader | null): string | null {
    if (!header) return null
    if (!header.calendarType) return null

    const type = header.calendarType.toLowerCase()
    if (type !== "committee_report") return null

    /**
     * Use the already-parsed committeeName first.
     * this avoids relying on string patterns that can break when
     * MGA changes formatting.
     */
    if (header.committeeName) {
        return header.committeeName.trim()
    }

    const heading = header.heading ?? ""
    if (!heading) return null

    const match = heading.match(/^(.*?)\s+Committee Report/i)
    if (match && match[1]) {
        return match[1].trim()
    }

    return null
}



// Map the calendar ID to the DB's calendar type
function mapCalendarType(type: string | undefined | null): CalendarType | null {
    if (!type) return null
    const t = type.toLowerCase()
    if (t === 'committee_report') return 'COMMITTEE_REPORT'
    if (t === 'first_reading_calendar') return 'FIRST_READING'
    if (t === 'second_reading_calendar') return 'SECOND_READING'
    if (t === 'third_reading_calendar') return 'THIRD_READING'
    if (t === 'special_order_calendar') return 'SPECIAL_ORDER'
    if (t === 'consent_calendar') return 'CONSENT'
    if (t === 'vetoed_bills_calendar') return 'VETOED'
    return null
}

// @@@@ HERE STOPPED HERE

// Create a CALENDAR_PUBLISHED event when there's a new calendar
async function createCalendarPublishedEvent(opts: {
    chamber: Chamber
    floorCalendarId: number
    committeeId: number | null
    header: ParsedHeader | null
    agendaUrl: string
}) {
    const { chamber, floorCalendarId, committeeId, header, agendaUrl } = opts

    const calendarTypeEnum = mapCalendarType(header?.calendarType ?? null)
    const calendarNumber = header?.calendarNumber ?? null
    const calendarName = header?.heading ?? null
    const calendarDateStr = header?.readingDate ?? header?.distributionDate ?? null
    const calendarDate = calendarDateStr ? new Date(calendarDateStr) : null

    // Avoid duplicate CALENDAR_PUBLISHED for the same calendar
    const existingEvent = await prisma.billEvent.findFirst({
        where: {
            eventType: BillEventType.CALENDAR_PUBLISHED,
            floorCalendarId,
            calendarType: calendarTypeEnum,
            calendarNumber,
        },
    })

    if (existingEvent) return

    const summary = `Calendar ${calendarNumber ?? ''}${
        calendarName ? ` - ${calendarName}` : ''
    } published`.trim() // Probably customize this when we get to email alerts

    await prisma.billEvent.create({
        data: {
            // NOTE: billId is intentionally omitted here; this assumes billId is optional.
            eventType: BillEventType.CALENDAR_PUBLISHED,
            chamber,
            floorCalendarId,
            committeeId,
            calendarType: calendarTypeEnum,
            calendarNumber,
            eventTime: calendarDate ?? new Date(),
            summary,
            payload: {
                calendarName,
                calendarType: header?.calendarType ?? null,
                calendarNumber,
                calendarDate: calendarDateStr,
                distributionDate: header?.distributionDate ?? null,
                readingDate: header?.readingDate ?? null,
                heading: header?.heading ?? null,
                agendaUrl,
            },
        },
    })
}

// Handle when a bill is removed from the calendar
async function createBillRemovedFromCalendarEvent(opts: {
    billId: number
    billNumber: string
    chamber: Chamber
    floorCalendarId: number
    committeeId: number | null
    header: ParsedHeader | null
    agendaUrl: string
}) {
    const { billId, billNumber, chamber, floorCalendarId, header, agendaUrl, committeeId } = opts

    const calendarTypeEnum = mapCalendarType(header?.calendarType ?? null)
    const calendarNumber = header?.calendarNumber ?? null
    const calendarName = header?.heading ?? null
    const calendarDateStr = header?.readingDate ?? header?.distributionDate ?? null
    const calendarDate = calendarDateStr ? new Date(calendarDateStr) : null

    // avoid duplicate remove events
    const existing = await prisma.billEvent.findFirst({
        where: {
            billId,
            eventType: BillEventType.BILL_REMOVED_FROM_CALENDAR,
            floorCalendarId,
            calendarType: calendarTypeEnum,
            calendarNumber,
        },
    })
    if (existing) return

    const summary = `${billNumber} removed from calendar ${calendarNumber ?? ''}${
        calendarName ? ` – ${calendarName}` : ''
    }`.trim()

    await prisma.billEvent.create({
        data: {
            billId,
            eventType: BillEventType.BILL_REMOVED_FROM_CALENDAR,
            chamber,
            floorCalendarId,
            committeeId,
            calendarType: calendarTypeEnum,
            calendarNumber,
            eventTime: calendarDate ?? new Date(),
            summary,
            payload: {
                calendarName,
                calendarType: header?.calendarType ?? null,
                calendarNumber,
                calendarDate: calendarDateStr,
                distributionDate: header?.distributionDate ?? null,
                readingDate: header?.readingDate ?? null,
                heading: header?.heading ?? null,
                agendaUrl,
            },
        },
    })
}

// When a calendar is updated...
async function createCalendarUpdatedEvent(opts: {
    chamber: Chamber
    floorCalendarId: number
    committeeId: number | null
    header: ParsedHeader | null
    agendaUrl: string
    changes: Array<{
        billNumber: string
        changeType: 'added' | 'removed' | 'moved'
        oldPosition?: number | null
        newPosition?: number | null
    }>
}) {
    const { chamber, floorCalendarId, committeeId, header, agendaUrl, changes } = opts

    if (!changes.length) return

    const calendarTypeEnum = mapCalendarType(header?.calendarType ?? null)
    const calendarNumber = header?.calendarNumber ?? null
    const calendarName = header?.heading ?? null
    const calendarDateStr = header?.readingDate ?? header?.distributionDate ?? null
    const calendarDate = calendarDateStr ? new Date(calendarDateStr) : null

    const summary = `Calendar ${calendarNumber ?? ''}${
        calendarName ? ` – ${calendarName}` : ''
    } updated (${changes.length} change${changes.length === 1 ? '' : 's'})`.trim()

    await prisma.billEvent.create({
        data: {
            // calendar-level, no billId
            eventType: BillEventType.CALENDAR_UPDATED,
            chamber,
            floorCalendarId,
            committeeId,
            calendarType: calendarTypeEnum,
            calendarNumber,
            eventTime: calendarDate ?? new Date(),
            summary,
            payload: {
                calendarName,
                calendarType: header?.calendarType ?? null,
                calendarNumber,
                calendarDate: calendarDateStr,
                distributionDate: header?.distributionDate ?? null,
                readingDate: header?.readingDate ?? null,
                heading: header?.heading ?? null,
                agendaUrl,
                changes,
            },
        },
    })
}

// Add each bill as a calendarItem
async function upsertCalendarItem(opts: {
    floorCalendarId: number
    position: number
    billNumber: string
    billId: number | null
    committeeId: number | null
    actionText: string | null
    notes: string | null
    rawItem: ParsedAgendaItem
}) {
    const {
        floorCalendarId,
        position,
        billNumber,
        billId,
        committeeId,
        actionText,
        notes,
        rawItem,
    } = opts

    // Because of @@unique([floorCalendarId, position]) Prisma exposes a
    // composite unique where input called `floorCalendarId_position`.
    await prisma.calendarItem.upsert({
        where: {
            floorCalendarId_position: {
                floorCalendarId,
                position,
            },
        },
        update: {
            billNumber,
            billId,
            committeeId,
            actionText,
            notes,
            dataSource: rawItem,
        },
        create: {
            floorCalendarId,
            position,
            billNumber,
            billId,
            committeeId,
            actionText,
            notes,
            dataSource: rawItem,
        },
    })
}


// Add the floor calendar to the database
async function upsertFloorCalendar(opts: {
    chamber: Chamber
    header: ParsedHeader | null
    agendaUrl: string
    sessionYear: number
    sessionCode: string
}): Promise<{ calendar: FloorCalendar; wasNew: boolean } | null> {
    const { chamber, header, agendaUrl, sessionYear, sessionCode } = opts
    if ( ! header) return null

    const calendarTypeEnum = mapCalendarType(header.calendarType)
    const calendarNumber = header.calendarNumber ?? null
    const calendarDateStr = header.readingDate ?? header.distributionDate ?? null
    const calendarDate = calendarDateStr ? new Date(calendarDateStr) : null
    const calendarName = header.heading ?? null

    let committee = null as { id: number; name: string } | null
    const committeeName = extractCommitteeNameFromHeader(header)

    if (committeeName) {
        console.log('>>> Find committee', { committeeName })

        // Some of the committees have "Committee" twice
        const normalized = committeeName
            .replace(/committee$/i, '')     // remove trailing "Committee"
            .replace(/committee\s*$/i, '')  // remove "Committee" with trailing space
            .trim()

        // Build alternate forms
        const withCommittee = `${normalized} Committee`
        const candidates = [normalized, withCommittee]

        // Query allowing multiple forms
        committee = await prisma.committee.findFirst({
            where: {
                chamber,
                OR: [
                    // exact name match
                    { name: committeeName },
                    // normalized matches
                    { name: normalized },
                    { name: withCommittee },
                    // lowercase-insensitive contains
                    { name: { contains: normalized, mode: 'insensitive' }},
                    // in case DB has more words (e.g. "Senate Education, Energy, and the Environment")
                    { name: { startsWith: normalized, mode: 'insensitive' }},
                ],
            },
            select: { id: true, name: true },
        })

        if (!committee) {
            console.warn(
                `upsertFloorCalendar: could not find committee "${committeeName}" (normalized: "${normalized}") for chamber ${chamber}`
            )
        } else {
            console.log(`>>> Matched committee "${committee.name}" (id=${committee.id}) to header "${committeeName}"`)
        }
    }

    if (!calendarTypeEnum) {
        console.warn("upsertFloorCalendar: unknown calendarType", header.calendarType)
        return null
    }

    const existing = await prisma.floorCalendar.findFirst({
        where: {
            sessionYear,
            sessionCode,
            chamber,
            calendarType: calendarTypeEnum,
            calendarNumber,

            /**
             * Newly added: committee reports must also match committeeId,
             * otherwise Finance #1 and JPR #1 will collide.
             */
            ...(calendarTypeEnum === "COMMITTEE_REPORT"
                ? { committeeId: committee?.id ?? null }
                : {}),

            // keep your other match fields if you want them as additional guardrails
            calendarDate: calendarDate ?? undefined,
            calendarName: calendarName ?? undefined,
        },
        // select: {
        //     id: true,
        //     committeeId: true,
        // }
    })

    // if it already exists but has no committee yet, backfill it ---
    if ( existing ) {
        if ( ! existing.committeeId && committee ) {
            const existingCommitteeCal = await prisma.floorCalendar.update({
                where: { id: existing.id },
                data: {
                    committee: {
                        connect: { id: committee.id },
                    },
                },
            })

            return { calendar: existingCommitteeCal, wasNew: false }
        }

        // already have it (and possibly already have committee), just return it
        // const existingCalendar = await prisma.floorCalendar.findUnique({
        //     where: { id: existing.id },
        // })

        return { calendar: existing, wasNew: false }
    }

    // create the calendar, then emit a CALENDAR_PUBLISHED event
    const created = await prisma.floorCalendar.create({
        data: {
            chamber,
            calendarType: calendarTypeEnum,
            calendarNumber,
            calendarDate: calendarDate ?? "",
            calendarName: calendarName ?? "",
            sourceUrl: agendaUrl,
            sessionYear,
            sessionCode,
            dataSource: {
                header,
            },
            scrapedAt: new Date(),
            committee: committee
                ? {
                      connect: { id: committee.id },
                  }
                : undefined,
        },
    })

    // Fire calendar-published alert/event only on *new* calendar
    await createCalendarPublishedEvent({
        chamber,
        floorCalendarId: created.id,
        committeeId: created.committeeId ?? null,
        header,
        agendaUrl,
    })

    return { calendar: created, wasNew: true }
}

async function createBillAddedToCalendarEvent(opts: {
    billId: number
    billNumber: string
    chamber: Chamber
    floorCalendarId: number | null
    committeeId: number | null
    header: ParsedHeader | null
    agendaUrl: string
}) {
    const { billId, billNumber, chamber, floorCalendarId, committeeId, header, agendaUrl } = opts

    const calendarTypeEnum = mapCalendarType(header?.calendarType ?? null)
    const calendarNumber = header?.calendarNumber ?? null
    const calendarName = header?.heading ?? null
    const calendarDateStr = header?.readingDate ?? header?.distributionDate ?? null
    const calendarDate = calendarDateStr ? new Date(calendarDateStr) : null

    // Avoid duplicate events for same bill + calendar
    const existingEvent = await prisma.billEvent.findFirst({
        where: {
            billId,
            eventType: BillEventType.BILL_ADDED_TO_CALENDAR,
            floorCalendarId: floorCalendarId ?? undefined,
            calendarType: calendarTypeEnum,
            calendarNumber,
        },
    })

    if (existingEvent) return

    const summary = `${billNumber} added to calendar ${calendarNumber ?? ''}${
        calendarName ? ` - ${calendarName}` : ''
    }`.trim()

    await prisma.billEvent.create({
        data: {
            billId,
            eventType: BillEventType.BILL_ADDED_TO_CALENDAR,
            chamber,
            floorCalendarId,
            committeeId,
            calendarType: calendarTypeEnum,
            calendarNumber,
            eventTime: calendarDate ?? new Date(),
            summary,
            payload: {
                calendarName,
                calendarType: header?.calendarType ?? null,
                calendarNumber,
                calendarDate: calendarDateStr,
                distributionDate: header?.distributionDate ?? null,
                readingDate: header?.readingDate ?? null,
                heading: header?.heading ?? null,
                agendaUrl,
            },
        },
    })
}

function deriveChamberFromUrl(url: string): Chamber | null {
    const lower = url.toLowerCase()

    if (lower.includes("/senate-")) return Chamber.SENATE
    if (lower.includes("/house-")) return Chamber.HOUSE

    return null
}


// --- the handler! --
export const GET = async ( request: Request ) => {
    // Either needs to be authorized via Clerk, or by the Auth header
    const { userId } = await auth()
    const hasClerkUser = !!userId
    const hasCronSecret = isValidCronSecret( request )

    if ( ! hasClerkUser && ! hasCronSecret ) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const daysAheadToScrape = await getScraperDays()


    const { searchParams } = new URL(request.url)
    const rawChamber = searchParams.get('chamber')

    let chamber: Chamber = 'SENATE' // default to senate

    if (rawChamber) {
        const normalized = rawChamber.toUpperCase()

        if (!isChamber(normalized)) {
            return NextResponse.json(
                { error: 'Invalid chamber parameter' },
                { status: 400 }
            )
        }

        chamber = normalized
    }

    // build the list of agenda URLs (today + next 3 days)
    const agendaUrls: string[] = []
    const baseDate = new Date()
    baseDate.setHours(0, 0, 0, 0)

    for ( let offset = 0; offset <= daysAheadToScrape; offset++ ) {
        const d = new Date(baseDate)
        d.setDate(baseDate.getDate() + offset)
        agendaUrls.push(buildAgendaUrl(chamber, d))
    }

    // log the scrape start
    const run = await startScrapeRun(`MGA_${chamber}_AGENDA`)

    let agendaCount = 1

    try {
        let totalAgendas = 0

        for (const agendaUrl of agendaUrls) {
            // Get the agenda items
            const scrapeResult = await scrapeAgendaUrl(agendaUrl)

            // No agenda for this day, continue
            if (scrapeResult.length === 0) {
                continue
            }

            totalAgendas += scrapeResult.length

            console.log(`>> ${chamber} Scrape Result`, { items: scrapeResult[0].items })

            // For each section + bill, find the Bill and create BILL_ADDED_TO_CALENDAR events
            for (const section of scrapeResult) {
                const header = section.header
                if (!header) continue

                // Get session year/code from reading/distribution date
                const dateStr = header.readingDate ?? header.distributionDate ?? null
                const dateObj = dateStr ? new Date(dateStr) : new Date()
                const sessionYear = dateObj.getFullYear()
                const sessionCode = `${sessionYear}RS`

                const result = await upsertFloorCalendar({
                    chamber,
                    header,
                    agendaUrl: agendaUrl,
                    sessionYear,
                    sessionCode,
                })

                if (!result) {
                    console.warn("Agenda scraper: upsertFloorCalendar returned null for header", header)
                    continue
                }

                const { calendar: floorCalendar, wasNew } = result

                if (!floorCalendar) {
                    console.warn("Agenda scraper: no floorCalendar returned for header", header)
                    continue
                }

                const committeeId = floorCalendar.committeeId ?? null

                const existingItems = await prisma.calendarItem.findMany({
                    where: { floorCalendarId: floorCalendar.id },
                    orderBy: { position: "asc" },
                    select: {
                        id: true,
                        position: true,
                        billId: true,
                        billNumber: true,
                    },
                })

                // Key: prefer billId (if set), fall back to billNumber.
                const existingByKey = new Map<string, (typeof existingItems)[number]>()
                for (const ci of existingItems) {
                    const key =
                        ci.billId != null ? `bill:${ci.billId}` : `num:${ci.billNumber.toUpperCase()}`
                    existingByKey.set(key, ci)
                }

                const touchedKeys = new Set<string>()
                const changes: Array<{
                    billNumber: string
                    changeType: "added" | "removed" | "moved"
                    oldPosition?: number | null
                    newPosition?: number | null
                }> = []

                // Process items from the scrape
                let position = 1

                for (const item of section.items) {
                    const billNumber = item.billNumber
                    const externalId = `${sessionCode}-${billNumber}`

                    const bill = await prisma.bill.findUnique({
                        where: { externalId },
                        select: { id: true, billNumber: true },
                    })

                    console.log("Processing items - bill", { externalId, bill })

                    // Either use the internal bill ID or the bill number for the key
                    const key =
                        bill?.id != null ? `bill:${bill.id}` : `num:${billNumber.toUpperCase()}`

                    const existing = existingByKey.get(key)
                    const oldPosition = existing?.position ?? null

                    // Mark this key as seen in the new scrape
                    touchedKeys.add(key)

                    const committeeId = (floorCalendar as any).committeeId ?? null

                    // Upsert the CalendarItem itself
                    await upsertCalendarItem({
                        floorCalendarId: floorCalendar.id,
                        position,
                        billNumber: bill?.billNumber ?? billNumber,
                        billId: bill?.id ?? null,
                        committeeId,
                        actionText: item.disposition ?? null,
                        notes: item.description ?? null,
                        rawItem: item,
                    })

                    if (!existing) {
                        changes.push({
                            billNumber: bill?.billNumber ?? billNumber,
                            changeType: "added",
                            oldPosition: null,
                            newPosition: position,
                        })

                        if (bill) {
                            await createBillAddedToCalendarEvent({
                                billId: bill.id,
                                billNumber: bill.billNumber,
                                chamber,
                                floorCalendarId: floorCalendar.id,
                                committeeId,
                                header,
                                agendaUrl: agendaUrl,
                            })
                        } else {
                            console.warn(
                                `Agenda scraper: could not find bill for externalId=${externalId} (billNumber=${billNumber})`
                            )
                        }
                    } else if (existing.position !== position) {
                        // the bill has changed positions in the calendar
                        changes.push({
                            billNumber: bill?.billNumber ?? billNumber,
                            changeType: "moved",
                            oldPosition,
                            newPosition: position,
                        })
                    }

                    position++
                }

                // Find any removed items
                const removedItems = existingItems.filter((ci) => {
                    const key =
                        ci.billId != null ? `bill:${ci.billId}` : `num:${ci.billNumber.toUpperCase()}`
                    return !touchedKeys.has(key)
                })

                // Track the changes here
                for (const ci of removedItems) {
                    changes.push({
                        billNumber: ci.billNumber,
                        changeType: "removed",
                        oldPosition: ci.position,
                        newPosition: null,
                    })

                    if (ci.billId != null) {
                        await createBillRemovedFromCalendarEvent({
                            billId: ci.billId,
                            billNumber: ci.billNumber,
                            chamber,
                            floorCalendarId: floorCalendar.id,
                            committeeId,
                            header,
                            agendaUrl: agendaUrl,
                        })
                    }

                    // Remove the CalendarItem row since it's no longer on the calendar
                    await prisma.calendarItem.delete({
                        where: { id: ci.id },
                    })
                }

                // If anything changed (add / move / remove) and its not a new calendar, fire CALENDAR_UPDATED
                if (changes.length > 0 && !wasNew) {
                    await createCalendarUpdatedEvent({
                        chamber,
                        floorCalendarId: floorCalendar.id,
                        committeeId,
                        header,
                        agendaUrl: agendaUrl,
                        changes,
                    })
                }

                agendaCount++
            }
        }

        // If none of the days had an agenda, return 0
        if (totalAgendas === 0) {
            await finishScrapeRun(run.id, {
                success: true,
                calendarsCount: 0,
            })

            return NextResponse.json({
                ok: true,
                agendas: 0,
            })
        }

        // Finished!
        await finishScrapeRun(run.id, {
            success: true,
            calendarsCount: totalAgendas,
        })

        return NextResponse.json({
            ok: true,
            agendas: totalAgendas,
        })
    } catch ( error ) {
        console.error( `${chamber} agenda scraper error`, error )

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