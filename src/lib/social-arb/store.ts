// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — store i qëndrueshëm
//
// data/social-arb.json — gjendja e plotë (matjet + kandidatët + skanimet).
// data/social-arb-backtest/social-arb-YYYY-MM.csv — arkivi CSV në
// prapavijë për backtest (s'ka buton ngarkimi; skaneri shkruan vetë).
//
// Rruga zgjidhet në mënyrë që store-i të jetojë JASHTË .next/standalone
// (nuk fshihet në rebuild) dhe bie me hije në /tmp kur FS-i është
// read-only (p.sh. serverless).
// ═══════════════════════════════════════════════════════════════

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import type { Measurement, SocialArbStore } from './types';

export const CSV_HEADER =
  'observed_at,available_at,trend,source,region,interest,ticker,product,company,materiality,promo_risk,event_risk,stock_price,index_price';

function resolveDataDir(): string {
  if (process.env.SOCIAL_ARB_DATA_DIR) return process.env.SOCIAL_ARB_DATA_DIR;
  const cwd = process.cwd();
  const candidates: string[] = [path.join(cwd, 'data')];
  // kur serveri ngrihet brenda .next/standalone → ngjitu te rrënja e projektit
  if (cwd.endsWith(path.join('.next', 'standalone'))) {
    candidates.unshift(path.resolve(cwd, '..', '..', 'data'));
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.dirname(c)) ) {
        fs.mkdirSync(c, { recursive: true });
        return c;
      }
    } catch { /* provo tjetrin */ }
  }
  return '/tmp/social-arb-data';
}

export function storePath(): string {
  return path.join(resolveDataDir(), 'social-arb.json');
}

export function backtestDir(): string {
  return path.join(resolveDataDir(), 'social-arb-backtest');
}

// ── Store JSON ───────────────────────────────────────────────────

const EMPTY_STORE: SocialArbStore = {
  version: 2,
  createdAt: new Date().toISOString(),
  lastScanAt: null,
  measurements: [],
  candidates: {},
  scans: [],
};

export function emptyStore(): SocialArbStore {
  return { ...EMPTY_STORE, createdAt: new Date().toISOString(), measurements: [], candidates: {}, scans: [] };
}

export async function readStore(): Promise<SocialArbStore> {
  try {
    const raw = await fsp.readFile(storePath(), 'utf8');
    const s = JSON.parse(raw) as SocialArbStore;
    if (!s || s.version !== 2) return emptyStore();
    return {
      version: 2,
      createdAt: s.createdAt ?? new Date().toISOString(),
      lastScanAt: s.lastScanAt ?? null,
      measurements: Array.isArray(s.measurements) ? s.measurements : [],
      candidates: s.candidates && typeof s.candidates === 'object' ? s.candidates : {},
      scans: Array.isArray(s.scans) ? s.scans : [],
    };
  } catch {
    return emptyStore();
  }
}

let writeLock: Promise<void> = Promise.resolve();

/** Shkrim atomic (tmp + rename) me mutex të thjeshtë në-proces. */
export async function writeStore(store: SocialArbStore): Promise<void> {
  const run = async () => {
    const dir = path.dirname(storePath());
    await fsp.mkdir(dir, { recursive: true });
    await fsp.mkdir(backtestDir(), { recursive: true });
    const tmp = `${storePath()}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(store, null, 1), 'utf8');
    await fsp.rename(tmp, storePath());
  };
  writeLock = writeLock.then(run, run);
  await writeLock;
}

export function measurementKey(m: Measurement): string {
  return [m.trend.toLowerCase(), m.ticker, m.region, m.source, m.observed_at].join('|');
}

/** Bashkon matjet e reja në store (upsert sipas uniqueKey). */
export function mergeMeasurements(store: SocialArbStore, rows: Measurement[]): Measurement[] {
  const map = new Map(store.measurements.map(m => [measurementKey(m), m]));
  for (const r of rows) map.set(measurementKey(r), r);
  store.measurements = [...map.values()];
  return store.measurements;
}

// ── Arkivi CSV (prapavijë, për backtest) ─────────────────────────

function csvEscape(v: string | number | null): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowToCsv(m: Measurement): string {
  return [
    m.observed_at, m.available_at, m.trend, m.source, m.region, m.interest,
    m.ticker, m.product, m.company, m.materiality, m.promo_risk, m.event_risk,
    m.stock_price ?? '', m.index_price ?? '',
  ].map(csvEscape).join(',');
}

/**
// Shton rreshtat e rinj në arkivin mujor CSV (dedupe sipas uniqueKey).
 * Kjo është «ruajtja në prapavijë» — pa buton ngarkimi në ekran.
 */
export async function archiveToCsv(rows: Measurement[]): Promise<number> {
  if (!rows.length) return 0;
  const byMonth = new Map<string, Measurement[]>();
  for (const r of rows) {
    const month = r.observed_at.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), r]);
  }
  let written = 0;
  for (const [month, list] of byMonth) {
    const file = path.join(backtestDir(), `social-arb-${month}.csv`);
    let existingKeys = new Set<string>();
    let existing = '';
    try {
      existing = await fsp.readFile(file, 'utf8');
      for (const line of existing.split('\n').slice(1)) {
        if (!line.trim()) continue;
        const cells = line.split(','); // kolonat e para mjaftojnë për key
        if (cells.length >= 5) {
          existingKeys.add([cells[2].toLowerCase().replace(/^"|"$/g, ''), cells[6] ?? '', cells[4] ?? '', cells[3] ?? '', cells[0] ?? ''].join('|'));
        }
      }
    } catch { /* skedar i ri */ }
    const lines: string[] = [];
    if (!existing) lines.push(CSV_HEADER);
    for (const r of list) {
      const key = measurementKey(r);
      if (existingKeys.has(key)) continue;
      lines.push(rowToCsv(r));
      written++;
    }
    if (lines.length > (existing ? 0 : 1)) {
      await fsp.appendFile(file, (existing && !existing.endsWith('\n') ? '\n' : '') + lines.join('\n') + '\n', 'utf8');
    }
  }
  return written;
}

/** Ku është store-i (për diagnostikë në UI). */
export function storageInfo(): { dir: string; persistent: boolean } {
  const dir = resolveDataDir();
  const persistent = !dir.startsWith('/tmp');
  return { dir, persistent };
}
