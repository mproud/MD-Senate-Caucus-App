"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function FindBillForm() {
    const router = useRouter()
    const [billNumber, setBillNumber] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    function handleSearch(e: React.FormEvent) {
        e.preventDefault()

        if (!billNumber.trim()) return

        setIsLoading(true)
        setError(null)

        router.push(`?billNumber=${encodeURIComponent(billNumber.trim())}`)
    }

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>Find Bill</CardTitle>
                <CardDescription>Enter a bill number to load the current committee and members</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSearch} className="flex gap-4">
                    <div className="flex-1">
                        <Input
                            placeholder="Enter bill number (e.g., HB15, SB301)"
                            value={billNumber}
                            onChange={(e) => setBillNumber(e.target.value.toUpperCase())}
                            className="font-mono"
                        />
                    </div>
                    <Button type="submit" disabled={isLoading || !billNumber.trim()}>
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <Search className="h-4 w-4 mr-2" />
                        )}
                        Search
                    </Button>
                </form>
                {error && <p className="text-sm text-destructive mt-2">{error}</p>}
            </CardContent>
        </Card>
    )
}