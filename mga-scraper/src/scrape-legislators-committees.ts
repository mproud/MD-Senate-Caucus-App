// Scrape legislators and committees from the website

import 'dotenv/config';
import axios from "axios";
import * as cheerio from "cheerio";
import { PrismaClient, Chamber } from "@prisma/client";
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { fetchHtml } from './shared/http';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
    adapter,
});

// ---- Base URL selection: live vs archive.org snapshot ----
const LIVE_MGA_BASE = "https://mgaleg.maryland.gov/mgawebsite";

const MGA_SOURCE = process.env.MGA_SOURCE ?? "live" // "live" or "archive"
const MGA_WAYBACK_BASE = process.env.MGA_WAYBACK_BASE

const MGA_BASE =
  MGA_SOURCE === "archive" && MGA_WAYBACK_BASE
    ? MGA_WAYBACK_BASE
    : LIVE_MGA_BASE

const USING_WAYBACK = MGA_SOURCE === "archive" && !!MGA_WAYBACK_BASE

const MEMBERS_INDEX_SENATE = `${MGA_BASE}/Members/Index/senate`
const MEMBERS_INDEX_HOUSE = `${MGA_BASE}/Members/Index/house`
const COMMITTEES_INDEX_SENATE = `${MGA_BASE}/Committees/Index/senate`
const COMMITTEES_INDEX_HOUSE = `${MGA_BASE}/Committees/Index/house`
const COMMITTEES_INDEX_OTHER = `${MGA_BASE}/Committees/Index/other`

// ---- Types for scraped data ----

type ParsedName = {
    firstName: string | null
    middleName: string | null
    lastName: string | null
    suffix: string | null
}

// Common generational suffixes used in names
const KNOWN_SUFFIXES = new Set([
    "Jr",
    "Jr.",
    "Sr",
    "Sr.",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
])

type ScrapedLegislator = {
    externalId: string      // e.g. "attar02"
    name: string            // full name as displayed ("Dalya Attar")
    chamber: Chamber        // SENATE | HOUSE
    district?: string
    county?: string
    party?: string
    email?: string
};

type ScrapedCommittee = {
    code: string            // e.g. "fin", "app", "eee"
    name: string
    chamber?: Chamber
    committeeType: string   // "STANDING", "OTHER", etc.
};

type ScrapedCommitteeMembership = {
    committeeCode: string       // "fin"
    legislatorExternalId: string
    role: string                // "CHAIR" | "VICE_CHAIR" | "MEMBER"
}

function normalizeSuffixToken(token: string): string {
    return token.replace(/\./g, "").toUpperCase()
}

function parseLegislatorName(fullName: string): ParsedName {
    let name = fullName.trim().replace(/\s+/g, " ")
    if (!name) {
        return { firstName: null, middleName: null, lastName: null, suffix: null }
    }

    let suffix: string | null = null

    // 1) Handle suffix if separated by a comma: "William C. Smith, Jr."
    const commaParts = name.split(",")
    if (commaParts.length > 1) {
        const possibleSuffixPart = commaParts.slice(1).join(",").trim() // anything after first comma
        if (possibleSuffixPart) {
            const suffixTokens = possibleSuffixPart.split(/\s+/)
            const firstToken = suffixTokens[0]
            const normalized = normalizeSuffixToken(firstToken)

            if (KNOWN_SUFFIXES.has(firstToken) || KNOWN_SUFFIXES.has(normalized)) {
                suffix = firstToken // keep as displayed
                name = commaParts[0].trim() // strip suffix from main name
            }
        }
    }

    // 2) Split remaining name into parts
    let parts = name.split(/\s+/)

    // 3) Handle suffix at the end without a comma: "William C. Smith Jr."
    if (!suffix && parts.length > 1) {
        const lastToken = parts[parts.length - 1]
        const normalizedLast = normalizeSuffixToken(lastToken)
        if (KNOWN_SUFFIXES.has(lastToken) || KNOWN_SUFFIXES.has(normalizedLast)) {
            suffix = lastToken
            parts = parts.slice(0, -1) // drop suffix from the name tokens
        }
    }

    // After stripping suffix, figure out first / middle / last
    if (parts.length === 0) {
        return { firstName: null, middleName: null, lastName: null, suffix }
    }

    if (parts.length === 1) {
        return {
            firstName: parts[0],
            middleName: null,
            lastName: null,
            suffix,
        }
    }

    if (parts.length === 2) {
        return {
            firstName: parts[0],
            middleName: null,
            lastName: parts[1],
            suffix,
        }
    }

    // 3+ tokens: "William C. Smith", "Mary-Dulany James", etc.
    //   - first token = firstName
    //   - last token = lastName
    //   - everything in the middle = middleName (can be multiple tokens)
    const firstName = parts[0]
    const lastName = parts[parts.length - 1]
    const middleTokens = parts.slice(1, -1)

    return {
        firstName,
        middleName: middleTokens.length ? middleTokens.join(" ") : null,
        lastName,
        suffix,
    }
}

// ---- Legislators scraping ----

// Get all member detail URLs for a chamber from the index page
async function scrapeMemberDetailLinks(indexUrl: string): Promise<string[]> {
    const $ = await fetchHtml(indexUrl);
    const links = new Set<string>();

    $("a[href*='/Members/Details/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        // 1) Already a full http(s) URL – just use it
        if (href.startsWith("http://") || href.startsWith("https://")) {
            links.add(href);
            return;
        }

        // 2) Wayback-style relative path: /web/TIMESTAMP/https://mgaleg...
        if (USING_WAYBACK && href.startsWith("/web/")) {
            links.add(`https://web.archive.org${href}`);
            return;
        }

        // 3) Normal relative path – resolve against MGA_BASE (live or snapshot base)
        const full = new URL(href, MGA_BASE).toString();
        links.add(full);
    });

    return Array.from(links);
}

// Scrape one legislator detail page
async function scrapeLegislatorDetail(
    url: string,
    chamber: Chamber
): Promise<ScrapedLegislator> {
    const $ = await fetchHtml(url);

    // URL ends with external ID, e.g. ".../Members/Details/attar02"
    const externalId = url.split("/").pop()!.split("?")[0];

    // Heading: "Senator Dalya Attar" or "Delegate X"
    const headingText = $("h2, h1")
        .filter((_, el) => $(el).text().includes("Senator") || $(el).text().includes("Delegate"))
        .first()
        .text()
        .trim();

    const name = headingText
        .replace("Senator", "")
        .replace("Delegate", "")
        .trim();

    const getLabelValue = (label: string): string | undefined => {
        const el = $("*")
            .filter((_, e) => $(e).text().trim() === label)
            .first();
        if (!el.length) return undefined;
        const val = el.next().text().trim();
        return val || undefined;
    };

    const district = getLabelValue("District");
    const county = getLabelValue("County");
    const party = getLabelValue("Party");

    // Email from mailto:
    let email: string | undefined;
    $("a[href^='mailto:']").each((_, el) => {
        const href = $(el).attr("href");
        if (href && href.startsWith("mailto:")) {
            // Drop any ?subject= etc
            email = href.replace("mailto:", "").split("?")[0].trim();
        }
    });

    return {
        externalId,
        name,
        chamber,
        district,
        county,
        party,
        email
    };
}

async function scrapeAllLegislators(): Promise<ScrapedLegislator[]> {
    const senateLinks = await scrapeMemberDetailLinks(MEMBERS_INDEX_SENATE);
    const houseLinks = await scrapeMemberDetailLinks(MEMBERS_INDEX_HOUSE);

    const results: ScrapedLegislator[] = [];

    // Keep it simple & polite: sequential requests for now
    for (const url of senateLinks) {
        const leg = await scrapeLegislatorDetail(url, "SENATE");
        results.push(leg);
    }
    for (const url of houseLinks) {
        const leg = await scrapeLegislatorDetail(url, "HOUSE");
        results.push(leg);
    }

    return results;
}

// ---- Committees scraping ----

async function scrapeCommitteesFromIndex(
    indexUrl: string,
    chamber: Chamber | undefined,
    committeeType: string
): Promise<ScrapedCommittee[]> {
    const $ = await fetchHtml(indexUrl);
    const committees: ScrapedCommittee[] = [];

    $("a[href*='Committees/Details']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const url = new URL(href, MGA_BASE);
        const code = url.searchParams.get("cmte");
        if (!code) return;

        const name = $(el).text().trim();
        if (!name) return;

        committees.push({
            code: code.toLowerCase(),
            name,
            chamber,
            committeeType,
        });
    });

    const deduped = Object.values(
        committees.reduce<Record<string, ScrapedCommittee>>((acc, c) => {
            acc[c.code] = c;
            return acc;
        }, {})
    );

    return deduped;
}

async function scrapeCommitteeMembership(
    committeeCode: string
): Promise<ScrapedCommitteeMembership[]> {
    const url = `${MGA_BASE}/Committees/Details?cmte=${committeeCode}`;
    const $ = await fetchHtml(url);

    const memberships: ScrapedCommitteeMembership[] = [];

    // Chair
    const chairLink = $("a")
        .filter((_, el) => $(el).prevAll().text().includes("Chair"))
        .first();
    if (chairLink.length) {
        const href = chairLink.attr("href");
        if (href) {
            const extId = href.split("/").pop()!.split("?")[0];
            memberships.push({
                committeeCode: committeeCode.toLowerCase(),
                legislatorExternalId: extId,
                role: "CHAIR",
            });
        }
    }

    // Vice Chair
    const viceLink = $("a")
        .filter((_, el) => $(el).prevAll().text().includes("Vice Chair"))
        .first();
    if (viceLink.length) {
        const href = viceLink.attr("href");
        if (href) {
            const extId = href.split("/").pop()!.split("?")[0];
            memberships.push({
                committeeCode: committeeCode.toLowerCase(),
                legislatorExternalId: extId,
                role: "VICE_CHAIR",
            });
        }
    }

    // Regular members:
    $("a[href*='/Members/Details/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const extId = href.split("/").pop()!.split("?")[0];

        const already = memberships.find(
            (m) =>
                m.legislatorExternalId === extId &&
                (m.role === "CHAIR" || m.role === "VICE_CHAIR")
        );
        if (already) return;

        const exists = memberships.find((m) => m.legislatorExternalId === extId);
        if (!exists) {
            memberships.push({
                committeeCode: committeeCode.toLowerCase(),
                legislatorExternalId: extId,
                role: "MEMBER",
            });
        }
    });

    return memberships;
}

async function scrapeAllCommitteesAndMemberships(): Promise<{
    committees: ScrapedCommittee[];
    memberships: ScrapedCommitteeMembership[];
}> {
    const committees: ScrapedCommittee[] = [];

    committees.push(
        ...(await scrapeCommitteesFromIndex(COMMITTEES_INDEX_SENATE, "SENATE", "STANDING"))
    );
    committees.push(
        ...(await scrapeCommitteesFromIndex(COMMITTEES_INDEX_HOUSE, "HOUSE", "STANDING"))
    );
    committees.push(
        ...(await scrapeCommitteesFromIndex(COMMITTEES_INDEX_OTHER, undefined, "OTHER"))
    );

    const dedupedCommittees = Object.values(
        committees.reduce<Record<string, ScrapedCommittee>>((acc, c) => {
            acc[c.code] = c;
            return acc;
        }, {})
    );

    const memberships: ScrapedCommitteeMembership[] = [];
    for (const c of dedupedCommittees) {
        const m = await scrapeCommitteeMembership(c.code);
        memberships.push(...m);
    }

    return { committees: dedupedCommittees, memberships };
}

// ---- Helpers for name handling ----

function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
    const trimmed = fullName.trim();
    if (!trimmed) return { firstName: null, lastName: null };

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: null };
    }

    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");
    return { firstName, lastName };
}

// ---- Persistence with Prisma ----

async function upsertLegislators(scraped: ScrapedLegislator[]) {
    for (const leg of scraped) {
        // Prisma schema: Legislator.fullName, firstName, lastName, party, district (required)
        const parsed = parseLegislatorName(leg.name)
        const district = leg.district ?? "UNKNOWN"
        const party = leg.party ?? "Unknown"

        const legislator = await prisma.legislator.upsert({
            where: { externalId: leg.externalId },
            update: {
                fullName: leg.name,
                firstName: parsed.firstName ?? undefined,
                middleName: parsed.middleName ?? undefined,
                lastName: parsed.lastName ?? undefined,
                suffix: parsed.suffix ?? undefined,
                party,
                district,
                isActive: true,
            },
            create: {
                externalId: leg.externalId,
                fullName: leg.name,
                firstName: parsed.firstName ?? undefined,
                middleName: parsed.middleName ?? undefined,
                lastName: parsed.lastName ?? undefined,
                suffix: parsed.suffix ?? undefined,
                party,
                district,
                isActive: true,
            },
        });

        // LegislatorTerm: chamber + district for current term
        const existingTerm = await prisma.legislatorTerm.findFirst({
            where: {
                legislatorId: legislator.id,
                chamber: leg.chamber,
                endDate: null,
            },
        });

        const termDataSource = {
            county: leg.county ?? null,
            email: leg.email ?? null,
        };

        if (existingTerm) {
            await prisma.legislatorTerm.update({
                where: { id: existingTerm.id },
                data: {
                    district: leg.district ?? existingTerm.district,
                    dataSource: {
                        ...(existingTerm.dataSource as any || {}),
                        ...termDataSource,
                    },
                },
            });
        } else {
            await prisma.legislatorTerm.create({
                data: {
                    legislatorId: legislator.id,
                    chamber: leg.chamber,
                    district: leg.district,
                    startDate: new Date(),
                    dataSource: termDataSource,
                },
            });
        }
    }
}

async function upsertCommittees(scraped: ScrapedCommittee[]) {
    for (const cmte of scraped) {
        const externalId = cmte.code.toLowerCase();
        const abbreviation = cmte.code.toUpperCase();

        await prisma.committee.upsert({
            where: { externalId },
            update: {
                externalId,
                name: cmte.name,
                chamber: cmte.chamber ?? null,
                abbreviation,
                committeeType: cmte.committeeType,
            },
            create: {
                externalId,
                name: cmte.name,
                chamber: cmte.chamber ?? null,
                abbreviation,
                committeeType: cmte.committeeType,
            },
        });
    }
}

async function upsertCommitteeMemberships(scraped: ScrapedCommitteeMembership[]) {
    const byCommittee: Record<string, ScrapedCommitteeMembership[]> = {};
    for (const m of scraped) {
        (byCommittee[m.committeeCode] ??= []).push(m);
    }

    for (const [committeeCode, memberships] of Object.entries(byCommittee)) {
        const externalId = committeeCode.toLowerCase();
        const committee = await prisma.committee.findUnique({
            where: { externalId },
        });
        if (!committee) continue;

        // Clear existing memberships for this committee
        await prisma.committeeMember.deleteMany({
            where: { committeeId: committee.id },
        });

        for (const m of memberships) {
            const legislator = await prisma.legislator.findUnique({
                where: { externalId: m.legislatorExternalId },
            });
            if (!legislator) {
                console.warn(
                    `No legislator found for externalId=${m.legislatorExternalId} (committee ${committeeCode})`
                );
                continue;
            }

            await prisma.committeeMember.create({
                data: {
                    committeeId: committee.id,
                    legislatorId: legislator.id,
                    role: m.role,
                },
            });
        }
    }
}

function getArchiveSnapshotIdentifier(waybackBase?: string | null): string | null {
    if (!waybackBase) return null;

    // Examples:
    // https://web.archive.org/web/20250328102415/https://mgaleg...
    const match = waybackBase.match(/\/web\/(\d{14})\//);
    if (match) return match[1]; // "20250328102415"

    // Fallback: store the whole string
    return waybackBase;
}

// ---- Lambda handler ----
export const handler = async () => {
    const kind = "MGA_LEGISLATOR_COMMITTEES";

    const source = USING_WAYBACK ? "ARCHIVE" : "LIVE";
    const archiveSnapshot = USING_WAYBACK
        ? getArchiveSnapshotIdentifier(MGA_WAYBACK_BASE)
        : null;

    // Create a run record as soon as we start
    const run = await prisma.scrapeRun.create({
        data: {
            kind,
            source,
            baseUrl: MGA_BASE,
            archiveSnapshot,
            metadata: {
                MGA_SOURCE,
                MGA_WAYBACK_BASE: MGA_WAYBACK_BASE ?? null,
            },
        },
    });

    let legislatorsCount = 0;
    let committeesCount = 0;
    let membershipsCount = 0;

    try {
        console.log("Scraping legislators...");
        const legislators = await scrapeAllLegislators();
        legislatorsCount = legislators.length;
        console.log(`Scraped ${legislatorsCount} legislators. Persisting...`);
        await upsertLegislators(legislators);

        console.log("Scraping committees & memberships...");
        const { committees, memberships } = await scrapeAllCommitteesAndMemberships();
        committeesCount = committees.length;
        membershipsCount = memberships.length;
        console.log(`Scraped ${committeesCount} committees, ${membershipsCount} memberships.`);
        await upsertCommittees(committees);
        await upsertCommitteeMemberships(memberships);

        await prisma.scrapeRun.update({
            where: { id: run.id },
            data: {
                success: true,
                finishedAt: new Date(),
                legislatorsCount,
                committeesCount,
                membershipsCount,
            },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: true,
                legislators: legislatorsCount,
                committees: committeesCount,
                memberships: membershipsCount,
            }),
        };
    } catch (err) {
        console.error("MGA scraper error", err);

        await prisma.scrapeRun.update({
            where: { id: run.id },
            data: {
                success: false,
                finishedAt: new Date(),
                legislatorsCount,
                committeesCount,
                membershipsCount,
                error: String(err),
            },
        });

        return {
            statusCode: 500,
            body: JSON.stringify({ ok: false, error: String(err) }),
        };
    } finally {
        await prisma.$disconnect();
    }
};

// For local debugging without Lambda runtime:
if (require.main === module) {
    handler()
        .then((res) => {
            console.log("Done:", res);
            process.exit(0);
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
