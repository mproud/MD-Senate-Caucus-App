"use client"

import type React from "react"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Search, ChevronDown, RotateCcw } from "lucide-react"
import { Committee, Legislator } from "@prisma/client"

interface BillsSearchFiltersProps {
    initialQuery: string
    initialChamber: string
    initialCommittee: string
    initialSponsor: string
    initialSubject: string
    initialStatus: string
    committees: Committee[]
    legislators: Legislator[]
}

type SponsorOption = {
    id: number
    label: string
}

export function BillsSearchFilters({
    initialQuery,
    initialChamber,
    initialCommittee,
    initialSponsor,
    initialSubject,
    initialStatus,
    committees,
    legislators,
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

    const sponsorOptions: SponsorOption[] = useMemo(() => {
        const normalizeChamberPrefix = (terms: any): string => {
            const chamber = terms?.[0]?.chamber
            if (chamber === "SENATE") return "Sen."
            if (chamber === "HOUSE") return "Del."
            return ""
        }

        const getDisplayName = (l: any): string => {
            const fullName = l?.fullName
            if (typeof fullName === "string" && fullName.trim()) return fullName.trim()

            const firstName = l?.firstName
            const middleName = l?.middleName
            const lastName = l?.lastName
            const parts = [firstName, middleName, lastName]
                .filter(Boolean)
                .map((p: string) => p.trim())
            return parts.join(" ").trim()
        }

        const toLabel = (l: any): string => {
            const prefix = normalizeChamberPrefix(l?.terms)
            const name = getDisplayName(l)
            const party = (l?.party ?? "").toString().trim()
            const district = (l?.district ?? "").toString().trim()
            const suffixParts = []
            if (party) suffixParts.push(party.charAt(0))
            if (district) suffixParts.push(district)
            const suffix = suffixParts.length ? ` (${suffixParts.join("-")})` : ""
            const spacer = prefix ? " " : ""
            return `${prefix}${spacer}${name}${suffix}`.trim()
        }

        const options = (legislators ?? [])
            .filter((l: any) => typeof l?.id === "number")
            .map((l: any) => ({
                id: l.id as number,
                label: toLabel(l),
            }))
            .filter((o) => o.label)

        const seen = new Set<number>()
        const orderedUnique: SponsorOption[] = []

        for (const o of options) {
            if (seen.has(o.id)) continue
            seen.add(o.id)
            orderedUnique.push(o)
        }

        return orderedUnique
    }, [legislators])


    const selectedSponsorLabel = useMemo(() => {
        if (!sponsor) return ""
        const sponsorId = Number(sponsor)
        if (!Number.isFinite(sponsorId)) return sponsor
        const found = sponsorOptions.find((s) => s.id === sponsorId)
        return found ? found.label : sponsor
    }, [sponsor, sponsorOptions])

    const filteredSponsors = sponsorOptions.filter((s) =>
        s.label.toLowerCase().includes(sponsorSearch.toLowerCase())
    )

    const filteredSubjects = availableSubjects.filter((s) => s.toLowerCase().includes(subjectSearch.toLowerCase()))

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()
        const params = new URLSearchParams()

        if (query.trim()) params.set("q", query.trim())
        if (chamber) params.set("chamber", chamber)
        if (committee) params.set("committee", committee)
        if (sponsor) params.set("sponsorId", sponsor)
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

                    <div className="flex flex-wrap gap-3">
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

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="min-w-[200px] justify-between bg-transparent">
                                    <span className="truncate max-w-[160px]">{selectedSponsorLabel || "Sponsor"}</span>
                                    <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-2" align="start">
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
                                            key={s.id}
                                            variant={Number(sponsor) === s.id ? "secondary" : "ghost"}
                                            className="w-full justify-start text-sm truncate"
                                            onClick={() => setSponsor(String(s.id))}
                                            title={s.label}
                                        >
                                            {s.label}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* <Popover>
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
                        </Popover> */}

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
