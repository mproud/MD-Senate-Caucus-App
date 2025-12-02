"use client"

import type React from "react"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown, CalendarIcon, X, Search, RotateCcw } from "lucide-react"
import { PdfButton } from "@/components/pdf-button"
import { getUniqueSponsors, getUniqueCommittees, getUniqueSubjects } from "@/lib/mock-data"

interface FiltersBarProps {
    initialChambers: string[]
    initialSections: string[]
    initialStartDate?: string
    initialEndDate?: string
    initialVoteResults: string[]
    initialSponsors: string[]
    initialCommittees: string[]
    initialSubjects: string[]
    initialSearchText?: string
}

export function FiltersBar({
    initialChambers,
    initialSections,
    initialStartDate,
    initialEndDate,
    initialVoteResults,
    initialSponsors,
    initialCommittees,
    initialSubjects,
    initialSearchText,
}: FiltersBarProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [chambers, setChambers] = useState<string[]>(initialChambers)
    const [sections, setSections] = useState<string[]>(initialSections)
    const [startDate, setStartDate] = useState<string | undefined>(initialStartDate)
    const [endDate, setEndDate] = useState<string | undefined>(initialEndDate)
    const [voteResults, setVoteResults] = useState<string[]>(initialVoteResults)
    const [sponsors, setSponsors] = useState<string[]>(initialSponsors)
    const [committees, setCommittees] = useState<string[]>(initialCommittees)
    const [subjects, setSubjects] = useState<string[]>(initialSubjects)
    const [searchText, setSearchText] = useState<string>(initialSearchText || "")

    const [sponsorSearch, setSponsorSearch] = useState<string>("")
    const [committeeSearch, setCommitteeSearch] = useState<string>("")
    const [subjectSearch, setSubjectSearch] = useState<string>("")

    const availableSponsors = getUniqueSponsors()
    const availableCommittees = getUniqueCommittees()
    const availableSubjects = getUniqueSubjects()

    const filteredSponsors = availableSponsors.filter((sponsor) =>
        sponsor.toLowerCase().includes(sponsorSearch.toLowerCase()),
    )
    const filteredCommittees = availableCommittees.filter((committee) =>
        committee.toLowerCase().includes(committeeSearch.toLowerCase()),
    )
    const filteredSubjects = availableSubjects.filter((subject) =>
        subject.toLowerCase().includes(subjectSearch.toLowerCase()),
    )

    const handleSubmit = () => {
        const params = new URLSearchParams()

        if (chambers.length > 0) params.set("chambers", chambers.join(","))
        if (sections.length > 0) params.set("sections", sections.join(","))
        if (startDate) params.set("startDate", startDate)
        if (endDate) params.set("endDate", endDate)
        if (voteResults.length > 0) params.set("voteResults", voteResults.join(","))
        if (sponsors.length > 0) params.set("sponsors", sponsors.join(","))
        if (committees.length > 0) params.set("committees", committees.join(","))
        if (subjects.length > 0) params.set("subjects", subjects.join(","))
        if (searchText.trim()) params.set("searchText", searchText.trim())

        router.push(`/calendar?${params.toString()}`)
    }

    const handleReset = () => {
        setChambers(["Senate", "House"])
        setSections(["Second Reading", "Third Reading"])
        setStartDate(undefined)
        setEndDate(undefined)
        setVoteResults([])
        setSponsors([])
        setCommittees([])
        setSubjects([])
        setSearchText("")
        router.push("/calendar")
    }

    const toggleChamber = (chamber: string) => {
        setChambers((prev) => (prev.includes(chamber) ? prev.filter((c) => c !== chamber) : [...prev, chamber]))
    }

    const toggleSection = (section: string) => {
        setSections((prev) => (prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]))
    }

    const toggleVoteResult = (result: string) => {
        setVoteResults((prev) => (prev.includes(result) ? prev.filter((r) => r !== result) : [...prev, result]))
    }

    const toggleSponsor = (sponsor: string) => {
        setSponsors((prev) => (prev.includes(sponsor) ? prev.filter((s) => s !== sponsor) : [...prev, sponsor]))
    }

    const toggleCommittee = (committee: string) => {
        setCommittees((prev) => (prev.includes(committee) ? prev.filter((c) => c !== committee) : [...prev, committee]))
    }

    const toggleSubject = (subject: string) => {
        setSubjects((prev) => (prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]))
    }

    const getSponsorLabel = () => {
        if (sponsors.length === 0) return "All Sponsors"
        if (sponsors.length === 1) return sponsors[0]
        return `${sponsors.length} Sponsors`
    }

    const getCommitteeLabel = () => {
        if (committees.length === 0) return "All Committees"
        if (committees.length === 1) return committees[0]
        return `${committees.length} Committees`
    }

    const getSubjectLabel = () => {
        if (subjects.length === 0) return "All Subjects"
        if (subjects.length === 1) return subjects[0]
        return `${subjects.length} Subjects`
    }

    const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setStartDate(e.target.value)
    }

    const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEndDate(e.target.value)
    }

    const setDatePreset = (preset: string) => {
        const todayDate = new Date()
        const today = todayDate.toISOString().split("T")[0]
        const oneDay = 24 * 60 * 60 * 1000

        switch (preset) {
            case "today":
                setStartDate(today)
                setEndDate(today)
                break
            case "this-week": {
                const startOfWeek = new Date(todayDate.getTime() - oneDay * todayDate.getDay())
                setStartDate(startOfWeek.toISOString().split("T")[0])
                setEndDate(today)
                break
            }
            case "last-week": {
                const lastWeekEnd = new Date(todayDate.getTime() - oneDay * todayDate.getDay() - oneDay)
                const lastWeekStart = new Date(lastWeekEnd.getTime() - oneDay * 6)
                setStartDate(lastWeekStart.toISOString().split("T")[0])
                setEndDate(lastWeekEnd.toISOString().split("T")[0])
                break
            }
            case "next-week": {
                const nextWeekStart = new Date(todayDate.getTime() + oneDay * (7 - todayDate.getDay()))
                const nextWeekEnd = new Date(nextWeekStart.getTime() + oneDay * 6)
                setStartDate(nextWeekStart.toISOString().split("T")[0])
                setEndDate(nextWeekEnd.toISOString().split("T")[0])
                break
            }
            case "this-month": {
                const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
                setStartDate(firstDayOfMonth.toISOString().split("T")[0])
                setEndDate(today)
                break
            }
            default:
                break
        }
    }

    const clearDateRange = () => {
        setStartDate(undefined)
        setEndDate(undefined)
    }

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-col gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="search-text">Search Bills</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="search-text"
                                type="text"
                                placeholder="Search by bill number, title, synopsis, or sponsor..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>Chamber</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between bg-transparent">
                                        {chambers.length === 0 ? "Select Chamber" : chambers.length === 2 ? "Both Chambers" : chambers[0]}
                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-3">
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="senate-filter"
                                                checked={chambers.includes("Senate")}
                                                onCheckedChange={() => toggleChamber("Senate")}
                                            />
                                            <label htmlFor="senate-filter" className="text-sm font-medium leading-none">
                                                Senate
                                            </label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="house-filter"
                                                checked={chambers.includes("House")}
                                                onCheckedChange={() => toggleChamber("House")}
                                            />
                                            <label htmlFor="house-filter" className="text-sm font-medium leading-none">
                                                House
                                            </label>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Section</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between bg-transparent">
                                        {sections.length === 0 ? "Select Section" : sections.length === 2 ? "Both Sections" : sections[0]}
                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-3">
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="second-reading-filter"
                                                checked={sections.includes("Second Reading")}
                                                onCheckedChange={() => toggleSection("Second Reading")}
                                            />
                                            <label htmlFor="second-reading-filter" className="text-sm font-medium leading-none">
                                                Second Reading
                                            </label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="third-reading-filter"
                                                checked={sections.includes("Third Reading")}
                                                onCheckedChange={() => toggleSection("Third Reading")}
                                            />
                                            <label htmlFor="third-reading-filter" className="text-sm font-medium leading-none">
                                                Third Reading
                                            </label>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Vote Result</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between bg-transparent">
                                        {voteResults.length === 0
                                            ? "All Results"
                                            : voteResults.length === 2
                                                ? "All Results"
                                                : voteResults[0]}
                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-3">
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="passed-filter"
                                                checked={voteResults.includes("Passed")}
                                                onCheckedChange={() => toggleVoteResult("Passed")}
                                            />
                                            <label htmlFor="passed-filter" className="text-sm font-medium leading-none">
                                                Passed
                                            </label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="failed-filter"
                                                checked={voteResults.includes("Failed")}
                                                onCheckedChange={() => toggleVoteResult("Failed")}
                                            />
                                            <label htmlFor="failed-filter" className="text-sm font-medium leading-none">
                                                Failed
                                            </label>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Date Range</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between bg-transparent">
                                        {startDate || endDate ? (
                                            <span className="truncate">
                                                {startDate ? new Date(startDate).toLocaleDateString() : "Start"} -{" "}
                                                {endDate ? new Date(endDate).toLocaleDateString() : "End"}
                                            </span>
                                        ) : (
                                            "Select Dates"
                                        )}
                                        <CalendarIcon className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[320px] p-4">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="start-date" className="text-xs">
                                                Start Date
                                            </Label>
                                            <Input id="start-date" type="date" value={startDate || ""} onChange={handleStartDateChange} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="end-date" className="text-xs">
                                                End Date
                                            </Label>
                                            <Input id="end-date" type="date" value={endDate || ""} onChange={handleEndDateChange} />
                                        </div>
                                        <div className="border-t pt-3">
                                            <Label className="text-xs mb-2 block">Quick Select</Label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setDatePreset("today")}>
                                                    Today
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setDatePreset("this-week")}>
                                                    This Week
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setDatePreset("last-week")}>
                                                    Last Week
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setDatePreset("next-week")}>
                                                    Next Week
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setDatePreset("this-month")}
                                                    className="col-span-2"
                                                >
                                                    This Month
                                                </Button>
                                            </div>
                                        </div>
                                        {(startDate || endDate) && (
                                            <Button variant="ghost" size="sm" onClick={clearDateRange} className="w-full">
                                                <X className="mr-2 h-4 w-4" />
                                                Clear Dates
                                            </Button>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Sponsor</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between bg-transparent">
                                        {getSponsorLabel()}
                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0">
                                    <div className="p-3 border-b">
                                        <div className="relative">
                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search sponsors..."
                                                value={sponsorSearch}
                                                onChange={(e) => setSponsorSearch(e.target.value)}
                                                className="pl-8 h-8"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3 max-h-[250px] overflow-y-auto space-y-2">
                                        {filteredSponsors.length > 0 ? (
                                            filteredSponsors.map((sponsor) => (
                                                <div key={sponsor} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`sponsor-${sponsor}`}
                                                        checked={sponsors.includes(sponsor)}
                                                        onCheckedChange={() => toggleSponsor(sponsor)}
                                                    />
                                                    <label
                                                        htmlFor={`sponsor-${sponsor}`}
                                                        className="text-sm font-medium leading-none cursor-pointer"
                                                    >
                                                        {sponsor}
                                                    </label>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground text-center py-2">No sponsors found</p>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Committee</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between bg-transparent">
                                        {getCommitteeLabel()}
                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0">
                                    <div className="p-3 border-b">
                                        <div className="relative">
                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search committees..."
                                                value={committeeSearch}
                                                onChange={(e) => setCommitteeSearch(e.target.value)}
                                                className="pl-8 h-8"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3 max-h-[250px] overflow-y-auto space-y-2">
                                        {filteredCommittees.length > 0 ? (
                                            filteredCommittees.map((committee) => (
                                                <div key={committee} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`committee-${committee}`}
                                                        checked={committees.includes(committee)}
                                                        onCheckedChange={() => toggleCommittee(committee)}
                                                    />
                                                    <label
                                                        htmlFor={`committee-${committee}`}
                                                        className="text-sm font-medium leading-none cursor-pointer"
                                                    >
                                                        {committee}
                                                    </label>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground text-center py-2">No committees found</p>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Subject</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between bg-transparent">
                                        {getSubjectLabel()}
                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0">
                                    <div className="p-3 border-b">
                                        <div className="relative">
                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search subjects..."
                                                value={subjectSearch}
                                                onChange={(e) => setSubjectSearch(e.target.value)}
                                                className="pl-8 h-8"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3 max-h-[250px] overflow-y-auto space-y-2">
                                        {filteredSubjects.length > 0 ? (
                                            filteredSubjects.map((subject) => (
                                                <div key={subject} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`subject-${subject}`}
                                                        checked={subjects.includes(subject)}
                                                        onCheckedChange={() => toggleSubject(subject)}
                                                    />
                                                    <label
                                                        htmlFor={`subject-${subject}`}
                                                        className="text-sm font-medium leading-none cursor-pointer"
                                                    >
                                                        {subject}
                                                    </label>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground text-center py-2">No subjects found</p>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 justify-between items-center border-t pt-4">
                        <div className="flex gap-3">
                            <Button onClick={handleSubmit} className="gap-2">
                                <Search className="h-4 w-4" />
                                Apply Filters
                            </Button>
                            <Button onClick={handleReset} variant="outline" className="gap-2 bg-transparent">
                                <RotateCcw className="h-4 w-4" />
                                Reset Filters
                            </Button>
                        </div>
                        <PdfButton
                            chambers={initialChambers}
                            sections={initialSections}
                            dates={initialStartDate && initialEndDate ? [initialStartDate, initialEndDate] : []}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
