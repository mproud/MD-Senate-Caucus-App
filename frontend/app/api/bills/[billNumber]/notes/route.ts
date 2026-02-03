import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"
import { getActiveSessionCode } from "@/lib/get-system-setting"

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status })
}

async function getBillIdByNumber(billNumber: string) {
    const activeSessionCode = await getActiveSessionCode()

    const bill = await prisma.bill.findFirst({
        where: {
            billNumber,
            sessionCode: activeSessionCode,
        },
        select: { id: true, billNumber: true },
    })
    return bill
}

const CreateNoteSchema = z.object({
    content: z.string().min(1, "content is required"),
})

const UpdateNoteSchema = z.object({
    noteId: z.number().int().positive(),
    content: z.string().min(1, "content is required"),
})

const DeleteNoteSchema = z.object({
    noteId: z.number().int().positive(),
})

/**
 * GET /api/bill/[billNumber]/note
 * Returns all notes for the bill
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await params

        const bill = await getBillIdByNumber(billNumber)
        if (!bill) return json({ error: "Bill not found" }, 404)

        const notes = await prisma.billNote.findMany({
            where: {
                billId: bill.id,
            },
            orderBy: { updatedAt: "desc" },
            include: {
                user: true,
            }
            // select: {
            //     id: true,
            //     billId: true,
            //     content: true,
            //     createdAt: true,
            //     updatedAt: true,
            //     // userId: true, // uncomment if your schema includes this field
            // },
        })

        return json({ billNumber: bill.billNumber, billId: bill.id, notes })
    } catch (error) {
        console.error("GET bill notes error:", error)
        return json({ error: "Failed to fetch notes" }, 500)
    }
}

/**
 * POST /api/bill/[billNumber]/note
 * Body: { content }
 * Creates a BillNote for this bill
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await params

        const bill = await getBillIdByNumber(billNumber)
        if ( ! bill ) return json({ error: "Bill not found" }, 404)

        const rawNote = await req.json()

        console.log('Raw JSON note', { rawNote })

        const parsed = CreateNoteSchema.safeParse( rawNote )
        if ( ! parsed.success ) {
            return json({ error: "Invalid request", details: parsed.error.flatten() }, 400)
        }

        const { userId } = await auth()
        if ( ! userId ) return json({ error: "Unauthorized" }, 401)

        const note = await prisma.billNote.create({
            data: {
                billId: bill.id,
                content: parsed.data.content,
                userId,
            },
            include: {
                user: true,
            }
            // select: {
            //     id: true,
            //     billId: true,
            //     content: true,
            //     createdAt: true,
            //     updatedAt: true,
            //     userId: true,
            //     user: true,
            // },
        })

        return json({ ...note }, 201)
    } catch (error) {
        console.error("POST bill note error:", error)
        return json({ error: "Failed to create note" }, 500)
    }
}

/**
 * PUT /api/bill/[billNumber]/note
 * Body: { noteId, content }
 * Edits an existing note
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await params

        const bill = await getBillIdByNumber(billNumber)
        if (!bill) return json({ error: "Bill not found" }, 404)

        const parsed = UpdateNoteSchema.safeParse(await req.json())
        if (!parsed.success) {
            return json({ error: "Invalid request", details: parsed.error.flatten() }, 400)
        }

        const { userId } = await auth()
        if (!userId) return json({ error: "Unauthorized" }, 401)

        // If your BillNote is user-scoped, enforce ownership here:
        // where: { id: parsed.data.noteId, userId }
        const note = await prisma.billNote.update({
            where: { id: parsed.data.noteId },
            data: {
                content: parsed.data.content,
            },
            select: {
                id: true,
                billId: true,
                content: true,
                createdAt: true,
                updatedAt: true,
                // userId: true,
            },
        })

        // Optional safety: ensure note belongs to bill
        if (note.billId !== bill.id) {
            return json({ error: "Note does not belong to this bill" }, 400)
        }

        return json({ success: true, note })
    } catch (error: any) {
        // Prisma "Record to update not found."
        if (error?.code === "P2025") return json({ error: "Note not found" }, 404)

        console.error("PUT bill note error:", error)
        return json({ error: "Failed to update note" }, 500)
    }
}

/**
 * DELETE /api/bill/[billNumber]/note
 * Accepts noteId in query (?noteId=123) OR body { noteId: 123 }
 * Deletes the note
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ billNumber: string }> }
) {
    try {
        const { billNumber } = await params

        const bill = await getBillIdByNumber(billNumber)
        if (!bill) return json({ error: "Bill not found" }, 404)

        const { userId } = await auth()
        if (!userId) return json({ error: "Unauthorized" }, 401)

        const url = new URL(req.url)
        const noteIdFromQuery = url.searchParams.get("noteId")
        let noteId: number | null =
            noteIdFromQuery && Number.isInteger(Number(noteIdFromQuery)) ? Number(noteIdFromQuery) : null

        if (!noteId) {
            // DELETE bodies are optional; handle if present
            try {
                const parsed = DeleteNoteSchema.safeParse(await req.json())
                if (parsed.success) noteId = parsed.data.noteId
            } catch {
                // ignore
            }
        }

        if (!noteId) return json({ error: "noteId is required (query or body)" }, 400)

        // Optional: confirm it belongs to this bill (and user, if user-scoped)
        const existing = await prisma.billNote.findFirst({
            where: {
                id: noteId,
                billId: bill.id,
                // userId, // enforce ownership if BillNote has userId
            },
            select: { id: true },
        })

        if (!existing) return json({ error: "Note not found" }, 404)

        await prisma.billNote.delete({
            where: { id: noteId },
        })

        return json({ success: true, deleted: true, noteId })
    } catch (error) {
        console.error("DELETE bill note error:", error)
        return json({ error: "Failed to delete note" }, 500)
    }
}
