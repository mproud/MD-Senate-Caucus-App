import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getQuery(request: Request) {
    const url = new URL(request.url)
    const idParam = url.searchParams.get("id")
    const name = url.searchParams.get("name")

    const id = idParam && !Number.isNaN(Number(idParam)) ? Number(idParam) : null

    return { id, name }
}

function rowsToMap(rows: Array<{ name: string; value: string | null }>) {
    const settings: Record<string, string | null> = {}

    for (const row of rows) {
        settings[row.name] = row.value ?? null
    }

    return settings
}

export async function GET(request: Request) {
    const { id, name } = getQuery(request)

    if (!id && !name) {
        const rows = await prisma.settings.findMany({
            select: { name: true, value: true },
            orderBy: { name: "asc" },
        })

        return NextResponse.json({ settings: rowsToMap(rows) })
    }

    if (id) {
        const setting = await prisma.settings.findUnique({
            where: { id },
            select: { name: true, value: true },
        })

        if (!setting) {
            return NextResponse.json({ error: "Setting not found" }, { status: 404 })
        }

        return NextResponse.json({ setting })
    }

    const setting = await prisma.settings.findUnique({
        where: { name: name as string },
        select: { name: true, value: true },
    })

    if (!setting) {
        return NextResponse.json({ error: "Setting not found" }, { status: 404 })
    }

    return NextResponse.json({ setting })
}

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null)

    if (!isRecord(body)) {
        return NextResponse.json(
            { error: "Invalid body. Expected { name: string, value?: string|null }" },
            { status: 400 }
        )
    }

    const rawName = body["name"]

    if (typeof rawName !== "string" || rawName.trim() === "") {
        return NextResponse.json(
            { error: "Invalid body. Expected { name: string, value?: string|null }" },
            { status: 400 }
        )
    }

    const name = rawName.trim()
    const rawValue = body["value"]
    const value =
        rawValue === undefined ? null : rawValue === null ? null : String(rawValue)

    try {
        const setting = await prisma.settings.create({
            data: { name, value },
            select: { name: true, value: true },
        })

        return NextResponse.json({ setting }, { status: 201 })
    } catch (err: any) {
        return NextResponse.json(
            { error: "A setting with that name already exists" },
            { status: 409 }
        )
    }
}

export async function PUT(request: Request) {
    const { id, name } = getQuery(request)
    const body: unknown = await request.json().catch(() => null)

    if (!isRecord(body)) {
        return NextResponse.json(
            { error: "Invalid body. Expected an object." },
            { status: 400 }
        )
    }

    // Bulk upsert: PUT /api/admin/settings with body { key: value, ... }
    if (!id && !name) {
        const entries = Object.entries(body)

        if (entries.length === 0) {
            return NextResponse.json(
                { error: "Body is empty. Provide at least one setting." },
                { status: 400 }
            )
        }

        await prisma.$transaction(
            entries.map(([settingName, rawValue]) => {
                const cleanName = String(settingName).trim()

                if (cleanName === "") {
                    throw new Error("Invalid setting name")
                }

                const value =
                    rawValue === undefined
                        ? null
                        : rawValue === null
                        ? null
                        : typeof rawValue === "string"
                        ? rawValue
                        : String(rawValue)

                return prisma.settings.upsert({
                    where: { name: cleanName },
                    update: { value },
                    create: { name: cleanName, value },
                })
            })
        )

        const rows = await prisma.settings.findMany({
            select: { name: true, value: true },
            orderBy: { name: "asc" },
        })

        return NextResponse.json({ settings: rowsToMap(rows) })
    }

    // Single update: PUT /api/admin/settings?id=1 or ?name=foo with body { value: ... } (and optionally { name: ... })
    const data: { value?: string | null; name?: string } = {}

    if ("value" in body) {
        const rawValue = body["value"]
        data.value = rawValue === null ? null : String(rawValue)
    }

    if ("name" in body) {
        const rawNewName = body["name"]

        if (typeof rawNewName !== "string" || rawNewName.trim() === "") {
            return NextResponse.json(
                { error: "If provided, name must be a non-empty string" },
                { status: 400 }
            )
        }

        data.name = rawNewName.trim()
    }

    if (!("value" in body) && !("name" in body)) {
        return NextResponse.json(
            { error: "Invalid body. Expected at least { value } and/or { name }" },
            { status: 400 }
        )
    }

    try {
        const setting = id
            ? await prisma.settings.update({
                  where: { id },
                  data,
                  select: { name: true, value: true },
              })
            : await prisma.settings.update({
                  where: { name: name as string },
                  data,
                  select: { name: true, value: true },
              })

        return NextResponse.json({ setting })
    } catch (err: any) {
        return NextResponse.json({ error: "Setting not found" }, { status: 404 })
    }
}

export async function DELETE(request: Request) {
    const { id, name } = getQuery(request)

    if (!id && !name) {
        return NextResponse.json(
            { error: "Provide ?id= or ?name= to delete a setting" },
            { status: 400 }
        )
    }

    try {
        if (id) {
            await prisma.settings.delete({ where: { id } })
            return NextResponse.json({ ok: true })
        }

        await prisma.settings.delete({ where: { name: name as string } })
        return NextResponse.json({ ok: true })
    } catch (err: any) {
        return NextResponse.json({ error: "Setting not found" }, { status: 404 })
    }
}
