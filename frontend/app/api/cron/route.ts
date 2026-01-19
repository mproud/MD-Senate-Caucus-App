import { NextResponse } from "next/server"

export function GET( req: Request ) {
    if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ ok: 'ok' })
}