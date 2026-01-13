import { prisma } from "@/lib/prisma"

// Returns the active session code from settings
export const getActiveSessionCode = async (): Promise<string> => {
    const setting = await prisma.settings.findUnique({
        where: { name: 'activeSessionCode' },
        select: { value: true },
    })

    if ( ! setting || ! setting.value ) {
        throw new Error('Active session code not found')
    }

    return setting.value
}