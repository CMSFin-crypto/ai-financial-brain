// ═══════════════════════════════════════════════════════════════
// GET|POST /api/signal-journal/register — JOB A (regjistrimi ditor)
// ═══════════════════════════════════════════════════════════════
// Triggers skanimet e plota (ibkr-scan + rev-scan). Regjistrimi BRENDA
// skaneve përdor të gjithë kandidatët (jo vetëm Top 10): çdo sinjal që
// plotëson rregullat rregjistrohet, edhe pa slot të lirë (flag "pa_slot").
// Idempotent — çelësi unik (strategji+simbol+datë) mos lejon dyfishime.
//
// Mbrojtja: CRON_SECRET (Bearer <secret> ose ?secret=).
// Cron Vercel: 22:00 UTC Mon–Fri (pas mbylljes, të njëjtën ditë ET).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { isDbAvailable } from "@/lib/prisma";
import { currentEtSessionDate } from "@/lib/signal-journal";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // pa sekret konfiguruar — lejo (si cron-et ekzistuese)
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (new URL(req.url).searchParams.get("secret") === secret) return true;
  return false;
}

async function fetchScan(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; ms: number; error?: string }> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
    });
    // Lëre body-t të harxhohet që kërkesa të mbarojë mirë
    await res.arrayBuffer().catch(() => undefined);
    return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
  } catch (e: unknown) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : "gabim rrjeti",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runRegister(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDbAvailable()) {
    return NextResponse.json({ error: "DB i pavlefshëm" }, { status: 503 });
  }
  const origin = req.nextUrl.origin;
  const sessionDate = currentEtSessionDate();

  // Skanimet e plota — regjistrimi ndodh brenda tyre (piggyback ingest).
  // Rendit: CTC i pari (i shpejtë relativisht), pastaj REV (më i rëndë).
  const ctc = await fetchScan(`${origin}/api/ibkr-scan`, 150_000);
  const rev = await fetchScan(`${origin}/api/rev-scan`, 190_000);

  return NextResponse.json(
    {
      job: "signal-journal-register (Job A)",
      sessionDate,
      scans: { ibkrScan: ctc, revScan: rev },
      note: "Regjistrimi ndodh brenda skaneve — kontrollo fushat saved/updated në logje",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: NextRequest) {
  return runRegister(req);
}

export async function POST(req: NextRequest) {
  return runRegister(req);
}
