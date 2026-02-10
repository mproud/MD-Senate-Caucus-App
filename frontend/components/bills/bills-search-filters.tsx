"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Search, ChevronDown, RotateCcw } from "lucide-react"
import { getUniqueSponsors, getUniqueCommittees, getUniqueSubjects } from "@/lib/mock-data"
import { Committee } from "@prisma/client"

interface BillsSearchFiltersProps {
    initialQuery: string
    initialChamber: string
    initialCommittee: string
    initialSponsor: string
    initialSubject: string
    initialStatus: string
    committees: Committee[]
}

export function BillsSearchFilters({
    initialQuery,
    initialChamber,
    initialCommittee,
    initialSponsor,
    initialSubject,
    initialStatus,
    committees,
}: BillsSearchFiltersProps) {
    const router = useRouter()

    const [query, setQuery] = useState(initialQuery)
    const [chamber, setChamber] = useState(initialChamber)
    const [committee, setCommittee] = useState(initialCommittee)
    const [sponsor, setSponsor] = useState(initialSponsor)
    const [subject, setSubject] = useState(initialSubject)
    const [status, setStatus] = useState(initialStatus)

    const [committeeSearch, setCommitteeSearch] = useState("")
    const [sponsorSearch, setSponsorSearch] = useState("")
    const [subjectSearch, setSubjectSearch] = useState("")

    // const availableCommittees = getUniqueCommittees()
    // const filteredCommittees = availableCommittees.filter((c) => c.toLowerCase().includes(committeeSearch.toLowerCase()))

    const availableSponsors: any[] = []
    const availableSubjects: any[] = []

    const filteredCommittees = committees
        .filter((c) => {
            const search = committeeSearch.toLowerCase()
            return (
                (c.name || "").toLowerCase().includes(search) ||
                (c.abbreviation || "").toLowerCase().includes(search)
            )
        })
        .map((c) => ({
            id: c.id,
            abbreviation: c.abbreviation ?? "",
            name: c.name ?? "",
            label: `${c.abbreviation ?? ""} - ${c.name ?? ""}`,
        }))

    const selectedCommitteeLabel =
        committee
            ? (() => {
                const found = committees.find((c) => (c.abbreviation ?? "") === committee)
                return found ? `${found.abbreviation ?? ""} - ${found.name ?? ""}` : committee
            })()
            : ""

    const filteredSponsors = availableSponsors.filter((s) => s.toLowerCase().includes(sponsorSearch.toLowerCase()))
    const filteredSubjects = availableSubjects.filter((s) => s.toLowerCase().includes(subjectSearch.toLowerCase()))

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()
        const params = new URLSearchParams()

        if (query.trim()) params.set("q", query.trim())
        if (chamber) params.set("chamber", chamber)
        if (committee) params.set("committee", committee)
        if (sponsor) params.set("sponsor", sponsor)
        if (subject) params.set("subject", subject)
        if (status) params.set("status", status)

        router.push(`/bills?${params.toString()}`)
    }

    const handleReset = () => {
        setQuery("")
        setChamber("")
        setCommittee("")
        setSponsor("")
        setSubject("")
        setStatus("")
        router.push("/bills")
    }

    const chambers = ["Senate", "House"]

    const statuses = [
        "First Reading",
        "Second Reading",
        "Third Reading",
        "Passed",
        "Failed",
        "In Committee",
        "Signed by Governor",
    ]

    const extendedStatuses = [
        { key: "FIRST_READING", label: "First Reading" },
        { key: "SECOND_READING", label: "Second Reading" },
        { key: "THIRD_READING", label: "Third Reading" },
        { key: "PASSED", label: "Passed" },
    ]

    return (
        <Card>
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit}>
                    {/* Search Input */}
                    <div className="mb-4">
                        <Label htmlFor="search" className="sr-only">
                            Search
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="search"
                                placeholder="Search by bill number or title..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    {/* Filter Row */}
                    <div className="flex flex-wrap gap-3">
                        {/* Chamber Filter */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="min-w-[120px] justify-between bg-transparent">
                                    {chamber || "Chamber"}
                                    <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-2" align="start">
                                <div className="space-y-1">
                                    <Button
                                        variant={chamber === "" ? "secondary" : "ghost"}
                                        className="w-full justify-start"
                                        onClick={() => setChamber("")}
                                    >
                                        All Chambers
                                    </Button>
                                    {chambers.map((c) => (
                                        <Button
                                            key={c}
                                            variant={chamber === c ? "secondary" : "ghost"}
                                            className="w-full justify-start"
                                            onClick={() => setChamber(c)}
                                        >
                                            {c}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Committee Filter */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="min-w-[180px] justify-between bg-transparent">
                                    <span className="truncate max-w-[100px]">{selectedCommitteeLabel || "Committee"}</span>
                                    <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-2" align="start">
                                <div className="mb-2">
                                    <Input
                                        placeholder="Search committees..."
                                        value={committeeSearch}
                                        onChange={(e) => setCommitteeSearch(e.target.value)}
                                        className="h-8"
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    <Button
                                        variant={committee === "" ? "secondary" : "ghost"}
                                        className="w-full justify-start text-sm"
                                        onClick={() => setCommittee("")}
                                    >
                                        All Committees
                                    </Button>
                                    {filteredCommittees.map((c) => (
                                        <Button
                                            key={c.id}
                                            variant={committee === c.abbreviation ? "secondary" : "ghost"}
                                            className="w-full justify-start text-sm truncate"
                                            onClick={() => setCommittee(c.abbreviation)}
                                        >
                                            {c.label}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Sponsor Filter */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="min-w-[140px] justify-between bg-transparent">
                                    <span className="truncate max-w-[100px]">{sponsor || "Sponsor"}</span>
                                    <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-2" align="start">
                                <div className="mb-2">
                                    <Input
                                        placeholder="Search sponsors..."
                                        value={sponsorSearch}
                                        onChange={(e) => setSponsorSearch(e.target.value)}
                                        className="h-8"
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    <Button
                                        variant={sponsor === "" ? "secondary" : "ghost"}
                                        className="w-full justify-start text-sm"
                                        onClick={() => setSponsor("")}
                                    >
                                        All Sponsors
                                    </Button>
                                    {filteredSponsors.map((s) => (
                                        <Button
                                            key={s}
                                            variant={sponsor === s ? "secondary" : "ghost"}
                                            className="w-full justify-start text-sm truncate"
                                            onClick={() => setSponsor(s)}
                                        >
                                            {s}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Subject Filter */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="min-w-[120px] justify-between bg-transparent">
                                    <span className="truncate max-w-[80px]">{subject || "Subject"}</span>
                                    <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-2" align="start">
                                <div className="mb-2">
                                    <Input
                                        placeholder="Search subjects..."
                                        value={subjectSearch}
                                        onChange={(e) => setSubjectSearch(e.target.value)}
                                        className="h-8"
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    <Button
                                        variant={subject === "" ? "secondary" : "ghost"}
                                        className="w-full justify-start text-sm"
                                        onClick={() => setSubject("")}
                                    >
                                        All Subjects
                                    </Button>
                                    {filteredSubjects.map((s) => (
                                        <Button
                                            key={s}
                                            variant={subject === s ? "secondary" : "ghost"}
                                            className="w-full justify-start text-sm truncate"
                                            onClick={() => setSubject(s)}
                                        >
                                            {s}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Status Filter */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="min-w-[120px] justify-between bg-transparent">
                                    <span className="truncate max-w-[80px]">{status || "Status"}</span>
                                    <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-2" align="start">
                                <div className="space-y-1">
                                    <Button
                                        variant={status === "" ? "secondary" : "ghost"}
                                        className="w-full justify-start text-sm"
                                        onClick={() => setStatus("")}
                                    >
                                        All Statuses
                                    </Button>
                                    {statuses.map((s) => (
                                        <Button
                                            key={s}
                                            variant={status === s ? "secondary" : "ghost"}
                                            className="w-full justify-start text-sm"
                                            onClick={() => setStatus(s)}
                                        >
                                            {s}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Action Buttons */}
                        <div className="flex gap-2 ml-auto">
                            <Button type="button" variant="outline" onClick={handleReset}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Reset
                            </Button>
                            <Button type="submit">
                                <Search className="h-4 w-4 mr-2" />
                                Search
                            </Button>
                        </div>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
