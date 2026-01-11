"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Pin, Loader2 } from "lucide-react"
import type { BillNote as Note } from "@prisma/client"
import { toast } from "sonner"

interface NotesPanelProps {
    billNumber: string
    initialNotes: Note[]
}

export function NotesPanel({ billNumber, initialNotes }: NotesPanelProps) {
    const [notes, setNotes] = useState<Note[]>(initialNotes)
    const [newNoteBody, setNewNoteBody] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!newNoteBody.trim()) {
            toast.error("Error", {
                description: "Note body cannot be empty",
            })
            return
        }

        setIsSubmitting(true)

        try {
            const response = await fetch(`/api/bills/${billNumber}/notes`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    content: newNoteBody,
                    pinned: false,
                }),
            })

            if (!response.ok) {
                throw new Error("Failed to create note")
            }

            const newNote: Note = await response.json()

            // Optimistic update
            setNotes([newNote, ...notes])
            setNewNoteBody("")

            toast("Note Added", {
                description: "Your note has been saved successfully.",
            })
        } catch (error) {
            toast.error("Error", {
                description: error instanceof Error ? error.message : "Failed to create note",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Add Note</CardTitle>
                    <CardDescription>This note will be visible to all users.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="note-body">Note</Label>
                            <Textarea
                                id="note-body"
                                placeholder="Enter your note here..."
                                value={newNoteBody}
                                onChange={(e) => setNewNoteBody(e.target.value)}
                                rows={4}
                                disabled={isSubmitting}
                            />
                        </div>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Add Note"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {notes.length === 0 ? (
                    <Card key="no-notes">
                        <CardContent className="py-8">
                            <div className="text-center text-muted-foreground">
                                <p className="text-sm">No notes yet. Add the first note above.</p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    notes
                        .slice() // avoid mutating the original notes array
                        .filter((note: any) => note.visibility !== "HIDDEN")
                        .sort((a, b) => {
                            const aPinned = a.visibility === "PINNED"
                            const bPinned = b.visibility === "PINNED"

                            if (aPinned !== bPinned) return aPinned ? -1 : 1

                            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                        })
                        .map((note) => {
                            const isPinned = note.visibility === "PINNED"

                            return (
                                <Card
                                    key={note.id}
                                    className={
                                    isPinned
                                        ? "border-muted-foreground/40 bg-muted/70"
                                        : undefined
                                    }
                                >
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-4">
                                            {/* Left side: date + author */}
                                            <div className="flex-1">
                                                <CardDescription>
                                                    {new Date(note.createdAt).toLocaleDateString("en-US", {
                                                    year: "numeric",
                                                    month: "long",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    })}

                                                    {note.userId && note.user?.name && <> - {note.user.name}</>}
                                                </CardDescription>
                                            </div>

                                            {/* Right side: pin */}
                                            {isPinned && (
                                                <Badge
                                                    variant="secondary"
                                                    className="flex items-center gap-1 shrink-0"
                                                >
                                                    <Pin className="h-3 w-3" />
                                                    <span className="sr-only">Pinned</span>
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
                                    </CardContent>
                                </Card>
                            )
                        })
                )}
            </div>
        </div>
    )
}
