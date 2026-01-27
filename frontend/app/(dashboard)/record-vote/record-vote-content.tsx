"use client"

import React, { useEffect, useRef } from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save, RotateCcw, User, Check, X, Minus, Keyboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { Prisma, type Bill } from "@prisma/client"

type VoteValue = "yes" | "no" | "other" | null

interface MemberVote {
    memberId: number
    vote: VoteValue
}

type CommitteeWithMembers = Prisma.CommitteeGetPayload<{
    include: {
        members: {
            include: {
                legislator: true
            }
        }
    }
}>

interface RecordVoteContentProps {
    bill: Bill
    committee: CommitteeWithMembers
}

const Loading = () => null

export default function RecordVoteContent( props: RecordVoteContentProps ) {
    const { bill, committee } = props

    const router = useRouter()
    const [memberVotes, setMemberVotes] = useState<MemberVote[]>([])
    const [notes, setNotes] = useState("")
    const [voteResult, setVoteResult] = useState<string>("Favorable")
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [rapidEntryMode, setRapidEntryMode] = useState(false)
    const [currentMemberIndex, setCurrentMemberIndex] = useState(0)
    const rapidEntryRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!committee?.members?.length) return

        setMemberVotes(
            committee.members.map((m) => ({
                memberId: m.id,
                vote: null,
            }))
        )
    }, [committee])

    const setVote = (memberId: number, vote: VoteValue) => {
        setMemberVotes((prev) =>
            prev.map((mv) => (mv.memberId === memberId ? { ...mv, vote } : mv))
        )
    }

    const setAllVotes = (vote: VoteValue) => {
        setMemberVotes((prev) => prev.map((mv) => ({ ...mv, vote })))
    }

    const setPartyVotes = (rawParty: "D" | "R", vote: VoteValue) => {
        if (!committee) return
        
        let party

        if ( rawParty == "D" ) {
            party = "Democrat"
        } else {
            party = "Republican"
        }

        setMemberVotes((prev) =>
            prev.map((mv) => {
                const member = committee.members.find((m) => m.id === mv.memberId)
                if (member!.legislator.party === party) {
                    return { ...mv, vote }
                }
                return mv
            })
        )
    }

    const resetVotes = () => {
        setMemberVotes((prev) => prev.map((mv) => ({ ...mv, vote: null })))
        setNotes("")
        setVoteResult("favorable")
        setCurrentMemberIndex(0)
    }

    // Rapid entry keyboard handler
    useEffect(() => {
        if (!rapidEntryMode || !committee) return

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't capture if typing in an input or textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return
            }

            const key = e.key.toLowerCase()
            let vote: VoteValue = null

            if (key === "y") vote = "yes"
            else if (key === "n") vote = "no"
            else if (key === "o" || key === "a") vote = "other" // 'a' for absent
            else if (key === "arrowdown" || key === "j") {
                e.preventDefault()
                setCurrentMemberIndex((prev) => Math.min(prev + 1, committee.members.length - 1))
                return
            } else if (key === "arrowup" || key === "k") {
                e.preventDefault()
                setCurrentMemberIndex((prev) => Math.max(prev - 1, 0))
                return
            } else if (key === "escape") {
                setRapidEntryMode(false)
                return
            }

            if (vote !== null) {
                e.preventDefault()
                const memberId = committee.members[currentMemberIndex]?.id
                if (memberId) {
                    setVote(memberId, vote)
                    // Auto-advance to next member
                    if (currentMemberIndex < committee.members.length - 1) {
                        setCurrentMemberIndex((prev) => prev + 1)
                    }
                }
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [rapidEntryMode, committee, currentMemberIndex])

    // Scroll current member into view during rapid entry
    useEffect(() => {
        if (rapidEntryMode && rapidEntryRef.current) {
            const memberElements = rapidEntryRef.current.querySelectorAll("[data-member-index]")
            const currentElement = memberElements[currentMemberIndex] as HTMLElement
            if (currentElement) {
                currentElement.scrollIntoView({ behavior: "smooth", block: "center" })
            }
        }
    }, [currentMemberIndex, rapidEntryMode])

    const handleSave = async () => {
        if (!bill || !committee) return

        setIsSaving(true)
        try {
            const yeas = memberVotes.filter((v) => v.vote === "yes").length
            const nays = memberVotes.filter((v) => v.vote === "no").length
            const other = memberVotes.filter((v) => v.vote === "other").length

            const voteData = {
                type: "committee",
                date: new Date().toISOString().split("T")[0],
                committee: committee.name,
                committeeId: committee.id,
                result: voteResult,
                yeas,
                nays,
                absent: other,
                details: notes,
                memberVotes: memberVotes.map((mv) => {
                    const member = committee.members.find((m) => m.id === mv.memberId)
                    return {
                        memberId: mv.memberId,
                        legislatorId: member?.legislator.id,
                        memberName: member?.legislator.fullName,
                        vote: mv.vote,
                    }
                }),
            }

            const response = await fetch(`/api/bills/${bill.billNumber}/votes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(voteData),
            })

            if (response.ok) {
                router.push(`/bills/${bill.billNumber}?activeTab=votes`)
            }
        } catch (err) {
            setError("Failed to save vote")
        } finally {
            setIsSaving(false)
        }
    }

    const voteCounts = {
        yes: memberVotes.filter((v) => v.vote === "yes").length,
        no: memberVotes.filter((v) => v.vote === "no").length,
        other: memberVotes.filter((v) => v.vote === "other").length,
        unset: memberVotes.filter((v) => v.vote === null).length,
    }

    return (
        <>
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Record Committee Vote</h1>
                <p className="text-muted-foreground mt-2">
                    Manually record a committee vote before the MGA website updates
                </p>
            </div>

            {/* Bill Info and Committee */}
            {bill && (
                <>
                    <Card className="mb-6">
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        {bill.billNumber}
                                        {bill.isEmergency && (
                                            <Badge variant="destructive">Emergency</Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                        {bill.shortTitle}
                                    </CardDescription>
                                </div>
                                {committee && (
                                    <Badge variant="outline" className="text-sm">
                                        {committee.abbreviation} - {committee.name}
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Sponsor:</span>
                                    <p className="font-medium">{bill.sponsorDisplay}</p>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Status:</span>
                                    <p className="font-medium">{bill.statusDesc || "N/A"}</p>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Chamber:</span>
                                    <p className="font-medium">{bill.chamber}</p>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Crossfile:</span>
                                    <p className="font-medium">{bill.crossFileExternalId || "None"}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {committee ? (
                        <>
                            {/* Vote Result Selection */}
                            <Card className="mb-6">
                                <CardHeader>
                                    <CardTitle>Vote Outcome</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-4 items-center">
                                        <div className="flex-1 min-w-[200px]">
                                            <Label htmlFor="vote-result">Committee Result</Label>
                                            <Select value={voteResult} onValueChange={setVoteResult}>
                                                <SelectTrigger id="vote-result" className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Favorable">Favorable</SelectItem>
                                                    <SelectItem value="Favorable with Amendments">Favorable with Amendments</SelectItem>
                                                    <SelectItem value="Unfavorable">Unfavorable</SelectItem>
                                                    <SelectItem value="Other">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex gap-2">
                                            <Badge variant="default" className="bg-green-600">
                                                Yes: {voteCounts.yes}
                                            </Badge>
                                            <Badge variant="destructive">No: {voteCounts.no}</Badge>
                                            <Badge variant="secondary">Other: {voteCounts.other}</Badge>
                                            <Badge variant="outline">Unset: {voteCounts.unset}</Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Committee Members */}
                            <Card className="mb-6">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Committee Members</CardTitle>
                                            <CardDescription>
                                                Record each member&apos;s vote - {committee.members.length} members
                                            </CardDescription>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant={rapidEntryMode ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => {
                                                    setRapidEntryMode(!rapidEntryMode)
                                                    setCurrentMemberIndex(0)
                                                }}
                                            >
                                                <Keyboard className="h-4 w-4 mr-1" />
                                                {rapidEntryMode ? "Exit Rapid Entry" : "Rapid Entry (Y/N/O)"}
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => setAllVotes("yes")}>
                                                <Check className="h-4 w-4 mr-1" />
                                                All Yes
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => setAllVotes("no")}>
                                                <X className="h-4 w-4 mr-1" />
                                                All No
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={resetVotes}>
                                                <RotateCcw className="h-4 w-4 mr-1" />
                                                Reset
                                            </Button>
                                        </div>
                                    </div>
                                    {/* Party-line voting buttons */}
                                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                                        <span className="text-sm text-muted-foreground self-center mr-2">Quick Vote by Party:</span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setPartyVotes("D", "yes")
                                                setPartyVotes("R", "no")
                                            }}
                                            className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                        >
                                            Dems Yes / GOP No
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setPartyVotes("R", "yes")
                                                setPartyVotes("D", "no")
                                            }}
                                            className="border-red-300 text-red-700 hover:bg-red-50"
                                        >
                                            Dems No / GOP Yes
                                        </Button>
                                    </div>
                                    {rapidEntryMode && (
                                        <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
                                            <p className="font-medium">Rapid Entry Mode Active</p>
                                            <p className="text-muted-foreground">
                                                Press <kbd className="px-1.5 py-0.5 bg-background rounded border text-xs mx-1">Y</kbd> for Yes,
                                                <kbd className="px-1.5 py-0.5 bg-background rounded border text-xs mx-1">N</kbd> for No,
                                                <kbd className="px-1.5 py-0.5 bg-background rounded border text-xs mx-1">O</kbd> for Other/Absent.
                                                Use <kbd className="px-1.5 py-0.5 bg-background rounded border text-xs mx-1">Arrow Keys</kbd> or
                                                <kbd className="px-1.5 py-0.5 bg-background rounded border text-xs mx-1">J/K</kbd> to navigate.
                                                Press <kbd className="px-1.5 py-0.5 bg-background rounded border text-xs mx-1">Esc</kbd> to exit.
                                            </p>
                                        </div>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    <div ref={rapidEntryRef} className="grid grid-cols-1 gap-3">
                                        {committee.members.map((member, index) => {
                                            const memberVote = memberVotes.find((mv) => mv.memberId === member.id)
                                            const isCurrentRapidEntry = rapidEntryMode && index === currentMemberIndex

                                            return (
                                                <div
                                                    key={member.id}
                                                    data-member-index={index}
                                                    onClick={() => rapidEntryMode && setCurrentMemberIndex(index)}
                                                    className={cn(
                                                        "flex items-center justify-between p-3 rounded-lg border transition-colors",
                                                        memberVote?.vote === "yes" && "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
                                                        memberVote?.vote === "no" && "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
                                                        memberVote?.vote === "other" && "bg-gray-50 border-gray-200 dark:bg-gray-950/20 dark:border-gray-700",
                                                        isCurrentRapidEntry && "ring-2 ring-primary ring-offset-2",
                                                        rapidEntryMode && "cursor-pointer"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-4 w-4 text-muted-foreground" />
                                                        <div>
                                                            <p className="font-medium text-sm">{member.legislator.fullName}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {member.legislator.party === "Democrat" ? "Democrat" : "Republican"} - District {member.legislator.district}
                                                                {member.role == "CHAIR" && " Chair"}
                                                                {member.role == "VICE_CHAIR" && " Vice Chair"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant={memberVote?.vote === "yes" ? "default" : "outline"}
                                                            className={cn(
                                                                "h-8 w-8 p-0",
                                                                memberVote?.vote === "yes" && "bg-green-600 hover:bg-green-700"
                                                            )}
                                                            onClick={() => setVote(member.id, memberVote?.vote === "yes" ? null : "yes")}
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant={memberVote?.vote === "no" ? "default" : "outline"}
                                                            className={cn(
                                                                "h-8 w-8 p-0",
                                                                memberVote?.vote === "no" && "bg-red-600 hover:bg-red-700"
                                                            )}
                                                            onClick={() => setVote(member.id, memberVote?.vote === "no" ? null : "no")}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant={memberVote?.vote === "other" ? "default" : "outline"}
                                                            className={cn(
                                                                "h-8 w-8 p-0",
                                                                memberVote?.vote === "other" && "bg-gray-600 hover:bg-gray-700"
                                                            )}
                                                            onClick={() => setVote(member.id, memberVote?.vote === "other" ? null : "other")}
                                                        >
                                                            <Minus className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Notes */}
                            <Card className="mb-6">
                                <CardHeader>
                                    <CardTitle>Notes</CardTitle>
                                    <CardDescription>Add any additional information about this vote</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Textarea
                                        placeholder="Enter notes about amendments, debate, or other relevant details..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={4}
                                    />
                                </CardContent>
                            </Card>

                            {/* Actions */}
                            <div className="flex justify-end gap-4">
                                <Button variant="outline" onClick={resetVotes}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Reset All
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving || voteCounts.unset === committee.members.length}>
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-2" />
                                    )}
                                    Save Vote Record
                                </Button>
                            </div>
                        </>
                    ) : (
                        <Card>
                            <CardContent className="py-8 text-center text-muted-foreground">
                                No committee information available for this bill
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </>
    )
}
