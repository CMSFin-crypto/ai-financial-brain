// ============================================================
// Scan Picks History — persists daily picks to DB (Prisma DailyPick).
// Falls back to /tmp JSON for dev environments without DB.
// Used by top-picks-selector to avoid showing the same names
// repeatedly across consecutive scans.
// ============================================================

import prisma from './prisma';
import { promises as fs } from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────

export type ScanPickRecord = {
  date: string;       // ISO date string
  symbol: string;
  bucket: 'TOP' | 'BOTTOM';
  rank: number;
  score: number;
  sector?: string;
};

// ─── DB-backed read (primary) ─────────────────────────────────

export async function readScanPickHistory(): Promise<ScanPickRecord[]> {
  // Try DB first
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const picks = await prisma.dailyPick.findMany({
      where: { scanDate: { gte: threeDaysAgo } },
      orderBy: { scanDate: 'desc' },
      take: 500,
    });

    if (picks.length > 0) {
      return picks.map(p => ({
        date: p.scanDate.toISOString(),
        symbol: p.symbol,
        bucket: p.bucket as 'TOP' | 'BOTTOM',
        rank: p.rank,
        score: p.score,
        sector: p.sector ?? undefined,
      }));
    }
  } catch (err) {
    console.warn('[SCAN-HISTORY] DB read failed, falling back to file:', err);
  }

  // Fallback: /tmp JSON file
  return readScanPickHistoryFile();
}

// ─── DB-backed append (primary) ───────────────────────────────

export async function appendScanPickHistory(records: ScanPickRecord[]): Promise<void> {
  // Try DB first
  try {
    await prisma.dailyPick.createMany({
      data: records.map(r => ({
        symbol: r.symbol,
        bucket: r.bucket,
        rank: r.rank,
        score: r.score,
        sector: r.sector ?? null,
        scanDate: new Date(r.date),
      })),
    });
    return; // Success — skip file fallback
  } catch (err) {
    console.warn('[SCAN-HISTORY] DB write failed, falling back to file:', err);
  }

  // Fallback: /tmp JSON file
  await appendScanPickHistoryFile(records);
}

// ─── Repeat Count (works with both sources) ────────────────────

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

// ═══════ File-based fallback (dev / no-DB) ═══════

function getFilePath(): string {
  const tmpPath = '/tmp/scan-picks-history.json';
  const devPath = path.join(process.cwd(), 'data', 'scan-picks-history.json');
  return process.env.NODE_ENV === 'production' ? tmpPath : devPath;
}

async function ensureFile(): Promise<void> {
  const dir = path.dirname(getFilePath());
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // directory exists or can't create
  }
  try {
    await fs.access(getFilePath());
  } catch {
    await fs.writeFile(getFilePath(), '[]', 'utf8');
  }
}

async function readScanPickHistoryFile(): Promise<ScanPickRecord[]> {
  await ensureFile();
  try {
    const raw = await fs.readFile(getFilePath(), 'utf8');
    return JSON.parse(raw) as ScanPickRecord[];
  } catch {
    return [];
  }
}

async function appendScanPickHistoryFile(records: ScanPickRecord[]): Promise<void> {
  const existing = await readScanPickHistoryFile();
  const merged = [...existing, ...records].slice(-5000);
  try {
    await fs.writeFile(getFilePath(), JSON.stringify(merged, null, 2), 'utf8');
  } catch {
    console.warn('[SCAN-HISTORY] Failed to write picks history to file');
  }
}
