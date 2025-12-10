// Scrape today's agenda from the MGA site
// v2 (v1 got messy)

import * as cheerio from 'cheerio'
import { MGA_BASE } from "./shared/mga-base"
import { fetchHtml } from './shared/http'
import { normalizeDate } from './shared/helpers'
import { finishScrapeRun, startScrapeRun } from './shared/logging'

// temporary -- this is the lambda context
interface Context {}

interface ParsedHeader {
    calendarType: string // This should be a structured calendar, but leave it a string for now
    calendarNumber?: number | null
    consentCalendar: number | boolean | null // this is the consent calendar if it is one
    distributionDate?: string | null // this should be formatted as a date
    readingDate?: string | null // this should be formatted as a date
    heading?: string | null // the original heading
    headerId?: string | null // the ID from the agenda table
}

interface ParsedAgendaItem {
    headerId: string | null          // table / header anchor id (e.g. CommitteeReport20fin)
    billNumber: string               // e.g. SB0215
    billUrl: string | null           // absolute or relative URL
    disposition: string | null       // e.g. Favorable with Amendments(2)
    sponsor: string | null           // e.g. Chair, Finance Committee
    description: string | null       // bill title text
    status: string | null            // e.g. FAVORABLE (from the bold/underlined row)
}

interface ParsedSection {

}

// Parse the header for things like Second Reading, Third Reading, Consent Calendar, Special Order Calendar, etc
// some bills can be second reading x consent y
// @TODO handle laid over bills, etc (what others??)
function parseAgendaHeader( header: string, headerId: string | null ): ParsedHeader | null {
    const primaryPatterns = [
        { type: 'committee_report', regex: /Committee Report No\.\s*(\d+)/i },
        { type: 'third_reading_calendar', regex: /Third Reading Calendar No\.\s*(\d+)/i },
        { type: 'special_order_calendar', regex: /Special Order Calendar No\.\s*(\d+)/i },
    ]

    const consentRegex = /Consent(?: Calendar)? No\.\s*(\d+)/i

    const heading = header.replace(/\s+/g, ' ').trim()

    // Extract dates
    const distributionMatch = heading.match(/Distribution Date:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i)
    const readingMatch = heading.match(/(First|Second|Third|Fourth|Fifth)?\s*Reading Date:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i)

    const distributionDate = normalizeDate(distributionMatch?.[1])
    const readingDate = normalizeDate(readingMatch?.[2])

    // Extract consent calendar number
    const consentMatch = heading.match(consentRegex)
    const consentCalendar = consentMatch ? parseInt(consentMatch[1], 10) : false

    // Find primary calendar
    for (const { type, regex } of primaryPatterns) {
        const match = heading.match(regex)
        if (match) {
            return {
                calendarType: type,
                calendarNumber: parseInt(match[1], 10),
                consentCalendar,
                distributionDate,
                readingDate,
                heading,
                headerId,
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
            heading,
            headerId,
        }
    }

    return null
}

async function scrapeAgendaUrl( url: string ) {
    // @TODO handle any errors! (log them!)
    const $ = await fetchHtml( url )
    const html = $.html() // not sure if we need this, but just in case...

    const sections: ParsedSection[] = []

    $('table').each(( _, el ) => {
        const $table = $(el)

        const headerText = $table.find('thead th').text().replace(/\s+/g, ' ').trim()

        // Bail on tables without a header
        if ( ! headerText ) return

        // Get the ID from the agenda table
        const headerId = $table.find('thead a[id]').attr('id') || null

        const parsedHeader = parseAgendaHeader( headerText, headerId )

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

            // Some of these may not be needed since technically we only need to know that the bills are on the agenda, teh rest we already ahve
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
            headerId,
            header: parsedHeader,
            items,
        })
    })

    return sections
}

export const handler = async ( event: any, context: Context ) => {
    // Allow overriding the URL via event, otherwise use a default
    const urlFromEvent = event?.url as string | undefined

    // @TODO override this temporarily, but when called, need to grab the latest agenda URL (house + senate!)
    const url =
        urlFromEvent ??
        `${MGA_BASE}/FloorActions/Agenda/senate-03272025-1`

    const chamber = 'SENATE' // for now

    // log the scrape start
    const run = await startScrapeRun(`MGA_${chamber}_AGENDA`)

    try {
        // Get the agenda items
        const scrapeResult = await scrapeAgendaUrl( url )

        // add the items to the database, fire off any alerts or other things to happen
        

        // Finished!
        await finishScrapeRun(run.id, {
            success: true,
            calendarsCount: scrapeResult.length,
        })

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: true,
                agendas: scrapeResult.length,
            }),
        }
    } catch ( error ) {
        console.error( `${chamber} agenda scraper error`, error )

        await finishScrapeRun(run.id, {
            success: false,
            error,
        })

        return {
            statusCode: 500,
            body: JSON.stringify({ ok: false, error: String( error ) }),
        }
    } finally {
        // await prisma.$disconnect()
    }
}