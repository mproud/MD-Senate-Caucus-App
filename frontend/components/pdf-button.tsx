"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface PdfButtonProps {
    chambers: string[]
    sections: string[]
    dates: string[]
}

export function PdfButton({ chambers, sections, dates }: PdfButtonProps) {
    const [isLoading, setIsLoading] = useState(false)

    const handleDownload = async () => {
        // @TODO this should get handled better - allow someone to do a report of all with warning, or use a default
        // if (chambers.length === 0 || sections.length === 0 || dates.length === 0) {
        //     toast.error("Selection Required",{
        //         description: "Please select at least one chamber, section, and date to generate a PDF.",
        //     })
        //     return
        // }

        setIsLoading(true)
        try {
            const response = await fetch("/api/reports", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    chambers: chambers.join(","),
                    sections: sections.join(","),
                    dates: dates.join(","),
                }),
            })

            if (!response.ok) {
                throw new Error("Failed to generate PDF")
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)

            const a = document.createElement("a")
            a.href = url
            a.download = `mga-calendar-report-${new Date().toISOString().split("T")[0]}.txt`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)

            toast("Report Generated",{
                description: "Your calendar report has been downloaded.",
            })
        } catch (error) {
            toast.error("Error", {
                description: error instanceof Error ? error.message : "Failed to generate report",
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Button onClick={handleDownload} disabled={isLoading} variant="outline">
            {isLoading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                </>
            ) : (
                <>
                    <FileDown className="mr-2 h-4 w-4" />
                    Print PDF
                </>
            )}
        </Button>
    )
}
