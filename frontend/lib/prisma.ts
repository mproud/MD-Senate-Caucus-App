import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient

// Check if we are in development and if the global Prisma instance exists
// This prevents multiple instances of Prisma Client in development hot reloading
if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient()
} else {
    if (!global.prisma) {
        global.prisma = new PrismaClient()
    }
    prisma = global.prisma
}

export default prisma