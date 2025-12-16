import { NextResponse } from "next/server"
import puppeteer from "@cloudflare/puppeteer"
import { getCloudflareContext } from "@opennextjs/cloudflare"

interface Env {
    BROWSER: Fetcher
    NEXT_PUBLIC_SITE_URL?: string
}

interface PdfRequestBody {
    path: string
}

const ALLOWED_PATHS = [
    /^\/calendar\b/,
    /^\/reports\b/,
]

export async function POST(req: Request) {
    let body: PdfRequestBody

    try {
        body = (await req.json()) as PdfRequestBody
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        )
    }

    const { path } = body

    if (!path || !path.startsWith("/")) {
        return NextResponse.json(
            { error: "Missing or invalid 'path'. Must start with '/'" },
            { status: 400 }
        )
    }

    if (!ALLOWED_PATHS.some((r) => r.test(path))) {
        return NextResponse.json(
            { error: "Path not allowed" },
            { status: 403 }
        )
    }

    // Access Cloudflare bindings/env
    const { env } = getCloudflareContext() as unknown as { env: Env }

    // Base site URL (canonical origin)
    const siteUrl =
        env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL

    if ( ! siteUrl) {
        return NextResponse.json(
            { error: "Server misconfiguration: missing site URL" },
            { status: 500 }
        )
    }

    // Resolve to full same-origin URL
    const targetUrl = new URL(path, siteUrl).toString()

    const browser = await puppeteer.launch(env.BROWSER)

    try {
        const page = await browser.newPage()
        await page.goto(targetUrl, { waitUntil: "networkidle0" })

        const pdf = await page.pdf({
            format: "Letter",
            printBackground: true,
            margin: {
                top: "1in",
                right: "1in",
                bottom: "1in",
                left: "1in",
            },
        })

        // Ensure Workers-safe body
        const bytes = new Uint8Array(pdf)
        const blob = new Blob([bytes], { type: "application/pdf" })

        return new NextResponse(blob, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="calendar.pdf"',
            },
        })
    } finally {
        await browser.close()
    }
}
