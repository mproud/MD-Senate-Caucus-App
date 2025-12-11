/*
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const pool = new Pool({
    connectionString: env.DATABASE_URL,
})

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
}

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
    })

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
*/

///////////// Cloudflare Example

import { cache } from "react"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
 
export const getDb = cache(() => {
  const connectionString = process.env.DATABASE_URL ?? ""
  const adapter = new PrismaPg({ connectionString, maxUses: 1 })
  const prisma = new PrismaClient({ adapter })
  return prisma
})


export const prisma = getDb()