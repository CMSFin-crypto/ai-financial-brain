// POST /api/social-arb/scan — nis skanimin (butoni «Skano tani» ose cron).
// Autorizimi: nëse CRON_SECRET është vendosur, kërkesat nga jashtë duhet ta
// mbajnë atë; kërkesat nga i njëjti origin (shfletuesi i faqes) lejohen.

import { runScan, scanInProgress, ScanLockError } from '@/lib/social-arb/engine';
import { storageInfo } from '@/lib/social-arb/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 60s = maksimumi i planit Hobby në Vercel; lokalisht s'ka efekt (Next standalone e injoron).
// Motori e mbyll veten me nder brenda buxhetit (SCAN_BUDGET_MS, default 35s në Vercel).
export const maxDuration = 60;

/** Në Vercel, FS-i i funksionit është i vetëm-lexim (data/ vjen e ngrirë nga build-i) —
 *  skanimet atje kërkojnë Upstash. Dështoj i menjëhershëm me porosi të qartë
 *  në vend se një timeout 60s kot dhe humbje kohe funksioni. */
function scanBlockedByConfig(): string | null {
  if (process.env.VERCEL && storageInfo().backend !== 'upstash') {
    return 'Në Vercel skanimet kërkojnë ruajtjen në Upstash: vendos UPSTASH_REDIS_REST_URL dhe UPSTASH_REDIS_REST_TOKEN te Settings → Environment Variables, pastaj Redeploy. (Deri atëherë faqja shfaq snapshot-in e fundit nga git — sandbox-i lokal vazhdon të skanojë normalisht.)';
  }
  return null;
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get('authorization') ?? '';
  if (header === `Bearer ${secret}`) return true;
  // lejo thirrjet nga i njëjti origin (butoni në faqe)
  const origin = req.headers.get('origin') ?? '';
  const host = req.headers.get('host') ?? '';
  try {
    if (origin && new URL(origin).host === host) return true;
  } catch { /* ignore */ }
  return false;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: 'E paautorizuar — vendos Bearer CRON_SECRET.' }, { status: 401 });
  }
  const blocked = scanBlockedByConfig();
  if (blocked) {
    return Response.json({ ok: false, error: blocked }, { status: 503 });
  }
  if (scanInProgress()) {
    return Response.json({ ok: false, error: 'Një skanim po ekzekutohet tashmë.' }, { status: 409 });
  }
  try {
    const summary = await runScan();
    return Response.json({ ...summary, storage: storageInfo() });
  } catch (e) {
    if (e instanceof ScanLockError) {
      return Response.json({ ok: false, error: e.message }, { status: 409 });
    }
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

// GET e lehtë për cron (Vercel cron dërgon GET)
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}
