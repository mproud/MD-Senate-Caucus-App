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

export const getScraperDays = async (): Promise<number> => {
    const setting = await prisma.settings.findUnique({
        where: { name: 'scraperDays' },
        select: { value: true },
    })

    if ( ! setting || ! setting.value ) {
        throw new Error('Scraper setting not found')
    }

    const days = Number(setting.value)

    if (Number.isNaN(days)) {
        throw new Error('Scraper setting is not a valid number')
    }

    return days
}