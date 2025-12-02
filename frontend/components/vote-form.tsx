"use client"

import type React from "react"

import { Fragment, useState } from "react"
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
import { Plus } from "lucide-react"

interface VoteFormProps {
    billNumber: string
    voteType: "committee" | "floor"
}

export function VoteForm({ billNumber, voteType }: VoteFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split("T")[0],
        committee: "",
        chamber: "HOUSE" as "HOUSE" | "SENATE",
        voteTypeFloor: "Third Reading" as "Second Reading" | "Third Reading" | "Final Passage",
        result: "",
        yeas: "",
        nays: "",
        absent: "",
        notVoting: "",
        details: "",
    })

    const committees = [
        { name: "Budget and Taxation", abbr: "B&T" },
        { name: "Economic Matters", abbr: "ECM" },
        { name: "Education, Energy, and the Environment", abbr: "EEE" },
        { name: "Environment and Transportation", abbr: "ENV" },
        { name: "Finance", abbr: "FIN" },
        { name: "Health and Government Operations", abbr: "HGO" },
        { name: "Judiciary", abbr: "JPR" },
        { name: "Ways and Means", abbr: "W&M" },
        { name: "Appropriations", abbr: "APP" },
        { name: "Rules and Executive Nominations", abbr: "REN" },
    ]

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const voteData =
                voteType === "committee"
                    ? {
                            type: "committee",
                            date: formData.date,
                            committee: formData.committee,
                            result: formData.result,
                            yeas: Number.parseInt(formData.yeas),
                            nays: Number.parseInt(formData.nays),
                            absent: formData.absent ? Number.parseInt(formData.absent) : undefined,
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
                            notVoting: formData.notVoting ? Number.parseInt(formData.notVoting) : undefined,
                        }

            const response = await fetch(`/api/bills/${billNumber}/votes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(voteData),
            })

            if (!response.ok) throw new Error("Failed to add vote")

            setOpen(false)
            setFormData({
                date: new Date().toISOString().split("T")[0],
                committee: "",
                chamber: "HOUSE",
                voteTypeFloor: "Third Reading",
                result: "",
                yeas: "",
                nays: "",
                absent: "",
                notVoting: "",
                details: "",
            })
            router.refresh()
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
                <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add {voteType === "committee" ? "Committee" : "Floor"} Vote
                </Button>
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
                                    <Label htmlFor="committee">Committee</Label>
                                    <Input
                                        id="committee"
                                        list="committees"
                                        placeholder="e.g., Judiciary or JPR"
                                        value={formData.committee}
                                        onChange={(e) => setFormData({ ...formData, committee: e.target.value })}
                                        required
                                    />
                                    <datalist id="committees">
                                        {committees.map((committee) => (
                                            <Fragment key={committee.abbr}>
                                                <option key={committee.name} value={committee.name} />
                                                <option key={committee.abbr} value={`${committee.abbr} - ${committee.name}`} />
                                            </Fragment>
                                        ))}
                                    </datalist>
                                    <p className="text-xs text-muted-foreground">
                                        Type full name or abbreviation (e.g., "JPR" for Judiciary)
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
                                            <SelectItem value="No Recommendation">No Recommendation</SelectItem>
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
                                            <SelectItem value="Final Passage">Final Passage</SelectItem>
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
                                    required
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
                                    required
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

                            {voteType === "floor" && (
                                <div className="space-y-2">
                                    <Label htmlFor="notVoting">Not Voting (optional)</Label>
                                    <Input
                                        id="notVoting"
                                        type="number"
                                        min="0"
                                        value={formData.notVoting}
                                        onChange={(e) => setFormData({ ...formData, notVoting: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        {voteType === "committee" && (
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
                        )}
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
