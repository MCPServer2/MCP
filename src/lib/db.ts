import { PrismaClient } from '@prisma/client'

/**
 * Some sandbox shells still export the legacy SQLite URL as DATABASE_URL.
 * Prisma (now on PostgreSQL) must receive a postgres:// URL, so prefer a
 * postgres DATABASE_URL and fall back to DIRECT_URL; on Vercel both are set
 * properly (DATABASE_URL = pooled for runtime, DIRECT_URL for migrations).
 */
function resolveDatabaseUrl(): string | undefined {
  const candidates = [process.env.DATABASE_URL, process.env.DIRECT_URL]
  for (const url of candidates) {
    if (url && (url.startsWith('postgresql://') || url.startsWith('postgres://'))) {
      return url
    }
  }
  return undefined
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const datasourceUrl = resolveDatabaseUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db