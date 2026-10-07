// POST|GET /api/social-arb/scan — nis skanimin.
// Dy shtigje hyrjeje:
//  1) CRON: Authorization: Bearer <CRON_SECRET> (i detyrueshëm në Vercel, fail-closed)
//  2) BUTONI i faqes (POST same-origin): pa sekret, por me cooldown 10 min në Vercel.
// Kokat Origin/Sec-Fetch-Site mund të falsifikohen nga klientët jo-shfletues,
// prandaj butoni NUK konsiderohet autentikim — kufizohet nga cooldown-i.

import { timingSafeEqual } from 'node:crypto';
import { runScan, scanInProgress, ScanLockError } from '@/lib/social-arb/engine';
import { storageInfo } from '@/lib/social-arb/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // maksimumi i planit Hobby

const MANUAL_COOLDOWN_S = 600;
let localLastManual = 0; // vetëm për ambientin pa Upstash

function scanBlockedByConfig(): string | null {
  if (process.env.VERCEL && storageInfo().backend !== 'upstash') {
    return 'Në Vercel skanimet kërkojnë ruajtjen në Upstash: vendos UPSTASH_REDIS_REST_URL dhe UPSTASH_REDIS_REST_TOKEN te Settings → Environment Variables, pastaj Redeploy. (Deri atëherë faqja shfaq snapshot-in e fundit nga git — sandbox-i lokal vazhdon të skanojë normalisht.)';
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function hasCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

function isBrowserButton(req: Request): boolean {
  if (req.method !== 'POST') return false;
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true;
  const origin = req.headers.get('origin') ?? '';
  const host = req.headers.get('host') ?? '';
  try {
    return !!origin && new URL(origin).host === host;
  } catch {
    return false;
  }
}

type Access = 'cron' | 'manual' | 'denied';

function accessFor(req: Request): Access {
  if (hasCronSecret(req)) return 'cron';
  // lokalisht pa CRON_SECRET: sjellja e vjetër (lejo)
  if (!process.env.VERCEL && !process.env.CRON_SECRET) return 'cron';
  if (isBrowserButton(req)) return 'manual';
  return 'denied';
}

/** true = lejohet skanimi manual tani; false = cooldown aktiv (ose Upstash i padisponueshëm). */
async function acquireManualCooldown(): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', 'social-arb:manual-cooldown', '1', 'NX', 'EX', String(MANUAL_COOLDOWN_S)]),
      });
      const j = (await r.json()) as { result?: string | null };
      return j.result === 'OK';
    } catch {
      return false;
    }
  }
  const now = Date.now();
  if (now - localLastManual < MANUAL_COOLDOWN_S * 1000) return false;
  localLastManual = now;
  return true;
}

async function handle(req: Request): Promise<Response> {
  const who = accessFor(req);
  if (who === 'denied') {
    return Response.json({ ok: false, error: 'E paautorizuar.' }, { status: 401 });
  }
  const blocked = scanBlockedByConfig();
  if (blocked) {
    return Response.json({ ok: false, error: blocked }, { status: 503 });
  }
  if (scanInProgress()) {
    return Response.json({ ok: false, error: 'Një skanim po ekzekutohet tashmë.' }, { status: 409 });
  }
  if (who === 'manual' && process.env.VERCEL && !(await acquireManualCooldown())) {
    return Response.json(
      { ok: false, error: `Skanim manual lejohet një herë në ${MANUAL_COOLDOWN_S / 60} minuta. Provo më vonë.` },
      { status: 429, headers: { 'Retry-After': String(MANUAL_COOLDOWN_S) } },
    );
  }
  try {
    const summary = await runScan();
    return Response.json({ ...summary, storage: storageInfo() });
  } catch (e) {
    if (e instanceof ScanLockError) {
      return Response.json({ ok: false, error: e.message }, { status: 409 });
    }
    console.error('[social-arb/scan] dështoi:', e);
    return Response.json({ ok: false, error: 'Skanimi dështoi. Shiko logjet e serverit.' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

// GET për cron (Vercel cron dërgon GET) — pranohet vetëm me CRON_SECRET në Vercel
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}
