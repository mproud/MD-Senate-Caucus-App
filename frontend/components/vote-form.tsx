"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Check, ChevronsUpDown } from "lucide-react"

// ShadCN Combobox building blocks
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"

type Chamber = "SENATE" | "HOUSE" | null

type Committee = {
    id: number
    chamber: Chamber
    abbreviation: string
    name: string
    committeeType: string | null
}

type CommitteesApiResponse = {
    committees: Committee[]
}

interface VoteFormProps {
    billNumber: string
    voteType: "committee" | "floor"
    mode?: "create" | "edit"
    action?: any
    onSaved?: () => void
    trigger?: React.ReactNode
}

// export function VoteForm({ billNumber, voteType }: VoteFormProps) {
export function VoteForm({ billNumber, voteType, mode = "create", action, onSaved, trigger }: VoteFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    // Committee selection uses a combobox:
    // - User sees "FIN - Finance Committee"
    // - We store committeeId and committeeChamber for submission
    const [committeePickerOpen, setCommitteePickerOpen] = useState(false)

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split("T")[0],
        committeeId: null as number | null,
        committeeChamber: null as "HOUSE" | "SENATE" | null,
        chamber: "SENATE" as "HOUSE" | "SENATE",
        voteTypeFloor: "Third Reading" as "Second Reading" | "Third Reading" | "Final Passage",
        result: "",
        yeas: "",
        nays: "",
        absent: "",
        notVoting: "",
        excused: "",
        details: "",
    })

    useEffect(() => {
        if (!open) return
        if (mode !== "edit" || !action) return

        const dateStr = action.actionDate ? new Date(action.actionDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]

        setFormData({
            date: dateStr,
            committeeId: action.committeeId ?? null,
            committeeChamber: action.chamber ?? null,
            chamber: (action.chamber ?? "HOUSE") as "HOUSE" | "SENATE",
            voteTypeFloor: (action.motion ?? (action.dataSource?.voteType ?? "Third Reading")) as any,
            result: action.voteResult ?? "",
            yeas: action.yesVotes != null ? String(action.yesVotes) : "",
            nays: action.noVotes != null ? String(action.noVotes) : "",
            absent: action.absent != null ? String(action.absent) : "",
            notVoting: action.notVoting != null ? String(action.notVoting) : "",
            excused: action.excused != null ? String(action.excused) : "",
            details: action.notes ?? "",
        })
    }, [open, mode, action])

    const [committees, setCommittees] = useState<Committee[]>([])
    const [committeesLoading, setCommitteesLoading] = useState(false)
    const [committeesError, setCommitteesError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return

        let cancelled = false

        ;(async () => {
            try {
                setCommitteesLoading(true)
                setCommitteesError(null)

                // Fetch committees from the API route
                const res = await fetch("/api/committees", { cache: "no-store" })
                if (!res.ok) throw new Error("Failed to fetch committees")

                const committeesData = (await res.json()) as CommitteesApiResponse
                const list = committeesData.committees ?? []

                if (!cancelled) setCommittees(list)
            } catch (e) {
                console.error(e)
                if (!cancelled) setCommitteesError("Failed to load committees")
            } finally {
                if (!cancelled) setCommitteesLoading(false)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [open])

    // Map committeeId -> committee record for quick lookups
    const committeeById = useMemo(() => {
        const m = new Map<number, Committee>()
        for (const c of committees) m.set(c.id, c)
        return m
    }, [committees])

    // Group committees for headings: Senate, House, Other
    // Do not re-sort here; preserve server ordering within each group.
    const grouped = useMemo(() => {
        const senate: Committee[] = []
        const house: Committee[] = []
        const other: Committee[] = []

        for (const c of committees) {
            if (c.chamber === "SENATE") senate.push(c)
            else if (c.chamber === "HOUSE") house.push(c)
            else other.push(c)
        }

        return { senate, house, other }
    }, [committees])

    const selectedCommittee = useMemo(() => {
        if (formData.committeeId == null) return undefined
        return committeeById.get(formData.committeeId)
    }, [formData.committeeId, committeeById])

    // Display label shown to the user in the combobox trigger
    const committeeLabel = useMemo(() => {
        if (!selectedCommittee) return ""
        return `${selectedCommittee.abbreviation} - ${selectedCommittee.name}`
    }, [selectedCommittee])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            if (voteType === "committee") {
                if (formData.committeeId == null || !committeeById.has(formData.committeeId)) {
                    alert("Please select a committee.")
                    return
                }
            }

            const voteData =
                voteType === "committee"
                    ? {
                          type: "committee",
                          date: formData.date,
                          committeeId: formData.committeeId,
                          chamber: formData.committeeChamber,
                          result: formData.result,
                          yeas: Number.parseInt(formData.yeas),
                          nays: Number.parseInt(formData.nays),
                          absent: formData.absent ? Number.parseInt(formData.absent) : undefined,
                          excused: formData.excused ? Number.parseInt(formData.excused) : undefined,
                          details: formData.details || undefined,
                      }
                    : {
                          type: "floor",
                          date: formData.date,
                          chamber: formData.chamber,
                          voteType: formData.voteTypeFloor,
                          result: formData.result,
                          yeas: Number.parseInt(formData.yeas),
                          nays: Number.parseInt(formData.nays),
                          absent: formData.absent ? Number.parseInt(formData.absent) : undefined,
                          excused: formData.excused ? Number.parseInt(formData.excused) : undefined,
                          notVoting: formData.notVoting ? Number.parseInt(formData.notVoting) : undefined,
                      }

            // const response = await fetch(`/api/bills/${billNumber}/votes`, {
            //     method: "POST",
            //     headers: { "Content-Type": "application/json" },
            //     body: JSON.stringify(voteData),
            // })
            const payload =
                mode === "edit"
                    ? {
                        actionId: action?.id,
                        ...voteData,
                        details: formData.details || undefined,
                    }
                    : voteData

            const response = await fetch(`/api/bills/${billNumber}/votes`, {
                method: mode === "edit" ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (!response.ok) throw new Error("Failed to add vote")

            // setOpen(false)
            // setCommitteePickerOpen(false)
            // setFormData({
            //     date: new Date().toISOString().split("T")[0],
            //     committeeId: null,
            //     committeeChamber: null,
            //     chamber: "HOUSE",
            //     voteTypeFloor: "Third Reading",
            //     result: "",
            //     yeas: "",
            //     nays: "",
            //     absent: "",
            //     notVoting: "",
            //     excused: "",
            //     details: "",
            // })
            // router.refresh()
            setOpen(false)
            setCommitteePickerOpen(false)

            if (mode === "create") {
                setFormData({
                    date: new Date().toISOString().split("T")[0],
                    committeeId: null,
                    committeeChamber: null,
                    chamber: "HOUSE",
                    voteTypeFloor: "Third Reading",
                    result: "",
                    yeas: "",
                    nays: "",
                    absent: "",
                    notVoting: "",
                    excused: "",
                    details: "",
                })
            }

            router.refresh()
            if (onSaved) onSaved()
        } catch (error) {
            console.error("Error adding vote:", error)
            alert("Failed to add vote. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ? (
                    trigger
                ) : (
                    <Button size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-2" />
                        Add {voteType === "committee" ? "Committee" : "Floor"} Vote
                    </Button>
                )}
            </DialogTrigger>

            <DialogContent className="max-w-md">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Add {voteType === "committee" ? "Committee" : "Floor"} Vote</DialogTitle>
                        <DialogDescription>Manually record a vote for {billNumber}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                required
                            />
                        </div>

                        {voteType === "committee" ? (
                            <>
                                <div className="space-y-2">
                                    <Label>Committee</Label>

                                    {/* ShadCN combobox: user sees label; we store committeeId + committeeChamber */}
                                    <Popover open={committeePickerOpen} onOpenChange={setCommitteePickerOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={committeePickerOpen}
                                                className="w-full justify-between"
                                                disabled={committeesLoading}
                                            >
                                                {committeeLabel || "Select a committee"}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search committees..." />
                                                <CommandList>
                                                    <CommandEmpty>
                                                        {committeesError
                                                            ? committeesError
                                                            : committeesLoading
                                                              ? "Loading committees..."
                                                              : "No committees found."}
                                                    </CommandEmpty>

                                                    {grouped.senate.length > 0 && (
                                                        <CommandGroup heading="Senate Committees">
                                                            {grouped.senate.map((c) => {
                                                                const label = `${c.abbreviation} - ${c.name}`
                                                                const selected = formData.committeeId === c.id
                                                                return (
                                                                    <CommandItem
                                                                        key={c.id}
                                                                        value={label}
                                                                        onSelect={() => {
                                                                            setFormData((prev) => ({
                                                                                ...prev,
                                                                                committeeId: c.id,
                                                                                committeeChamber:
                                                                                    c.chamber === "HOUSE" || c.chamber === "SENATE" ? c.chamber : null,
                                                                            }))
                                                                            setCommitteePickerOpen(false)
                                                                        }}
                                                                    >
                                                                        <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />
                                                                        {label}
                                                                    </CommandItem>
                                                                )
                                                            })}
                                                        </CommandGroup>
                                                    )}

                                                    {grouped.house.length > 0 && (
                                                        <CommandGroup heading="House Committees">
                                                            {grouped.house.map((c) => {
                                                                const label = `${c.abbreviation} - ${c.name}`
                                                                const selected = formData.committeeId === c.id
                                                                return (
                                                                    <CommandItem
                                                                        key={c.id}
                                                                        value={label}
                                                                        onSelect={() => {
                                                                            setFormData((prev) => ({
                                                                                ...prev,
                                                                                committeeId: c.id,
                                                                                committeeChamber:
                                                                                    c.chamber === "HOUSE" || c.chamber === "SENATE" ? c.chamber : null,
                                                                            }))
                                                                            setCommitteePickerOpen(false)
                                                                        }}
                                                                    >
                                                                        <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />
                                                                        {label}
                                                                    </CommandItem>
                                                                )
                                                            })}
                                                        </CommandGroup>
                                                    )}

                                                    {grouped.other.length > 0 && (
                                                        <CommandGroup heading="Other Committees">
                                                            {grouped.other.map((c) => {
                                                                const label = `${c.abbreviation} - ${c.name}`
                                                                const selected = formData.committeeId === c.id
                                                                return (
                                                                    <CommandItem
                                                                        key={c.id}
                                                                        value={label}
                                                                        onSelect={() => {
                                                                            setFormData((prev) => ({
                                                                                ...prev,
                                                                                committeeId: c.id,
                                                                                committeeChamber:
                                                                                    c.chamber === "HOUSE" || c.chamber === "SENATE" ? c.chamber : null,
                                                                            }))
                                                                            setCommitteePickerOpen(false)
                                                                        }}
                                                                    >
                                                                        <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />
                                                                        {label}
                                                                    </CommandItem>
                                                                )
                                                            })}
                                                        </CommandGroup>
                                                    )}
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>

                                    <p className="text-xs text-muted-foreground">
                                        {committeesLoading
                                            ? "Loading committees..."
                                            : committeesError
                                              ? committeesError
                                              : "Select a committee (stores committeeId and chamber internally)."}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="result">Result</Label>
                                    <Select
                                        value={formData.result}
                                        onValueChange={(value) => setFormData({ ...formData, result: value })}
                                        required
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select result" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Favorable">Favorable</SelectItem>
                                            <SelectItem value="Unfavorable">Unfavorable</SelectItem>
                                            <SelectItem value="Favorable with Amendments">Favorable with Amendments</SelectItem>
                                            <SelectItem value="Reassigned">Reassigned to another Committee</SelectItem>
                                            <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="chamber">Chamber</Label>
                                    <Select
                                        value={formData.chamber}
                                        onValueChange={(value: "HOUSE" | "SENATE") => setFormData({ ...formData, chamber: value })}
                                        required
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="HOUSE">House</SelectItem>
                                            <SelectItem value="SENATE">Senate</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="voteType">Vote Type</Label>
                                    <Select
                                        value={formData.voteTypeFloor}
                                        onValueChange={(value: any) => setFormData({ ...formData, voteTypeFloor: value })}
                                        required
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Second Reading">Second Reading</SelectItem>
                                            <SelectItem value="Third Reading">Third Reading</SelectItem>
                                            <SelectItem value="Final Passage">Final Passage (other types?)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="resultFloor">Result</Label>
                                    <Select
                                        value={formData.result}
                                        onValueChange={(value) => setFormData({ ...formData, result: value })}
                                        required
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select result" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Passed">Passed</SelectItem>
                                            <SelectItem value="Failed">Failed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="yeas">Yeas</Label>
                                <Input
                                    id="yeas"
                                    type="number"
                                    min="0"
                                    value={formData.yeas}
                                    onChange={(e) => setFormData({ ...formData, yeas: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="nays">Nays</Label>
                                <Input
                                    id="nays"
                                    type="number"
                                    min="0"
                                    value={formData.nays}
                                    onChange={(e) => setFormData({ ...formData, nays: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="absent">Absent (optional)</Label>
                                <Input
                                    id="absent"
                                    type="number"
                                    min="0"
                                    value={formData.absent}
                                    onChange={(e) => setFormData({ ...formData, absent: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notVoting">Excused (optional)</Label>
                                <Input
                                    id="excused"
                                    type="number"
                                    min="0"
                                    value={formData.excused}
                                    onChange={(e) => setFormData({ ...formData, excused: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="details">Details (optional)</Label>
                            <Textarea
                                id="details"
                                placeholder="Additional notes about the vote..."
                                value={formData.details}
                                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Adding..." : "Add Vote"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
