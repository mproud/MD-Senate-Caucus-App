import puppeteer from "@cloudflare/puppeteer"
import { NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"

export const runtime = "edge"

type Env = {
    BROWSER: any
}

export async function POST( request: Request ) {
    const { env } = getCloudflareContext()

    const cfEnv = env as unknown as Env
    
    const browser = await puppeteer.launch( cfEnv.BROWSER )
    const page = await browser.newPage()

    try {
        const document = "<h1>Hello world!</h1><p>Test</p>"
    } catch( error ) {

    } finally {
        // Make sure resources are cleaned up
        await page.close().catch(() => {})
        await browser.close().catch(() => {})
    }

    return NextResponse.json({ ok: 'ok' })
}