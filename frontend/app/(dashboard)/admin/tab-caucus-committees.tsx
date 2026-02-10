"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Loader2, Plus, Save, Trash2, UserPlus, XCircle } from "lucide-react"

type Chamber = "SENATE" | "HOUSE" | "JOINT"

type Legislator = {
    id: number
    fullName: string
    party: string
    district: string
    isActive: boolean
}

type CommitteeMember = {
    id: number
    legislatorId: number
    role: string | null
    startDate: string | null
    endDate: string | null
    legislator: Legislator
}

type Committee = {
    id: number
    name: string
    abbreviation: string | null
    chamber: Chamber | null
    committeeType: string | null
    members: CommitteeMember[]
}

type CaucusCommitteesResponse = {
    committees: Committee[]
}

type CreateCaucusCommitteeResponse = {
    committee?: Committee
}

type LegislatorSearchResponse = {
    legislators: Legislator[]
}

const todayIsoDate = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
}

const toIsoDateTimeOrNull = (dateStr: string | null) => {
    if (!dateStr || dateStr.trim() === "") return null
    // Store as midnight local converted to ISO, consistent and easy to reason about
    const d = new Date(`${dateStr}T00:00:00`)
    return d.toISOString()
}

export const TabCaucusCommittees = () => {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [committees, setCommittees] = useState<Committee[]>([])
    const [selectedCommitteeId, setSelectedCommitteeId] = useState<number | null>(null)

    const [filter, setFilter] = useState("")
    const [editName, setEditName] = useState("")
    const [editAbbr, setEditAbbr] = useState("")
    const [editChamber, setEditChamber] = useState<Chamber | null>(null)

    const [createOpen, setCreateOpen] = useState(false)
    const [createName, setCreateName] = useState("")
    const [createAbbr, setCreateAbbr] = useState("")
    const [createChamber, setCreateChamber] = useState<Chamber | null>(null)
    const [createSaving, setCreateSaving] = useState(false)

    const [memberDialogOpen, setMemberDialogOpen] = useState(false)
    const [memberSearch, setMemberSearch] = useState("")
    const [memberResults, setMemberResults] = useState<Legislator[]>([])
    const [memberSearching, setMemberSearching] = useState(false)
    const [selectedLegislatorId, setSelectedLegislatorId] = useState<number | null>(null)
    const [memberRole, setMemberRole] = useState("Member")
    const [memberStartDate, setMemberStartDate] = useState(todayIsoDate())
    const [memberAdding, setMemberAdding] = useState(false)

    const selectedCommittee = useMemo(() => {
        return committees.find((c) => c.id === selectedCommitteeId) || null
    }, [committees, selectedCommitteeId])

    const visibleCommittees = useMemo(() => {
        const q = filter.trim().toLowerCase()
        if (!q) return committees
        return committees.filter((c) => {
            const name = c.name.toLowerCase()
            const abbr = (c.abbreviation || "").toLowerCase()
            return name.includes(q) || abbr.includes(q)
        })
    }, [committees, filter])

    const activeMembers = useMemo(() => {
        if (!selectedCommittee) return []
        return selectedCommittee.members.filter((m) => !m.endDate)
    }, [selectedCommittee])

    const inactiveMembers = useMemo(() => {
        if (!selectedCommittee) return []
        return selectedCommittee.members.filter((m) => Boolean(m.endDate))
    }, [selectedCommittee])

    const loadCommittees = async (selectId?: number) => {
        setLoading(true)
        try {
            const res = await fetch("/api/admin/caucus-committees")
            if (!res.ok) return
            const data = (await res.json()) as Partial<CaucusCommitteesResponse>
            const next: Committee[] = data.committees || []
            setCommittees(next)

            const targetId =
                typeof selectId === "number"
                    ? selectId
                    : selectedCommitteeId && next.some((c) => c.id === selectedCommitteeId)
                        ? selectedCommitteeId
                        : next[0]?.id ?? null

            setSelectedCommitteeId(targetId)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadCommittees()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!selectedCommittee) return
        setEditName(selectedCommittee.name)
        setEditAbbr(selectedCommittee.abbreviation || "")
        setEditChamber(selectedCommittee.chamber ?? null)
    }, [selectedCommitteeId]) // intentional: refresh form when selection changes

    const handleSaveCommittee = async () => {
        if (!selectedCommittee) return
        if (editName.trim() === "") return

        setSaving(true)
        try {
            const res = await fetch(`/api/admin/caucus-committees/${selectedCommittee.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: editName.trim(),
                    abbreviation: editAbbr.trim() === "" ? null : editAbbr.trim(),
                    chamber: editChamber,
                }),
            })

            if (res.ok) {
                await loadCommittees(selectedCommittee.id)
            }
        } finally {
            setSaving(false)
        }
    }

    const handleCreateCommittee = async () => {
        if (createName.trim() === "") return

        setCreateSaving(true)
        try {
            const res = await fetch("/api/admin/caucus-committees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: createName.trim(),
                    abbreviation: createAbbr.trim() === "" ? null : createAbbr.trim(),
                    chamber: createChamber,
                }),
            })

            if (res.ok) {
                const created = (await res.json()) as CreateCaucusCommitteeResponse
                setCreateOpen(false)
                setCreateName("")
                setCreateAbbr("")
                setCreateChamber(null)
                await loadCommittees(created.committee?.id)
            }
        } finally {
            setCreateSaving(false)
        }
    }

    const searchLegislators = async (q: string) => {
        const query = q.trim()
        if (query.length < 2) {
            setMemberResults([])
            return
        }

        setMemberSearching(true)
        try {
            const res = await fetch(`/api/admin/legislators?query=${encodeURIComponent(query)}`)
            if (!res.ok) return
            const data = (await res.json()) as LegislatorSearchResponse
            setMemberResults(data.legislators || [])
        } finally {
            setMemberSearching(false)
        }
    }

    useEffect(() => {
        const t = setTimeout(() => searchLegislators(memberSearch), 250)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberSearch])

    const openAddMember = () => {
        if (!selectedCommittee) return
        setMemberDialogOpen(true)
        setMemberSearch("")
        setMemberResults([])
        setSelectedLegislatorId(null)
        setMemberRole("Member")
        setMemberStartDate(todayIsoDate())
    }

    const handleAddMember = async () => {
        if (!selectedCommittee) return
        if (!selectedLegislatorId) return

        setMemberAdding(true)
        try {
            const res = await fetch(`/api/admin/caucus-committees/${selectedCommittee.id}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    legislatorId: selectedLegislatorId,
                    role: memberRole.trim() === "" ? null : memberRole.trim(),
                    startDate: toIsoDateTimeOrNull(memberStartDate),
                }),
            })

            if (res.ok) {
                setMemberDialogOpen(false)
                await loadCommittees(selectedCommittee.id)
            }
        } finally {
            setMemberAdding(false)
        }
    }

    const handleEndMembership = async (memberId: number) => {
        if (!selectedCommittee) return

        const endDate = new Date().toISOString()

        const res = await fetch(
            `/api/admin/caucus-committees/${selectedCommittee.id}/members/${memberId}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endDate }),
            }
        )

        if (res.ok) {
            await loadCommittees(selectedCommittee.id)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading caucuses...
            </div>
        )
    }

    return (
        <div className="grid gap-6 md:grid-cols-12">
            <Card className="md:col-span-4">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Caucuses</CardTitle>
                        <CardDescription>Committees with committeeType CAUCUS</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New
                    </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter by name or abbreviation"
                    />

                    {visibleCommittees.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-6 text-center">
                            No caucuses found
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {visibleCommittees.map((c) => {
                                const selected = c.id === selectedCommitteeId
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setSelectedCommitteeId(c.id)}
                                        className={[
                                            "w-full text-left rounded-md border px-3 py-2 transition",
                                            selected ? "bg-muted" : "hover:bg-muted/50",
                                        ].join(" ")}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-medium truncate">{c.name}</div>
                                                <div className="text-xs text-muted-foreground flex gap-2">
                                                    {c.abbreviation ? <span>{c.abbreviation}</span> : <span className="italic">No abbreviation</span>}
                                                    {c.chamber ? <Badge variant="outline">{c.chamber}</Badge> : <Badge variant="secondary">No chamber</Badge>}
                                                </div>
                                            </div>
                                            <Badge variant="outline">{c.members.filter((m) => !m.endDate).length}</Badge>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="md:col-span-8 space-y-6">
                {!selectedCommittee ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Select a caucus</CardTitle>
                            <CardDescription>Choose a caucus on the left to edit details and manage members</CardDescription>
                        </CardHeader>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Edit Caucus</CardTitle>
                                <CardDescription>Update basic committee fields (committeeType stays CAUCUS)</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2 md:col-span-2">
                                        <Label>Name</Label>
                                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Abbreviation</Label>
                                        <Input value={editAbbr} onChange={(e) => setEditAbbr(e.target.value)} placeholder="Optional" />
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Chamber</Label>
                                        <Select
                                            value={editChamber ?? "NONE"}
                                            onValueChange={(v) => setEditChamber(v === "NONE" ? null : (v as Chamber))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="None" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">None</SelectItem>
                                                <SelectItem value="HOUSE">HOUSE</SelectItem>
                                                <SelectItem value="SENATE">SENATE</SelectItem>
                                                <SelectItem value="JOINT">JOINT</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Committee Type</Label>
                                        <Input value="CAUCUS" disabled />
                                    </div>

                                    <div className="flex items-end justify-end">
                                        <Button onClick={handleSaveCommittee} disabled={saving || editName.trim() === ""}>
                                            <Save className="h-4 w-4 mr-2" />
                                            {saving ? "Saving..." : "Save"}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Members</CardTitle>
                                    <CardDescription>Adding creates a new committee_members row, removing sets endDate</CardDescription>
                                </div>
                                <Button onClick={openAddMember}>
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Add Member
                                </Button>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <div className="font-medium">Active</div>
                                    {activeMembers.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No active members</div>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Legislator</TableHead>
                                                    <TableHead>Role</TableHead>
                                                    <TableHead>Start</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {activeMembers.map((m) => (
                                                    <TableRow key={m.id}>
                                                        <TableCell className="font-medium">
                                                            <div className="flex items-center gap-2">
                                                                <span>{m.legislator.fullName}</span>
                                                                <Badge variant="outline">{m.legislator.party}</Badge>
                                                                <Badge variant="secondary">{m.legislator.district}</Badge>
                                                                {!m.legislator.isActive && (
                                                                    <Badge variant="destructive">
                                                                        <XCircle className="h-3 w-3 mr-1" />
                                                                        Inactive
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{m.role || "-"}</TableCell>
                                                        <TableCell>{m.startDate ? new Date(m.startDate).toLocaleDateString() : "-"}</TableCell>
                                                        <TableCell className="text-right">
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button variant="ghost" size="sm" className="text-destructive">
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Remove member</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            This will set endDate on the membership record (history is preserved).
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                        <AlertDialogAction
                                                                            onClick={() => handleEndMembership(m.id)}
                                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                        >
                                                                            Remove
                                                                        </AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <div className="font-medium">Inactive</div>
                                    {inactiveMembers.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No inactive members</div>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Legislator</TableHead>
                                                    <TableHead>Role</TableHead>
                                                    <TableHead>Start</TableHead>
                                                    <TableHead>End</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {inactiveMembers.map((m) => (
                                                    <TableRow key={m.id}>
                                                        <TableCell className="font-medium">{m.legislator.fullName}</TableCell>
                                                        <TableCell>{m.role || "-"}</TableCell>
                                                        <TableCell>{m.startDate ? new Date(m.startDate).toLocaleDateString() : "-"}</TableCell>
                                                        <TableCell>{m.endDate ? new Date(m.endDate).toLocaleDateString() : "-"}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Create caucus dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Caucus</DialogTitle>
                        <DialogDescription>This creates a Committee row with committeeType = CAUCUS</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Example: Rural Caucus" />
                        </div>

                        <div className="space-y-2">
                            <Label>Abbreviation</Label>
                            <Input value={createAbbr} onChange={(e) => setCreateAbbr(e.target.value)} placeholder="Optional" />
                        </div>

                        <div className="space-y-2">
                            <Label>Chamber</Label>
                            <Select
                                value={createChamber ?? "NONE"}
                                onValueChange={(v) => setCreateChamber(v === "NONE" ? null : (v as Chamber))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="NONE">None</SelectItem>
                                    <SelectItem value="HOUSE">HOUSE</SelectItem>
                                    <SelectItem value="SENATE">SENATE</SelectItem>
                                    <SelectItem value="JOINT">JOINT</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateCommittee} disabled={createSaving || createName.trim() === ""}>
                            {createSaving ? "Creating..." : "Create"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add member dialog */}
            <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add Member</DialogTitle>
                        <DialogDescription>Creates a new committee_members row with startDate and endDate = null</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Search Legislators</Label>
                            <Input
                                value={memberSearch}
                                onChange={(e) => setMemberSearch(e.target.value)}
                                placeholder="Type at least 2 characters"
                            />
                            {memberSearching && (
                                <div className="text-sm text-muted-foreground flex items-center">
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Searching...
                                </div>
                            )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="md:col-span-2 space-y-2">
                                <Label>Pick a legislator</Label>
                                <div className="max-h-56 overflow-auto rounded-md border">
                                    {memberResults.length === 0 ? (
                                        <div className="p-3 text-sm text-muted-foreground">
                                            {memberSearch.trim().length < 2 ? "Start typing to search" : "No results"}
                                        </div>
                                    ) : (
                                        <div className="divide-y">
                                            {memberResults.map((l) => {
                                                const selected = selectedLegislatorId === l.id
                                                return (
                                                    <button
                                                        key={l.id}
                                                        type="button"
                                                        onClick={() => setSelectedLegislatorId(l.id)}
                                                        className={[
                                                            "w-full text-left px-3 py-2 hover:bg-muted/50",
                                                            selected ? "bg-muted" : "",
                                                        ].join(" ")}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="font-medium truncate">{l.fullName}</div>
                                                                <div className="text-xs text-muted-foreground flex gap-2">
                                                                    <span>{l.party}</span>
                                                                    <span>{l.district}</span>
                                                                </div>
                                                            </div>
                                                            {!l.isActive && (
                                                                <Badge variant="destructive" className="flex-shrink-0">
                                                                    Inactive
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Input value={memberRole} onChange={(e) => setMemberRole(e.target.value)} />
                                </div>

                                <div className="space-y-2">
                                    <Label>Start Date</Label>
                                    <Input
                                        type="date"
                                        value={memberStartDate}
                                        onChange={(e) => setMemberStartDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleAddMember} disabled={memberAdding || !selectedLegislatorId}>
                            {memberAdding ? "Adding..." : "Add Member"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
