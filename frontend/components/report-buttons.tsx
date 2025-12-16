"use client"

import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

const handlePdfReport = () => {
    return
}

const handleExcelReport = () => {
    return
}

export const ReportButtons = () => {
    return (
        <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={handleExcelReport}>
                <Download className="mr-2 h-4 w-4" />
                Download as Excel
            </Button>

            <Button variant="outline" onClick={handlePdfReport}>
                <Printer className="mr-2 h-4 w-4" />
                Print Report
            </Button>
        </div>
    )
}