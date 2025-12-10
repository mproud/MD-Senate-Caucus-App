import 'dotenv/config'
import { CalendarType, Chamber, BillEventType } from '@prisma/client'
import * as cheerio from 'cheerio'
import { prisma } from './shared/prisma'
import { MGA_BASE } from './shared/mga-base'
import { fetchHtml } from './shared/http'
import { cleanText, parseDateString } from './shared/helpers'
import { startScrapeRun, finishScrapeRun } from './shared/logging'


// ---------- Types for parsed data ----------

type ParsedAgenda = {
    date: Date
    legislativeDay?: number
    sections: ParsedSection[]
}

type ParsedSection = {
    label: string
    calendarType: CalendarType
    calendarNumber?: number | null
    committeeName?: string
    items: ParsedItem[]
}

type ParsedItem = {
    billNumber: string                 // "SB0186"
    actionText?: string                // "Favorable with Amendments(2)"
    sponsorText?: string               // Senator X/The Carroll County Delegation/The President (Request of admin) etc
    synopsis?: string
    notes?: string                     // title/extra description
}

// ---------- Helpers ----------

function parseAgendaDate(raw: string): Date | null {
    // "Senate Agenda for March 13, 2025"
    const match = raw.match(/for\s+(.+)$/i)
    if (!match) return null
    const dateStr = match[1].trim()
    const d = new Date(dateStr)
    return Number.isNaN(d.getTime()) ? null : d
}

function parseLegislativeDay($: cheerio.CheerioAPI): number | undefined {
    // e.g. "65th Day of Session"
    const bodyText = $('body').text()
    const m = bodyText.match(/(\d+)(st|nd|rd|th)\s+Day of Session/i)
    if (!m) return undefined
    return parseInt(m[1], 10)
}

function extractDateAndLegislativeDay(text: string): {
    date: Date | null
    legislativeDay?: number | null
} {
    const lines = text
        .split(/\r?\n/)
        .map((l) => cleanText(l))
        .filter(Boolean)

    let date: Date | null = null
    let legislativeDay: number | null | undefined = null

    for (const line of lines) {
        // Special Orders: first line is "March 13, 2025"
        if (!date) {
            const maybeDate = parseDateString(line)
            if (maybeDate) {
                date = maybeDate
                continue
            }
        }

        // "65th Day of Session"
        const dayMatch = line.match(/(\d+)(?:st|nd|rd|th)\s+Day of Session/i)
        if (dayMatch) {
            legislativeDay = parseInt(dayMatch[1], 10)
        }

        // Committee/Third reading headers: "Distribution Date: March 13, 2025"
        const distMatch = line.match(/Distribution Date:\s*(.+)$/i)
        if (distMatch && !date) {
            const d = parseDateString(distMatch[1])
            if (d) date = d
        }

        // Or "Second Reading Date:" / "Third Reading Date:"
        const secondMatch = line.match(/Second Reading Date:\s*(.+)$/i)
        if (secondMatch && !date) {
            const d = parseDateString(secondMatch[1])
            if (d) date = d
        }
        const thirdMatch = line.match(/Third Reading Date:\s*(.+)$/i)
        if (thirdMatch && !date) {
            const d = parseDateString(thirdMatch[1])
            if (d) date = d
        }
    }

    return { date, legislativeDay }
}

function parseSectionHeader(text: string): {
    label: string
    calendarType: CalendarType
    calendarNumber?: number | null
} {
    const trimmed = text.trim()

    // @TODO handle consent calendars - there are consent calendars for committee reports/second reading AND third reading
    // example - https://web.archive.org/web/20250327131337/https://mgaleg.maryland.gov/mgawebsite/FloorActions/Agenda/senate-03272025-1#CommitteeReport14b&t

    // Special Order Calendar No. 32
    let m = trimmed.match(/Special Order Calendar No\.\s*(\d+)/i)
    if (m) {
        return {
            label: trimmed,
            calendarType: 'SPECIAL_ORDER',
            calendarNumber: parseInt(m[1], 10),
        }
    }

    // Senate Third Reading Calendar No. 37 (General Senate Bills)
    m = trimmed.match(/Third Reading Calendar No\.\s*(\d+)/i)
    if (m) {
        return {
            label: trimmed,
            calendarType: 'THIRD_READING',
            calendarNumber: parseInt(m[1], 10),
        }
    }

    // Committee Report No. 15, 16, etc. -> treat as SECOND_READING
    m = trimmed.match(/Committee Report No\.\s*(\d+)/i)
    if (m) {
        return {
            label: trimmed,
            calendarType: 'SECOND_READING',
            calendarNumber: parseInt(m[1], 10),
        }
    }

    // Fallback: mark as OTHER
    return {
        label: trimmed,
        calendarType: 'OTHER',
        calendarNumber: null,
    }
}

function isBillNumber(text: string): boolean {
    // "SB0186", "HB0123", maybe "SJ001" etc
    return /^[A-Z]{2}\d{3,4}$/i.test(text.trim())
}

function cleanWhitespace(s: string): string {
    return s.replace(/\s+/g, ' ').trim()
}

// Extract one bill entry from an <a> anchor inside a section
function parseBillLine($: cheerio.CheerioAPI, a: cheerio.Element): ParsedItem {
    const billNumber = $(a).text().trim()

    const parent = $(a).parent()
    const lineText = cleanWhitespace(parent.text())

    // strip bill number from the line
    let rest = lineText.replace(billNumber, '').trim()

    // text before double space / "    Senator" / "    Chair" etc.
    let actionText: string | undefined

    // Look for two or more spaces separating action from sponsor
    const doubleSpaceMatch = rest.match(/\s{2,}/)
    if (doubleSpaceMatch && doubleSpaceMatch.index !== undefined) {
        actionText = rest.slice(0, doubleSpaceMatch.index).trim()
    } else {
        // fallback: split before " Senator", " Delegation", or " Chair"
        const splitMatch = rest.match(
            /\s+(Senator|Delegation|Chair,|Chair)\b/,
        )
        if (splitMatch && splitMatch.index !== undefined) {
            actionText = rest.slice(0, splitMatch.index).trim()
        } else {
            actionText = rest.trim()
        }
    }

    // Notes/title are often in the next <p> sibling
    const next = parent.next()
    const notesRaw = cleanWhitespace(next.text() || '')
    const notes = notesRaw.length ? notesRaw : undefined

    return {
        billNumber,
        actionText: actionText || undefined,
        notes,
    }
}

// --- V2 of the parser -- might as well parse the House agenda too since it's the same format
async function parseAgendaSectionsFromHTML( url: string ): Promise<ParsedSection[]> {
    const $ = await fetchHtml( url )
    const html = $.html() // not sure if we need this, but just in case...
    const sections: ParsedSection[] = []

    const tables = $('table')

    $('table').each(( _, el ) => {
        const $table = $(el)

        const headerText = $table.find('thead th').text().replace(/\s+/g, ' ').trim()

        // Bail if there's no header. There are a couple of random tables that aren't anything worth parsing
        if ( ! headerText ) return

        // This function might need to return the dates too?
        const parsedHeader = parseSectionHeader( headerText )
        const parsedHeaderDates = extractDateAndLegislativeDay( headerText ) // this isn't as reliable from the archive??

        // Grab the bills in the agenda. There are random notes in there too, so go line-by-line
        


        console.log(">>> Extracted", { headerText, parsedHeader, parsedHeaderDates })
    })

    // @HERE
    return sections
}

// ---------- Core parser: from HTML -> ParsedAgenda ----------
async function parseSenateAgenda(url: string): Promise<ParsedAgenda> {
    const $ = await fetchHtml(url)
    
    /*
    const sections: ParsedSection[] = [];

    // Each agenda item is a Table
    const agendaTables = $('table')

    $('table').each((_, el) => {
        const $table = $(el)

        // Header text lives in the thead/th
        const headerText = $table.find('thead th').text().replace(/\s+/g, ' ').trim()

        console.log('>>> Table header', { headerText })

    }) // -- end looping through tables


    return sections*/



    // Top heading: "Senate Agenda for March 13, 2025"
    const agendaHeaderEl = $('h1,h2,h3,h4,h5,h6')
        .filter((_, el) => $(el).text().includes('Senate Agenda for'))
        .first()

    let date: Date | null = null
    
    if (agendaHeaderEl.length) {
        date = parseAgendaDate(agendaHeaderEl.text())
    }

    if (!date) {
        // fallback: just today
        date = new Date()
    }

    const legislativeDay = parseLegislativeDay($)

    const sections: ParsedSection[] = []

    // Treat each committee report / special order / calendar heading as a section
    const sectionSelector = 'h3,h4,h5,h6'
    $(sectionSelector)
        .filter((_, el) => {
            const t = $(el).text()
            return (
                /Committee Report No\./i.test(t) ||
                /Special Order Calendar/i.test(t) ||
                /Second Reading Calendar/i.test(t) ||
                /Third Reading Calendar/i.test(t)
            )
        })
        .each((_, el) => {
            const headerText = $(el).text()
            const headerParsed = parseSectionHeader(headerText)

            console.log('Header parsed', { headerParsed })

            // Everything until the next section heading belongs to this section
            const content = $(el).nextUntil(sectionSelector)

            const items: ParsedItem[] = []

            // Each bill number is an <a> with SBxxxx etc
            content
                .find('a')
                .filter((_, a) => isBillNumber($(a).text()))
                .each((__, a) => {
                    const item = parseBillLine($, a)
                    items.push(item)
                })

            if (items.length === 0) return

            sections.push({
                label: headerParsed.label,
                calendarType: headerParsed.calendarType,
                calendarNumber: headerParsed.calendarNumber,
                items,
            })
        })

    console.log('Scraper data', {
        date,
        legislativeDay,
        sections,
    })

    return {
        date,
        legislativeDay,
        sections,
    }
}

// ---------- Persistence: ParsedAgenda -> FloorCalendar + CalendarItem + BillEvent ----------

async function upsertFloorCalendarForSection(
    url: string,
    chamber: Chamber,
    agenda: ParsedAgenda,
    section: ParsedSection,
    sectionIndex: number,
) {
    const sessionYear = agenda.date.getFullYear()
    const sessionCode = `${sessionYear}RS`

    const proceedingsNumber = sectionIndex + 1 // rough, but stable per agenda
    const calendarNumber = section.calendarNumber ?? null

    const floorCalendar = await prisma.floorCalendar.upsert({
        where: {
            // Composite unique in your schema:
            sessionYear_chamber_proceedingsNumber_calendarType_calendarNumber: {
                sessionYear,
                chamber,
                proceedingsNumber,
                calendarType: section.calendarType,
                calendarNumber,
            },
        },
        update: {
            label: section.label,
            calendarDate: agenda.date,
            legislativeDay: agenda.legislativeDay ?? null,
            sourceUrl: url,
            scrapedAt: new Date(),
        },
        create: {
            sessionYear,
            sessionCode,
            chamber,
            proceedingsNumber,
            calendarType: section.calendarType,
            calendarNumber,
            label: section.label,
            calendarDate: agenda.date,
            legislativeDay: agenda.legislativeDay ?? null,
            sourceUrl: url,
            scrapedAt: new Date(),
        },
    })

    return floorCalendar
}

async function upsertCalendarItemsAndEvents(
    floorCalendarId: number,
    chamber: Chamber,
    agenda: ParsedAgenda,
    section: ParsedSection,
) {
    // Load existing items once so we can diff
    const existingItems = await prisma.calendarItem.findMany({
        where: { floorCalendarId },
        include: { bill: true },
    })

    // Map billNumber -> item.id for quick "already had" checks
    const existingByBillNumber = new Map<string, number>()
    for (const ci of existingItems) {
        const existingBillNumber = ci.bill?.billNumber || ci.billNumber
        if (!existingBillNumber) continue
        existingByBillNumber.set(existingBillNumber, ci.id)
    }

    // We'll build the new set of billNumbers so we can detect removals afterwards
    const newBillNumbers = new Set<string>()

    let position = 0

    for (const item of section.items) {
        position++

        const billNumber = item.billNumber
        newBillNumbers.add(billNumber)

        const sessionYear = agenda.date.getFullYear()

        // Try to resolve the bill in our DB
        const bill = await prisma.bill.findFirst({
            where: {
                billNumber,
                sessionYear,
            },
        })

        const billId = bill ? bill.id : null

        // No committee resolution yet you could later parse "Judicial Proceedings" etc
        const committeeId = null

        // Upsert CalendarItem on (floorCalendarId, position)
        const calendarItem = await prisma.calendarItem.upsert({
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
                actionText: item.actionText ?? null,
                notes: item.notes ?? null,
                dataSource: {
                    parsedFrom: 'MGA_SCRAPE',
                },
            },
            create: {
                floorCalendarId,
                position,
                billNumber,
                billId,
                committeeId,
                actionText: item.actionText ?? null,
                notes: item.notes ?? null,
                dataSource: {
                    parsedFrom: 'MGA_SCRAPE',
                },
            },
        })

        // Emit BILL_ADDED_TO_CALENDAR only if this bill wasn't previously on this calendar
        const alreadyHadItem = existingByBillNumber.has(billNumber)

        if (billId && !alreadyHadItem) {
            await prisma.billEvent.create({
                data: {
                    billId,
                    eventType: 'BILL_ADDED_TO_CALENDAR',
                    eventTime: new Date(),
                    chamber,
                    floorCalendarId,
                    calendarType: section.calendarType,
                    calendarNumber: section.calendarNumber ?? null,
                    summary: `${billNumber} added to ${section.label}`,
                    payload: {
                        floorCalendarId,
                        billNumber,
                        actionText: item.actionText ?? null,
                        notes: item.notes ?? null,
                    },
                },
            })
        }
    }

    // -------- Detect removals and emit BILL_REMOVED_FROM_CALENDAR --------

    const removedBillNumbers = new Set<string>()

    for (const ci of existingItems) {
        const existingBillNumber = ci.bill?.billNumber || ci.billNumber
        if (!existingBillNumber) continue

        if (!newBillNumbers.has(existingBillNumber)) {
            removedBillNumbers.add(existingBillNumber)

            if (ci.billId) {
                await prisma.billEvent.create({
                    data: {
                        billId: ci.billId,
                        eventType: 'BILL_REMOVED_FROM_CALENDAR',
                        eventTime: new Date(),
                        chamber,
                        floorCalendarId,
                        calendarType: section.calendarType,
                        calendarNumber: section.calendarNumber ?? null,
                        summary: `${existingBillNumber} removed from ${section.label}`,
                        payload: {
                            floorCalendarId,
                            billNumber: existingBillNumber,
                        },
                    },
                })
            }
        }
    }

    // Delete stale CalendarItems that no longer exist in the new agenda
    if (removedBillNumbers.size > 0) {
        await prisma.calendarItem.deleteMany({
            where: {
                floorCalendarId,
                billNumber: { in: Array.from(removedBillNumbers) },
            },
        })
    }

    // (Optional) If you want to also delete items beyond the new length,
    // e.g. old positions > current `position` count:
    await prisma.calendarItem.deleteMany({
        where: {
            floorCalendarId,
            position: { gt: position },
        },
    })
}


// ---------- Scrape the Senate agenda URL ----------

// Example URL (live or archive): `${MGA_BASE}/FloorActions/Agenda/senate-03132025-1`
async function scrapeSenateAgendaUrl(url: string) {
    const run = await startScrapeRun('MGA_SENATE_AGENDA')

    try {
        console.log('Parsing Senate agenda:', url)
        const agenda = await parseSenateAgenda(url)
        const agendav2 = await parseAgendaSectionsFromHTML(url)

        console.log('>>>> Agenda v2', agendav2)

        let calendarsCount = 0
        for (let i = 0; i < agenda.sections.length; i++) {
            const section = agenda.sections[i]

            const floorCalendar = await upsertFloorCalendarForSection(
                url,
                'SENATE',
                agenda,
                section,
                i,
            )

            await upsertCalendarItemsAndEvents(
                floorCalendar.id,
                'SENATE',
                agenda,
                section,
            )

            calendarsCount++
        }

        await finishScrapeRun(run.id, {
            success: true,
            calendarsCount,
        })

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: true,
                calendars: calendarsCount,
            }),
        }
    } catch (err) {
        console.error('Senate agenda scraper error', err)
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


export const handler = async ( event: any, context: Context ) => {
    // Allow overriding the URL via event, otherwise use a default
    const urlFromEvent = event?.url as string | undefined;

    const url =
        urlFromEvent ??
        `${MGA_BASE}/FloorActions/Agenda/senate-03132025-1` // this was from the example

    return scrapeSenateAgendaUrl(url)
}