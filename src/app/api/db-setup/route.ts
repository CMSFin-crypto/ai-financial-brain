// ============================================================
// POST /api/db-setup — one-click table creation
// GET  /api/db-setup — same (for browser convenience)
//
// Executes prisma/postgres-init.sql (inlined in
// src/lib/db-setup-sql.ts) against DATABASE_URL.
// Fully idempotent: "already exists" errors are skipped,
// so it is safe to run multiple times.
//
// Optional protection: set SETUP_SECRET env var, then call
//   /api/db-setup?secret=<value>  (or header x-setup-secret)
// ============================================================

import { NextResponse } from 'next/server';
import prisma, { isDbAvailable } from '@/lib/prisma';
import { POSTGRES_INIT_SQL } from '@/lib/db-setup-sql';

function isAuthorized(req: Request): boolean {
  const secret = process.env.SETUP_SECRET;
  if (!secret) return true;
  const provided =
    new URL(req.url).searchParams.get('secret') ||
    req.headers.get('x-setup-secret');
  return provided === secret;
}

function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runSetup() {
  if (!isDbAvailable()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'DATABASE_URL nuk është konfiguruar. Krijo një projekt në neon.tech, kopjo connection string, dhe shtoje si DATABASE_URL në Vercel Environment Variables, pastaj redeploy.',
      },
      { status: 400 }
    );
  }

  const statements = splitStatements(POSTGRES_INIT_SQL);
  let executed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      executed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Idempotency: existing tables/types/indexes are fine
      if (msg.includes('already exists') || msg.includes('duplicate key value violates unique constraint')) {
        skipped++;
      } else {
        errors.push(msg.slice(0, 300));
      }
    }
  }

  const success = errors.length === 0;
  return NextResponse.json({
    ok: success,
    executed,
    skipped,
    total: statements.length,
    errors: errors.slice(0, 5),
    hint: success
      ? 'Tabelat u krijuan. Paneli Kontrol tani do mbushet me të dhëna pas predikimeve të para.'
      : 'Disa statement-e dështuan — shiko errors. Zakonisht shkaku është DATABASE_URL i pasaktë ose i paarritshëm.',
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return runSetup();
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return runSetup();
}
