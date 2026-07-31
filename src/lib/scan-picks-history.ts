// ============================================================
// Scan Picks History — persists daily picks to JSON file.
// Used by top-picks-selector to avoid showing the same names
// repeatedly across consecutive scans.
//
// NOTE: In Vercel serverless, the filesystem is read-only after
// build. This uses /tmp for runtime writes. For production,
// migrate to DB (Prisma ScanPickHistory table).
// ============================================================

import { promises as fs } from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────

export type ScanPickRecord = {
  date: string;       // ISO date
  symbol: string;
  bucket: 'TOP' | 'BOTTOM';
  rank: number;
  score: number;
  sector?: string;
};

// ─── Storage ──────────────────────────────────────────────────
// Use /tmp in serverless, fallback to data/ in dev

function getFilePath(): string {
  const tmpPath = '/tmp/scan-picks-history.json';
  const devPath = path.join(process.cwd(), 'data', 'scan-picks-history.json');
  // In Vercel serverless, process.cwd() is read-only, so prefer /tmp
  return process.env.NODE_ENV === 'production' ? tmpPath : devPath;
}

async function ensureFile(): Promise<void> {
  const dir = path.dirname(getFilePath());
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // directory exists or can't create — continue
  }
  try {
    await fs.access(getFilePath());
  } catch {
    await fs.writeFile(getFilePath(), '[]', 'utf8');
  }
}

// ─── Read ─────────────────────────────────────────────────────

export async function readScanPickHistory(): Promise<ScanPickRecord[]> {
  await ensureFile();
  try {
    const raw = await fs.readFile(getFilePath(), 'utf8');
    return JSON.parse(raw) as ScanPickRecord[];
  } catch {
    return [];
  }
}

// ─── Append ───────────────────────────────────────────────────

export async function appendScanPickHistory(records: ScanPickRecord[]): Promise<void> {
  const existing = await readScanPickHistory();
  // Keep last 5000 records to avoid unbounded growth
  const merged = [...existing, ...records].slice(-5000);
  try {
    await fs.writeFile(getFilePath(), JSON.stringify(merged, null, 2), 'utf8');
  } catch {
    // In serverless, /tmp write can fail silently — non-critical
    console.warn('[SCAN-HISTORY] Failed to write picks history');
  }
}

// ─── Repeat Count ─────────────────────────────────────────────

export function getRepeatCount(
  history: ScanPickRecord[],
  symbol: string,
  bucket: 'TOP' | 'BOTTOM',
  lookbackDays = 3,
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  return history.filter((r) => (
    r.symbol === symbol &&
    r.bucket === bucket &&
    new Date(r.date) >= cutoff
  )).length;
}
