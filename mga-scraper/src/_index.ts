// ./mga-scraper/src/index.ts
import axios from "axios";
import * as cheerio from "cheerio";
import { PrismaClient, Chamber, CommitteeKind, CommitteeRole } from "@prisma/client";

const prisma = new PrismaClient();

// Base URLs
const MGA_BASE = "https://mgaleg.maryland.gov/mgawebsite";
const MEMBERS_INDEX_SENATE = `${MGA_BASE}/Members/Index/senate`;
const MEMBERS_INDEX_HOUSE = `${MGA_BASE}/Members/Index/house`;
const COMMITTEES_INDEX_SENATE = `${MGA_BASE}/Committees/Index/senate`;
const COMMITTEES_INDEX_HOUSE = `${MGA_BASE}/Committees/Index/house`;
const COMMITTEES_INDEX_OTHER = `${MGA_BASE}/Committees/Index/other`;

// ---- Types for scraped data (in-memory only) ----

type ScrapedLegislator = {
    externalId: string;                 // e.g. "attar02"
    name: string;
    chamber: Chamber;
    district?: string;
    county?: string;
    party?: string;
    email?: string;
};

type ScrapedCommittee = {
    code: string;                             // e.g. "fin", "app", "eee"
    name: string;
    chamber?: Chamber;
    kind: CommitteeKind;
};

type ScrapedCommitteeMembership = {
    committeeCode: string;            // "fin"
    legislatorExternalId: string;
    role: CommitteeRole;                // CHAIR | VICE_CHAIR | MEMBER
};

// ---- HTTP helper ----

async function fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
    const res = await axios.get(url, {
        headers: {
            "User-Agent": "MarylandLegTrackerBot/1.0 (contact: your-email@example.com)"
        }
    });
    return cheerio.load(res.data);
}

// ---- Legislators scraping ----

// Get all member detail URLs for a chamber from the index page
async function scrapeMemberDetailLinks(indexUrl: string): Promise<string[]> {
    const $ = await fetchHtml(indexUrl);

    // Strategy: find all anchors that link to /Members/Details/xxx
    const links = new Set<string>();

    $("a[href*='/Members/Details/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        // Normalize to full URL
        if (href.startsWith("http")) {
            links.add(href);
        } else {
            links.add(new URL(href, MGA_BASE).toString());
        }
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

    // Heading: "## Senator Dalya Attar" or "## Delegate X"
    const headingText = $("h2, h1")
        .filter((_, el) => $(el).text().includes("Senator") || $(el).text().includes("Delegate"))
        .first()
        .text()
        .trim();

    const name = headingText
        .replace("Senator", "")
        .replace("Delegate", "")
        .trim();

    // These fields are laid out as label/value pairs. On the current site it’s effectively:
    // "District" then a line with the number,
    // "County" then a line with the county name,
    // "Party" then a line with "Democrat" / "Republican" etc.
    // Using a simple text search + next siblings.
    const getLabelValue = (label: string): string | undefined => {
        const el = $("*")
            .filter((_, e) => $(e).text().trim() === label)
            .first();
        if (!el.length) return undefined;
        // Next element/sibling contains the value
        const val = el.next().text().trim();
        return val || undefined;
    };

    const district = getLabelValue("District");
    const county = getLabelValue("County");
    const party = getLabelValue("Party");

    // Email is under "Contact" or "Annapolis Info"; there’s a mailto: link.
    let email: string | undefined;
    $("a[href^='mailto:']").each((_, el) => {
        const href = $(el).attr("href");
        if (href && href.startsWith("mailto:")) {
            email = href.replace("mailto:", "").trim();
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

    // Keep it simple & polite: sequential requests
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

// Committees index pages list committee names with links to details?cmte=foo
async function scrapeCommitteesFromIndex(
    indexUrl: string,
    chamber: Chamber | undefined,
    kind: CommitteeKind
): Promise<ScrapedCommittee[]> {
    const $ = await fetchHtml(indexUrl);
    const committees: ScrapedCommittee[] = [];

    // Look for all links to Committees/Details?cmte=...
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
            kind
        });
    });

    // Some entries appear twice (top table + bottom "Committee" list) – dedupe by code.
    const deduped = Object.values(
        committees.reduce<Record<string, ScrapedCommittee>>((acc, c) => {
            acc[c.code] = c;
            return acc;
        }, {})
    );

    return deduped;
}

// For membership we’ll use the committee details pages:
// /Committees/Details?cmte=fin (also has tab=Membership but default main page already lists members).
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
                role: "CHAIR"
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
                role: "VICE_CHAIR"
            });
        }
    }

    // Regular members:
    // Below the "Chair / Vice Chair" section you see repeating blocks:
    // [link Name] "District X" "Some County" "Democrat"
    // All of those anchor tags in that membership area go to Members/Details/xxx.
    $("a[href*='/Members/Details/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const extId = href.split("/").pop()!.split("?")[0];

        // Avoid duplicating chair/vice entries; if already present, skip.
        const already = memberships.find(
            (m) =>
                m.legislatorExternalId === extId &&
                (m.role === "CHAIR" || m.role === "VICE_CHAIR")
        );
        if (already) return;

        // If this legislator isn't already in list at all, add as MEMBER
        const exists = memberships.find((m) => m.legislatorExternalId === extId);
        if (!exists) {
            memberships.push({
                committeeCode: committeeCode.toLowerCase(),
                legislatorExternalId: extId,
                role: "MEMBER"
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
    // “Other” includes joint committees, caucuses, etc.
    committees.push(
        ...(await scrapeCommitteesFromIndex(COMMITTEES_INDEX_OTHER, undefined, "OTHER"))
    );

    // Dedupe committees by code
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

// ---- Persistence with Prisma ----

async function upsertLegislators(scraped: ScrapedLegislator[]) {
    for (const leg of scraped) {
        await prisma.legislator.upsert({
            where: { externalId: leg.externalId },
            update: {
                name: leg.name,
                chamber: leg.chamber,
                district: leg.district,
                county: leg.county,
                party: leg.party,
                email: leg.email
            },
            create: {
                externalId: leg.externalId,
                name: leg.name,
                chamber: leg.chamber,
                district: leg.district,
                county: leg.county,
                party: leg.party,
                email: leg.email
            }
        });
    }
}

async function upsertCommittees(scraped: ScrapedCommittee[]) {
    for (const cmte of scraped) {
        await prisma.committee.upsert({
            where: { code: cmte.code },
            update: {
                name: cmte.name,
                chamber: cmte.chamber ?? null,
                kind: cmte.kind
            },
            create: {
                code: cmte.code,
                name: cmte.name,
                chamber: cmte.chamber ?? null,
                kind: cmte.kind
            }
        });
    }
}

async function upsertCommitteeMemberships(scraped: ScrapedCommitteeMembership[]) {
    // To prevent stale memberships, simplest is:
    // - For each committee, delete existing memberships and recreate them.
    const byCommittee: Record<string, ScrapedCommitteeMembership[]> = {};
    for (const m of scraped) {
        (byCommittee[m.committeeCode] ??= []).push(m);
    }

    for (const [committeeCode, memberships] of Object.entries(byCommittee)) {
        const committee = await prisma.committee.findUnique({
            where: { code: committeeCode }
        });
        if (!committee) continue;

        // Clear existing memberships for this committee
        await prisma.committeeMembership.deleteMany({
            where: { committeeId: committee.id }
        });

        for (const m of memberships) {
            const legislator = await prisma.legislator.findUnique({
                where: { externalId: m.legislatorExternalId }
            });
            if (!legislator) {
                // You might want to log this mismatch
                console.warn(
                    `No legislator found for externalId=${m.legislatorExternalId} (committee ${committeeCode})`
                );
                continue;
            }

            await prisma.committeeMembership.create({
                data: {
                    committeeId: committee.id,
                    legislatorId: legislator.id,
                    role: m.role
                }
            });
        }
    }
}

// ---- Lambda handler ----

export const handler = async () => {
    try {
        console.log("Scraping legislators…");
        const legislators = await scrapeAllLegislators();
        console.log(`Scraped ${legislators.length} legislators. Persisting…`);
        await upsertLegislators(legislators);

        console.log("Scraping committees & memberships…");
        const { committees, memberships } = await scrapeAllCommitteesAndMemberships();
        console.log(`Scraped ${committees.length} committees, ${memberships.length} memberships.`);
        await upsertCommittees(committees);
        await upsertCommitteeMemberships(memberships);

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: true,
                legislators: legislators.length,
                committees: committees.length,
                memberships: memberships.length
            })
        };
    } catch (err) {
        console.error("MGA scraper error", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ ok: false, error: String(err) })
        };
    } finally {
        await prisma.$disconnect();
    }
};

// For local debugging without Lambda runtime:
if (require.main === module) {
    handler()
        .then((res) => {
            console.log('Done:', res);
            process.exit(0);
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}