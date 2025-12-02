import { type NextRequest, NextResponse } from "next/server"

interface ReportRequest {
    chambers?: string
    sections?: string
    dates?: string
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as ReportRequest
        const { chambers, sections, dates } = body

        // Parse comma-separated values
        const chamberList = chambers?.split(",") || []
        const sectionList = sections?.split(",") || []
        const dateList = dates?.split(",") || []

        // Generate filename based on selections
        const sectionNames = sectionList.join("-").replace(/\s+/g, "-").toLowerCase()
        const chamberNames = chamberList.join("-").toLowerCase()
        const dateRange = dateList.length > 1 ? `${dateList[0]}-to-${dateList[dateList.length - 1]}` : dateList[0]

        // In a real implementation, this would generate an actual PDF
        // For demo, we'll create a simple text response that simulates a PDF
        const reportContent = `
Maryland General Assembly Calendar Report
==========================================

Chambers: ${chamberList.join(", ")}
Sections: ${sectionList.join(", ")}
Dates: ${dateList.join(", ")}

This is a demo PDF report. In production, this would contain:
- Full bill listings for selected chambers and sections
- Bill details including sponsors, committees, and synopses
- Vote results where available
- Formatted for printing

Generated: ${new Date().toLocaleString()}
        `.trim()

        // Return as a downloadable text file (in production, this would be a PDF)
        return new NextResponse(reportContent, {
            status: 200,
            headers: {
                "Content-Type": "text/plain",
                "Content-Disposition": `attachment; filename="mga-calendar-${sectionNames}-${chamberNames}-${dateRange}.txt"`,
            },
        })
    } catch (error) {
        console.error("[v0] PDF Report API error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
