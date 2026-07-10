import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Cache on globalThis in every environment, not just dev: Next.js bundles each
// route into its own chunk, and without this each chunk's copy of this module
// would create its own PrismaClient (and its own connection pool), quickly
// exhausting Supabase's pooler connection limit.
globalForPrisma.prisma = prisma;
