// POST /api/social-arb/scan — nis skanimin (butoni «Skano tani» ose cron).
// Autorizimi: nëse CRON_SECRET është vendosur, kërkesat nga jashtë duhet ta
// mbajnë atë; kërkesat nga i njëjti origin (shfletuesi i faqes) lejohen.

import { runScan, scanInProgress } from '@/lib/social-arb/engine';
import { storageInfo } from '@/lib/social-arb/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

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
  if (scanInProgress()) {
    return Response.json({ ok: false, error: 'Një skanim po ekzekutohet tashmë.' }, { status: 409 });
  }
  try {
    const summary = await runScan();
    return Response.json({ ...summary, storage: storageInfo() });
  } catch (e) {
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
