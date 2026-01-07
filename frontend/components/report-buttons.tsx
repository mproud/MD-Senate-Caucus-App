"use client"

import axios from "axios"
import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

const handlePdfReport = async () => {
    const userId = 12
    const documentId = 13
    
    // make the call to /api/reports/pdf
    // @TODO use fetchApi function
    
    const res = await axios.post(
        `/api/reports/pdf`,
        { documentId, userId },
        { responseType: "arraybuffer" } // Ensures binary data is received for the PDF
    )

    return
}

const handleExcelReport = () => {
    return
}

export const ReportButtons = () => {
    return (
        <div className="flex shrink-0 items-center gap-2 report-button-wrapper">
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