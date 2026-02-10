"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Pin, Loader2 } from "lucide-react"
import { Prisma } from "@prisma/client"
import { toast } from "sonner"

type BillNoteWithUser = Prisma.BillNoteGetPayload<{
    include: { user: { select: { name: true } } }
}>

interface NotesPanelProps {
    billNumber: string
    initialNotes: BillNoteWithUser[]
}

export function NotesPanel({ billNumber, initialNotes }: NotesPanelProps) {
    const [notes, setNotes] = useState<BillNoteWithUser[]>(initialNotes)
    const [newNoteBody, setNewNoteBody] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
    const [editBody, setEditBody] = useState("")
    const [isSavingEdit, setIsSavingEdit] = useState(false)
    const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null)

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

            const newNote: BillNoteWithUser = await response.json()

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

    const startEditing = (note: BillNoteWithUser) => {
        setEditingNoteId(note.id)
        setEditBody(note.content)
    }

    const cancelEditing = () => {
        setEditingNoteId(null)
        setEditBody("")
    }

    const handleSaveEdit = async (noteId: number) => {
        if (!editBody.trim()) {
            toast.error("Error", {
                description: "Note body cannot be empty",
            })
            return
        }

        setIsSavingEdit(true)

        try {
            const response = await fetch(`/api/bills/${billNumber}/notes`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    noteId,
                    content: editBody,
                }),
            })

            if (!response.ok) {
                const msg: unknown = await response.json().catch(() => null)

                if (msg && typeof msg === "object" && "error" in msg && typeof (msg as any).error === "string") {
                    throw new Error((msg as any).error)
                }

                throw new Error("Failed to update note")
            }

            const payload: { success: true, note: BillNoteWithUser } = await response.json()

            setNotes((prev) => prev.map((n) => (n.id === noteId ? payload.note : n)))
            setEditingNoteId(null)
            setEditBody("")

            toast("Note Updated", {
                description: "Your changes were saved.",
            })
        } catch (error) {
            toast.error("Error", {
                description: error instanceof Error ? error.message : "Failed to update note",
            })
        } finally {
            setIsSavingEdit(false)
        }
    }

    const handleDelete = async (noteId: number) => {
        setDeletingNoteId(noteId)

        try {
            const response = await fetch(`/api/bills/${billNumber}/notes?noteId=${noteId}`, {
                method: "DELETE",
            })

            if (!response.ok) {
                const msg: unknown = await response.json().catch(() => null)

                if (msg && typeof msg === "object" && "error" in msg && typeof (msg as any).error === "string") {
                    throw new Error((msg as any).error)
                }

                throw new Error("Failed to delete note")
            }

            setNotes((prev) => prev.filter((n) => n.id !== noteId))

            if (editingNoteId === noteId) {
                cancelEditing()
            }

            toast("Note Deleted", {
                description: "The note has been removed.",
            })
        } catch (error) {
            toast.error("Error", {
                description: error instanceof Error ? error.message : "Failed to delete note",
            })
        } finally {
            setDeletingNoteId(null)
        }
    }

    const visibleNotes = notes
        .slice()
        .filter((note: BillNoteWithUser) => note.visibility !== "HIDDEN")
        .sort((a, b) => {
            const aPinned = a.visibility === "PINNED"
            const bPinned = b.visibility === "PINNED"

            if (aPinned !== bPinned) return aPinned ? -1 : 1

            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })

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
                {visibleNotes.length === 0 ? (
                    <Card key="no-notes">
                        <CardContent className="py-8">
                            <div className="text-center text-muted-foreground">
                                <p className="text-sm">No notes yet. Add the first note above.</p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    visibleNotes.map((note: BillNoteWithUser) => {
                        const isPinned = note.visibility === "PINNED"
                        const isEditing = editingNoteId === note.id
                        const isDeleting = deletingNoteId === note.id

                        return (
                            <Card
                                key={note.id}
                                className={isPinned ? "border-muted-foreground/40 bg-muted/70" : undefined}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-4">
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

                                        <div className="flex items-center gap-2 shrink-0">
                                            {isPinned && (
                                                <Badge variant="secondary" className="flex items-center gap-1">
                                                    <Pin className="h-3 w-3" />
                                                    <span className="sr-only">Pinned</span>
                                                </Badge>
                                            )}

                                            {isEditing ? (
                                                <>
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        onClick={() => handleSaveEdit(note.id)}
                                                        disabled={isSavingEdit}
                                                    >
                                                        {isSavingEdit ? "Saving..." : "Save"}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={cancelEditing}
                                                        disabled={isSavingEdit}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => startEditing(note)}
                                                        disabled={isDeleting}
                                                    >
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => handleDelete(note.id)}
                                                        disabled={isDeleting}
                                                    >
                                                        {isDeleting ? "Deleting..." : "Delete"}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent>
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <Textarea
                                                value={editBody}
                                                onChange={(e) => setEditBody(e.target.value)}
                                                rows={4}
                                                disabled={isSavingEdit}
                                            />
                                        </div>
                                    ) : (
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })
                )}
            </div>
        </div>
    )
}
