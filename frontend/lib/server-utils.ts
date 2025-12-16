import { NextResponse } from "next/server"

export function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status })
}

export function toInt(value: string | null): number | null {
    if ( ! value ) return null
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? n : null
}
