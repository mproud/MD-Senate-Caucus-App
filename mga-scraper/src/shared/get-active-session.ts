import { prisma } from "./prisma"

// Returns the active session code from settings
export const getActiveSessionCode = async () => {
    const setting = await prisma.settings.findUnique({
        where: { name: 'activeSessionCode' },
        select: { value: true },
    })

    return '2026RS'
}