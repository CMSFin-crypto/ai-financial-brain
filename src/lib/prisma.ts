// ============================================================
// Prisma Client Singleton — Vercel Serverless Safe
// ============================================================
// Falls back gracefully when DATABASE_URL is not configured or
// when running on Vercel with SQLite (which doesn't work serverless).

import { PrismaClient } from "@prisma/client";

function isDbAvailable(): boolean {
  // Strip quotes (Vercel may keep literal quotes from .env file)
  const url = (process.env.DATABASE_URL || "").replace(/^["']|["']$/g, "");
  if (!url) return false;
  // SQLite (file:) only works in local dev, not on Vercel serverless
  if (url.startsWith("file:")) {
    return process.env.VERCEL !== "1";
  }
  // PostgreSQL/MySQL work everywhere
  return url.startsWith("postgresql:") || url.startsWith("mysql:");
}

// Create a lazy proxy that only instantiates PrismaClient when first used
// and returns a no-op-like object if DB is not available
let _prisma: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (_prisma) return _prisma;

  if (!isDbAvailable()) {
    // Return a proxy that catches all method calls and returns empty results
    // instead of crashing with "URL must start with file:" error
    _prisma = new Proxy({} as PrismaClient, {
      get(_target, prop) {
        // Return a proxy for any model access (e.g., prisma.rankingChange)
        return new Proxy({}, {
          get(_t, method) {
            // Return async functions that return empty arrays/objects
            return async () => {
              if (method === 'count') return 0;
              if (method === 'findMany') return [];
              if (method === 'findFirst') return null;
              if (method === 'findUnique') return null;
              if (method === 'aggregate') return { _count: 0, _sum: null, _avg: null, _min: null, _max: null };
              return null;
            };
          },
        });
      },
    });
  } else {
    _prisma = new PrismaClient({ log: ["error"] });
  }

  return _prisma;
}

// Export a proxy that lazily creates the client
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    return (client as any)[prop];
  },
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = globalForPrisma.prisma ?? (isDbAvailable() ? new PrismaClient({ log: ["error"] }) : undefined);
}

export default prisma;
