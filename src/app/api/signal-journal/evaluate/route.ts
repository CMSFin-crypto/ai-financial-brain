// ═══════════════════════════════════════════════════════════════
// GET|POST /api/signal-journal/evaluate — JOB B (vlerësimi ditor)
// ═══════════════════════════════════════════════════════════════
// Për çdo sinjal të pakyçur me moshë ≤ 5 ditë tregtare: merr OHLC ditor
// dhe plotëson checkpoint-in e ditës N (close, high/low deri tani, R në
// close, status). Kyç statusin final kur ndodh e para (target / stop /
// gap_stop / time_stop). Rreshtat e kyçur NUK preken kurrë — idempotent.
//
// Mbrojtja: CRON_SECRET (Bearer <secret> ose ?secret=).
// Cron Vercel: 22:45 UTC Mon–Fri (pas Job A, të njëjtën ditë ET).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { isDbAvailable } from "@/lib/prisma";
import { evaluateSignalJournal } from "@/lib/signal-journal";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (new URL(req.url).searchParams.get("secret") === secret) return true;
  return false;
}

async function runEvaluate(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDbAvailable()) {
    return NextResponse.json({ error: "DB i pavlefshëm" }, { status: 503 });
  }
  const result = await evaluateSignalJournal(80);
  return NextResponse.json(
    { job: "signal-journal-evaluate (Job B)", ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: NextRequest) {
  return runEvaluate(req);
}

export async function POST(req: NextRequest) {
  return runEvaluate(req);
}
