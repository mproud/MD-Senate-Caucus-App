import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

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
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { error: "Invalid body. Expected { name: string, value?: string|null }" },
            { status: 400 }
        )
    }

    if (typeof body.name !== "string" || body.name.trim() === "") {
        return NextResponse.json(
            { error: "Invalid body. Expected { name: string, value?: string|null }" },
            { status: 400 }
        )
    }

    const name = body.name.trim()
    const value =
        body.value === undefined ? null : body.value === null ? null : String(body.value)

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
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { error: "Invalid body. Expected an object." },
            { status: 400 }
        )
    }

    // Bulk upsert: PUT /api/admin/settings with body { key: value, ... }
    // Example: { activeSessionCode: "2026RS", sessionYear: 2026 }
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

        // Return the full map after update so the UI can set state in one shot
        const rows = await prisma.settings.findMany({
            select: { name: true, value: true },
            orderBy: { name: "asc" },
        })

        return NextResponse.json({ settings: rowsToMap(rows) })
    }

    // Single update: PUT /api/admin/settings?id=1 or ?name=foo with body { value: ... } (and optionally { name: ... })
    const data: { value?: string | null; name?: string } = {}

    if ("value" in body) {
        data.value = body.value === null ? null : String(body.value)
    }

    if ("name" in body) {
        if (typeof body.name !== "string" || body.name.trim() === "") {
            return NextResponse.json(
                { error: "If provided, name must be a non-empty string" },
                { status: 400 }
            )
        }

        data.name = body.name.trim()
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
