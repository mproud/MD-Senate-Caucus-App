import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export interface UserPreferences {
    userId: string
    alertDeliveryMethod: "email" | "sms" | "both"
    alertFrequency: "realtime" | "daily_digest" | "weekly_digest"
    emailAddress: string
    phoneNumber: string
    digestTime: string // "09:00"
    digestDay: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
    enabledAlertTypes: {
        billIntroduced: boolean
        billStatusChange: boolean
        billAddedToCalendar: boolean
        billRemovedFromCalendar: boolean
        calendarPublished: boolean
        calendarUpdated: boolean
        committeeReferral: boolean
        committeeVoteRecorded: boolean
        hearingScheduled: boolean
        hearingChanged: boolean
        hearingCanceled: boolean
    }

    /**
     * Stores unknown/future preference keys so we can round-trip them without
     * having to update the typed interface immediately.
     */
    extras?: Record<string, unknown>
}

export type UserPreferencesUpdates = Partial<Omit<Omit<UserPreferences, "userId">, "enabledAlertTypes">> & {
    enabledAlertTypes?: Partial<UserPreferences["enabledAlertTypes"]>
}

type EnabledAlertTypes = UserPreferences["enabledAlertTypes"]
type DefaultUserPreferences = Omit<UserPreferences, "userId">

const defaultPreferences: DefaultUserPreferences = {
    alertDeliveryMethod: "email",
    alertFrequency: "realtime",
    emailAddress: "",
    phoneNumber: "",
    digestTime: "09:00",
    digestDay: "monday",
    enabledAlertTypes: {
        billIntroduced: true,
        billStatusChange: true,
        billAddedToCalendar: true,
        billRemovedFromCalendar: true,
        calendarPublished: true,
        calendarUpdated: true,
        committeeReferral: true,
        committeeVoteRecorded: true,
        hearingScheduled: true,
        hearingChanged: true,
        hearingCanceled: true,
    } satisfies EnabledAlertTypes,
}

const SETTINGS_KEY = "preferences"

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function pickString(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined
}

function pickEnum<T extends readonly string[]>(
    v: unknown,
    allowed: T,
): T[number] | undefined {
    return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T[number]) : undefined
}

function pickBool(v: unknown): boolean | undefined {
    return typeof v === "boolean" ? v : undefined
}

/**
 * Safe-ish merge:
 * - Always applies defaults
 * - Preserves unknown keys already in DB
 * - Deep-merges enabledAlertTypes
 */
function normalizePreferences(
    userId: string,
    userEmail: string,
    raw: unknown,
): UserPreferences {
    const r = isRecord(raw) ? raw : {}

    const enabledRaw = isRecord(r.enabledAlertTypes) ? r.enabledAlertTypes : {}

    const alertDeliveryMethod =
        pickEnum(r.alertDeliveryMethod, ["email", "sms", "both"] as const) ??
        defaultPreferences.alertDeliveryMethod

    const alertFrequency =
        pickEnum(r.alertFrequency, ["realtime", "daily_digest", "weekly_digest"] as const) ??
        defaultPreferences.alertFrequency

    const digestDay =
        pickEnum(
            r.digestDay,
            ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const,
        ) ?? defaultPreferences.digestDay
    
    const phoneNumber = pickString(r.phoneNumber) ?? defaultPreferences.phoneNumber
    const digestTime = pickString(r.digestTime) ?? defaultPreferences.digestTime

    const enabledAlertTypes = {
        billIntroduced: pickBool(enabledRaw.billIntroduced) ?? defaultPreferences.enabledAlertTypes.billIntroduced,
        billStatusChange: pickBool(enabledRaw.billStatusChange) ?? defaultPreferences.enabledAlertTypes.billStatusChange,
        billAddedToCalendar: pickBool(enabledRaw.billAddedToCalendar) ?? defaultPreferences.enabledAlertTypes.billAddedToCalendar,
        billRemovedFromCalendar: pickBool(enabledRaw.billRemovedFromCalendar) ?? defaultPreferences.enabledAlertTypes.billRemovedFromCalendar,
        calendarPublished: pickBool(enabledRaw.calendarPublished) ?? defaultPreferences.enabledAlertTypes.calendarPublished,
        calendarUpdated: pickBool(enabledRaw.calendarUpdated) ?? defaultPreferences.enabledAlertTypes.calendarUpdated,
        committeeReferral: pickBool(enabledRaw.committeeReferral) ?? defaultPreferences.enabledAlertTypes.committeeReferral,
        committeeVoteRecorded: pickBool(enabledRaw.committeeVoteRecorded) ?? defaultPreferences.enabledAlertTypes.committeeVoteRecorded,
        hearingScheduled: pickBool(enabledRaw.hearingScheduled) ?? defaultPreferences.enabledAlertTypes.hearingScheduled,
        hearingChanged: pickBool(enabledRaw.hearingChanged) ?? defaultPreferences.enabledAlertTypes.hearingChanged,
        hearingCanceled: pickBool(enabledRaw.hearingCanceled) ?? defaultPreferences.enabledAlertTypes.hearingCanceled,        
    }

    // Preserve unknown top-level keys (except enabledAlertTypes, which we normalize)
    const { enabledAlertTypes: _ignored, ...extras } = r

    return {
        userId,
        alertDeliveryMethod,
        alertFrequency,
        emailAddress: userEmail,
        phoneNumber,
        digestTime,
        digestDay,
        enabledAlertTypes,
        extras,
    }
}

function toStoredPreferences(prefs: UserPreferences): Prisma.InputJsonObject {
    const { userId: _userId, emailAddress: _emailAddress, extras, ...known } = prefs
    return {
        ...(known as unknown as Prisma.InputJsonObject),
        ...((extras ?? {}) as Prisma.InputJsonObject),
    }
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { email: true, userSettings: true },
    })

    const settings = (user?.userSettings ?? {}) as Record<string, unknown>
    return normalizePreferences(userId, user?.email ?? "", settings[SETTINGS_KEY])
}

export async function updateUserPreferences(
    userId: string,
    updates: UserPreferencesUpdates & { emailAddress?: never }, // discourage passing it
): Promise<UserPreferences> {
    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { email: true, userSettings: true },
    })

    const currentSettings = (user?.userSettings ?? {}) as Prisma.JsonObject
    const currentPrefs = normalizePreferences(userId, user?.email ?? "", currentSettings[SETTINGS_KEY])

    const updated: UserPreferences = {
        ...currentPrefs,
        ...updates,
        enabledAlertTypes: {
            ...currentPrefs.enabledAlertTypes,
            ...(updates.enabledAlertTypes ?? {}),
        },
        // If caller included extras explicitly, merge them; otherwise keep existing extras
        extras: {
            ...(currentPrefs.extras ?? {}),
            ...(isRecord((updates as any).extras) ? ((updates as any).extras as Record<string, unknown>) : {}),
        },
        emailAddress: user?.email ?? "",
    }

    const nextSettings: Prisma.InputJsonObject = {
        ...(currentSettings as Prisma.InputJsonObject),
        [SETTINGS_KEY]: toStoredPreferences(updated) as Prisma.InputJsonObject,
    }

    await prisma.user.update({
        where: { clerkId: userId },
        data: { userSettings: nextSettings },
    })

    return updated
}