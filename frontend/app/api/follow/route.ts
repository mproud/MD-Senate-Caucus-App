import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"

// ---------- helpers ----------
async function getUserId() {
    const { userId } = await auth()
    return userId ?? null
}

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status })
}

const AlertTypeSchema = z.enum([
    "BILL_STATUS",
    "CALENDAR",
    "COMMITTEE_ACTION",
    "HEARING",
    "CUSTOM",
])

const AlertDeliveryChannelSchema = z.enum(["EMAIL", "SMS", "WEBHOOK", "PUSH"])

const ChamberSchema = z.enum(["SENATE", "HOUSE", "JOINT"])

const CalendarTypeSchema = z.enum([
    "SECOND_READING",
    "THIRD_READING",
    "CONSENT",
    "LAID_OVER",
    "COMMITTEE",
    "COMMITTEE_REPORT",
    "SPECIAL_ORDER",
    "OTHER",
])

const BillEventTypeSchema = z.enum([
    "BILL_INTRODUCED",
    "BILL_STATUS_CHANGED",
    "BILL_NEW_ACTION",
    "BILL_ADDED_TO_CALENDAR",
    "BILL_REMOVED_FROM_CALENDAR",
    "COMMITTEE_REFERRAL",
    "COMMITTEE_VOTE_RECORDED",
    "HEARING_SCHEDULED",
    "HEARING_CHANGED",
    "HEARING_CANCELED",
    "CALENDAR_PUBLISHED",
    "CALENDAR_UPDATED",
])

const CreateAlertBodySchema = z.object({
    alertType: AlertTypeSchema,
    target: z.string().min(1),

    // optional filters (match your schema)
    billId: z.number().int().positive().optional(),
    legislatorId: z.number().int().positive().optional(),
    committeeId: z.number().int().positive().optional(),
    delegationId: z.number().int().positive().optional(),
    chamber: ChamberSchema.optional(),
    calendarType: CalendarTypeSchema.optional(),

    eventTypeFilter: BillEventTypeSchema.optional(),

    deliveryChannel: AlertDeliveryChannelSchema.optional().default("EMAIL"),
    statusThreshold: z.string().optional(),
    includeHistory: z.boolean().optional().default(false),
    active: z.boolean().optional().default(true),
    metadata: z.unknown().optional(),
})

/**
 * Used for DELETE and GET(status) so caller can identify an alert either by:
 *    - id, OR
 *    - the "natural key" (userId + alertType + the optional filter fields + deliveryChannel + target)
 */
const IdentifyAlertSchema = z.object({
    id: z.number().int().positive().optional(),

    alertType: AlertTypeSchema.optional(),
    target: z.string().min(1).optional(),
    deliveryChannel: AlertDeliveryChannelSchema.optional(),

    billId: z.number().int().positive().optional(),
    legislatorId: z.number().int().positive().optional(),
    committeeId: z.number().int().positive().optional(),
    delegationId: z.number().int().positive().optional(),
    chamber: ChamberSchema.optional(),
    calendarType: CalendarTypeSchema.optional(),
    eventTypeFilter: BillEventTypeSchema.optional(),
})

// Build a Prisma where clause that matches “the same alert” for a user
function buildNaturalWhere(userId: string, q: z.infer<typeof IdentifyAlertSchema>) {
    const where: Prisma.AlertWhereInput = {
        userId,
        alertType: q.alertType,
        target: q.target,
        deliveryChannel: q.deliveryChannel,
        billId: q.billId ?? null,
        legislatorId: q.legislatorId ?? null,
        committeeId: q.committeeId ?? null,
        delegationId: q.delegationId ?? null,
        chamber: q.chamber ?? null,
        calendarType: q.calendarType ?? null,
        eventTypeFilter: q.eventTypeFilter ?? null,
    }

    // Remove undefined fields so Prisma doesn’t treat them oddly
    Object.keys(where).forEach((k) => {
        // @ts-expect-error runtime cleanup
        if (where[k] === undefined) delete where[k]
    })

    return where
}

// ---------- POST: create (idempotent) ----------
export async function POST(req: NextRequest) {
    const userId = await getUserId()
    if ( ! userId ) return json({ error: "Unauthorized" }, 401)

    let body: z.infer<typeof CreateAlertBodySchema>
    try {
        body = CreateAlertBodySchema.parse(await req.json())
        console.log( 'Body', { body })
    } catch (e) {
        return json({ error: "Invalid request", details: e instanceof Error ? e.message : e }, 400)
    }

    // "Idempotent create": if an identical alert already exists, return it.
    const naturalWhere = buildNaturalWhere(userId, {
        alertType: body.alertType,
        target: body.target,
        deliveryChannel: body.deliveryChannel,
        billId: body.billId,
        legislatorId: body.legislatorId,
        committeeId: body.committeeId,
        delegationId: body.delegationId,
        chamber: body.chamber,
        calendarType: body.calendarType,
        eventTypeFilter: body.eventTypeFilter,
    })

    const existing = await prisma.alert.findFirst({ where: naturalWhere })
    if (existing) {
        // If caller is "re-enabling" it, update active/includeHistory/etc.
        const updated = await prisma.alert.update({
            where: { id: existing.id },
            data: {
                active: body.active,
                includeHistory: body.includeHistory,
                statusThreshold: body.statusThreshold,
                metadata: body.metadata as Prisma.InputJsonValue | undefined,
            },
        })
        return json({ created: false, alert: updated })
    }

    const created = await prisma.alert.create({
        data: {
            userId,
            active: body.active,
            alertType: body.alertType,
            billId: body.billId,
            legislatorId: body.legislatorId,
            committeeId: body.committeeId,
            delegationId: body.delegationId,
            chamber: body.chamber,
            calendarType: body.calendarType,
            eventTypeFilter: body.eventTypeFilter,
            deliveryChannel: body.deliveryChannel,
            target: body.target,
            statusThreshold: body.statusThreshold,
            includeHistory: body.includeHistory,
            metadata: body.metadata as Prisma.InputJsonValue | undefined,
        },
    })

    return json({ created: true, alert: created }, 201)
}

// ---------- GET: status (or list) ----------
// Supported:
//    - GET /api/alert?id=123
//    - GET /api/alert?status=1&alertType=...&billId=...&target=... (natural match)
//    - GET /api/alert    -> list current user’s alerts (optionally filter by active=1)
export async function GET(req: NextRequest) {
    const userId = await getUserId()
    if ( ! userId ) return json({ error: "Unauthorized" }, 401)

    const url = new URL(req.url)
    const statusMode = url.searchParams.get("status") // any truthy value => status response

    const idParam = url.searchParams.get("id")
    const activeParam = url.searchParams.get("active")
    const viewParam = url.searchParams.get("view")

    // If id provided, fetch that single alert (must belong to user)
    if (idParam) {
        const id = Number(idParam)
        if (!Number.isInteger(id) || id <= 0) return json({ error: "Invalid id" }, 400)

        const alert = await prisma.alert.findFirst({
            where: { id, userId },
        })

        if (statusMode) {
            return json({ exists: !!alert, active: alert?.active ?? false, alert })
        }

        if (!alert) return json({ error: "Not found" }, 404)
        return json({ alert })
    }

    // Export the custom view for the Dashboard
    if ( viewParam === "dashboard" ) {
        const alerts = await prisma.alert.findMany({
            where: {
                userId,
                active: true
            },
            include: {
                // @TODO whatever else needs to be returned here too!
                bill: true,
            }
        })

        if ( ! alerts ) return json({ error: "Not found" }, 404 )
        return json({ alerts })
    }

    // Status-by-natural-key
    if (statusMode) {
        const parsed = IdentifyAlertSchema.safeParse({
            alertType: url.searchParams.get("alertType") ?? undefined,
            target: url.searchParams.get("target") ?? undefined,
            deliveryChannel: url.searchParams.get("deliveryChannel") ?? undefined,
            billId: url.searchParams.get("billId") ? Number(url.searchParams.get("billId")) : undefined,
            legislatorId: url.searchParams.get("legislatorId") ? Number(url.searchParams.get("legislatorId")) : undefined,
            committeeId: url.searchParams.get("committeeId") ? Number(url.searchParams.get("committeeId")) : undefined,
            delegationId: url.searchParams.get("delegationId") ? Number(url.searchParams.get("delegationId")) : undefined,
            chamber: url.searchParams.get("chamber") ?? undefined,
            calendarType: url.searchParams.get("calendarType") ?? undefined,
            eventTypeFilter: url.searchParams.get("eventTypeFilter") ?? undefined,
        })

        if (!parsed.success) return json({ error: "Invalid query", details: parsed.error.flatten() }, 400)

        // Require at least these to avoid “status of everything”
        if (!parsed.data.alertType || !parsed.data.target) {
            return json({ error: "status=1 requires at least alertType and target" }, 400)
        }

        const where = buildNaturalWhere(userId, parsed.data)
        const alert = await prisma.alert.findFirst({ where })

        return json({ exists: !!alert, active: alert?.active ?? false, alert })
    }

    // Otherwise list alerts for user (optionally filter active)
    const where: Prisma.AlertWhereInput = { userId }
    if (activeParam === "1" || activeParam === "true") where.active = true
    if (activeParam === "0" || activeParam === "false") where.active = false

    const alerts = await prisma.alert.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
    })

    return json({ alerts })
}

// ---------- DELETE: remove (by id or natural key) ----------
export async function DELETE(req: NextRequest) {
    const userId = await getUserId()
    if ( ! userId ) return json({ error: "Unauthorized" }, 401)

    const url = new URL(req.url)
    const idParam = url.searchParams.get("id")

    // Preferred: delete by id
    if (idParam) {
        const id = Number(idParam)
        if (!Number.isInteger(id) || id <= 0) return json({ error: "Invalid id" }, 400)

        const existing = await prisma.alert.findFirst({ where: { id, userId } })
        if (!existing) return json({ error: "Not found" }, 404)

        await prisma.alert.delete({ where: { id } })
        return json({ deleted: true, id })
    }

    // Also allow deleting by natural key in the JSON body
    let body: z.infer<typeof IdentifyAlertSchema>
    try {
        body = IdentifyAlertSchema.parse(await req.json())
    } catch (e) {
        return json(
            { error: "Provide either ?id= in query OR a JSON body with alertType+target(+filters)", details: e instanceof Error ? e.message : e },
            400
        )
    }

    if (body.id) {
        const existing = await prisma.alert.findFirst({ where: { id: body.id, userId } })
        if (!existing) return json({ error: "Not found" }, 404)

        await prisma.alert.delete({ where: { id: body.id } })
        return json({ deleted: true, id: body.id })
    }

    if (!body.alertType || !body.target) {
        return json({ error: "To delete by filters, alertType and target are required" }, 400)
    }

    const where = buildNaturalWhere(userId, body)
    const existing = await prisma.alert.findFirst({ where })
    if (!existing) return json({ error: "Not found" }, 404)

    await prisma.alert.delete({ where: { id: existing.id } })
    return json({ deleted: true, id: existing.id })
}
