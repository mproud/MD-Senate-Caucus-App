import { NextResponse } from "next/server"
import { z } from "zod"
import { getUserPreferences, updateUserPreferences } from "@/lib/user-preferences"
import { auth } from "@clerk/nextjs/server"

function stripDisallowedKeys(input: unknown): unknown {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input
    const { userId, emailAddress, extras, ...rest } = input as Record<string, unknown>
    return rest
}

const EnabledAlertTypesSchema = z
    .object({
        billIntroduced: z.boolean().optional(),
        billStatusChange: z.boolean().optional(),
        billAddedToCalendar: z.boolean().optional(),
        billRemovedFromCalendar: z.boolean().optional(),
        calendarPublished: z.boolean().optional(),
        calendarUpdated: z.boolean().optional(),
        committeeReferral: z.boolean().optional(),
        committeeVoteRecorded: z.boolean().optional(),
        hearingScheduled: z.boolean().optional(),
        hearingChanged: z.boolean().optional(),
        hearingCanceled: z.boolean().optional(),
    })

const UserPreferencesUpdatesSchema = z
    .object({
        alertDeliveryMethod: z.enum(["email", "sms", "both"]).optional(),
        alertFrequency: z.enum(["realtime", "daily_digest", "weekly_digest"]).optional(),
        phoneNumber: z.string().optional(),
        digestTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "digestTime must be HH:MM (24-hour)")
            .optional(),
        digestDay: z
            .enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
            .optional(),
        enabledAlertTypes: EnabledAlertTypesSchema.optional(),
    })
    .strict()

export async function GET() {
    const { userId } = await auth()
    if ( ! userId ) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const prefs = await getUserPreferences(userId)
    return NextResponse.json(prefs)
}

export async function PATCH(req: Request) {
    const { userId } = await auth()
    if ( ! userId ) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body: unknown = await req.json()
    const sanitized = stripDisallowedKeys(body)
    const parsed = UserPreferencesUpdatesSchema.safeParse(sanitized)

    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid preferences update", details: parsed.error.flatten() },
            { status: 400 },
        )
    }

    const prefs = await updateUserPreferences(userId, parsed.data)
    return NextResponse.json(prefs)
}
