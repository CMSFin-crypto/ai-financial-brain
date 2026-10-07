// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — store i qëndrueshëm (dy backend-e)
//
// 1) SKEDAR (default — sandbox/lokal):
//    data/social-arb.json — gjendja e plotë (matjet + kandidatët + skanimet).
//    data/social-arb-backtest/social-arb-YYYY-MM.csv — arkivi CSV.
//    Rruga zgjidhet që store-i të jetojë JASHTË .next/standalone.
//
// 2) UPSTASH REDIS (kur janë vendosur UPSTASH_REDIS_REST_URL dhe
//    UPSTASH_REDIS_REST_TOKEN — p.sh. në Vercel serverless):
//    social-arb:store  — JSON i plotë i store-it (një çelës)
//    social-arb:csv    — HASH mujore me tekstet CSV (arkivi backtest)
//    social-arb:scan-lock — lock ndër-procesesh (sandbox + Vercel)
//
// Interfejsi i eksportuar është identik për të dy backend-et —
// motori dhe rrugët API s'kanë nevojë të dinë ku rri data.
// ═══════════════════════════════════════════════════════════════

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import type { Candidate, Measurement, SocialArbStore } from './types';
import {
  upstashEnabled, upstashGet, upstashSet, upstashHashGetAll, upstashHashSet, upstashLock,
  STORE_KEY, CSV_KEY, LOCK_KEY,
} from './upstash';

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
  if (upstashEnabled()) return `redis://${STORE_KEY} (Upstash)`;
  return path.join(resolveDataDir(), 'social-arb.json');
}

export function backtestDir(): string {
  return path.join(resolveDataDir(), 'social-arb-backtest');
}

// ── Store ───────────────────────────────────────────────────────

const EMPTY_STORE: SocialArbStore = {
  version: 4,
  createdAt: new Date().toISOString(),
  lastScanAt: null,
  measurements: [],
  candidates: {},
  scans: [],
};

export function emptyStore(): SocialArbStore {
  return { ...EMPTY_STORE, createdAt: new Date().toISOString(), measurements: [], candidates: {}, scans: [] };
}

/** Fushat e skemës v4 për një kandidat të vjetër (v2/v3) — të gjitha «s'u matën ende».
 *  S'prek asgjë ekzististe: matjet, historia, rezultatet 5/20 ditësh mbeten. */
function migrateCandidateToV4(c: Partial<Candidate>): Candidate {
  return {
    ...(c as Candidate),
    wiki: c.wiki ?? {
      article: null, growth: null, pageviews7dMedian: null, baselineMedian: null,
      risingWeeks: null, peakToAvg: null, error: null, checkedAt: null,
    },
    liquidity: c.liquidity ?? { avgDollarVolume: null, error: null, checkedAt: null },
    sinceStart: c.sinceStart ?? {
      fromDate: null, asOf: null, tradingDays: null,
      stockRet: null, indexRet: null, relative: null, checkedAt: null,
    },
    materialityInfo: c.materialityInfo ?? {
      exposurePct: null, reason: 'materialiteti vlerësohet në skanimin e radhës (migrim v3→v4)',
      capBucket: 'mid', linkType: 'direct',
    },
    gates: c.gates ?? [],
    alreadyMoved: c.alreadyMoved ?? false,
  };
}

/** Normalizon JSON-in e lexuar (çdo burim) në skemën v4. Pranon v2, v3 dhe v4.
 *  Migrimi s'humb asgjë: kandidatët, matjet, historia dhe skanimet mbeten. */
function normalizeStore(s: unknown): SocialArbStore {
  const st = s as Partial<SocialArbStore> & { version?: number } | null;
  if (!st) return emptyStore();
  const version = st.version as number | undefined;
  if (version !== 2 && version !== 3 && version !== 4) return emptyStore();
  const candidates: SocialArbStore['candidates'] = {};
  for (const [key, c] of Object.entries(st.candidates ?? {})) {
    const migrated = migrateCandidateToV4({
      ...c,
      status: c.status ?? 'WATCH',
      cause: c.cause ?? null,
      price: {
        stockReturn: c.price?.stockReturn ?? null,
        indexReturn: c.price?.indexReturn ?? null,
        priceVsIndex: c.price?.priceVsIndex ?? null,
        asOf: c.price?.asOf ?? null,
        fromDate: c.price?.fromDate ?? null,
        stockPrice: c.price?.stockPrice ?? null,
        indexPrice: c.price?.indexPrice ?? null,
        source: c.price?.source ?? null,
        error: c.price?.error ?? null,
        checkedAt: c.price?.checkedAt ?? null,
      },
      outcome: c.outcome ?? { baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null },
    });
    candidates[key] = migrated;
  }
  return {
    version: 4,
    createdAt: st.createdAt ?? new Date().toISOString(),
    lastScanAt: st.lastScanAt ?? null,
    measurements: Array.isArray(st.measurements) ? st.measurements : [],
    candidates,
    scans: Array.isArray(st.scans) ? st.scans : [],
  };
}

export async function readStore(): Promise<SocialArbStore> {
  if (upstashEnabled()) {
    try {
      const raw = await upstashGet(STORE_KEY);
      if (!raw) return emptyStore();
      return normalizeStore(JSON.parse(raw));
    } catch (e) {
      console.error('[social-arb store] leximi nga Upstash dështoi — kthej store bosh (i sinqertë):', (e as Error).message);
      return emptyStore();
    }
  }
  try {
    const raw = await fsp.readFile(path.join(resolveDataDir(), 'social-arb.json'), 'utf8');
    return normalizeStore(JSON.parse(raw));
  } catch {
    return emptyStore();
  }
}

let writeLock: Promise<void> = Promise.resolve();

/** Shkrim — atomic (tmp + rename) në modalitetin file; SET në Upstash. Mutex në-proces për të dyja. */
export async function writeStore(store: SocialArbStore): Promise<void> {
  const run = async () => {
    if (upstashEnabled()) {
      await upstashSet(STORE_KEY, JSON.stringify(store));
      return;
    }
    const dir = resolveDataDir();
    await fsp.mkdir(dir, { recursive: true });
    await fsp.mkdir(backtestDir(), { recursive: true });
    const file = path.join(dir, 'social-arb.json');
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(store, null, 1), 'utf8');
    await fsp.rename(tmp, file);
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

/** Çelësat ekzistues nga teksti CSV (dedupe identik për të dy backend-et). */
function keysFromCsvText(existing: string): Set<string> {
  const keys = new Set<string>();
  for (const line of existing.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split(','); // kolonat e para mjaftojnë për key
    if (cells.length >= 5) {
      keys.add([cells[2].toLowerCase().replace(/^"|"$/g, ''), cells[6] ?? '', cells[4] ?? '', cells[3] ?? '', cells[0] ?? ''].join('|'));
    }
  }
  return keys;
}

/**
 * Shton rreshtat e rinj në arkivin mujor CSV (dedupe sipas uniqueKey).
 * Kjo është «ruajtja në prapavijë» — pa buton ngarkimi në ekran.
 */
export async function archiveToCsv(rows: Measurement[]): Promise<number> {
  if (!rows.length) return 0;
  const byMonth = new Map<string, Measurement[]>();
  for (const r of rows) {
    const month = r.observed_at.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), r]);
  }

  if (upstashEnabled()) {
    let written = 0;
    const existing = await upstashHashGetAll(CSV_KEY);
    for (const [month, list] of byMonth) {
      const text = existing[month] ?? '';
      const existingKeys = keysFromCsvText(text);
      const lines: string[] = text ? [] : [CSV_HEADER];
      for (const r of list) {
        if (existingKeys.has(measurementKey(r))) continue;
        lines.push(rowToCsv(r));
        written++;
      }
      if (lines.length) {
        await upstashHashSet(CSV_KEY, month, (text ? (text.endsWith('\n') ? text : `${text}\n`) : '') + lines.join('\n') + '\n');
      }
    }
    return written;
  }

  let written = 0;
  for (const [month, list] of byMonth) {
    const file = path.join(backtestDir(), `social-arb-${month}.csv`);
    let existingKeys = new Set<string>();
    let existing = '';
    try {
      existing = await fsp.readFile(file, 'utf8');
      existingKeys = keysFromCsvText(existing);
    } catch { /* skedar i ri */ }
    const lines: string[] = existing ? [] : [CSV_HEADER];
    for (const r of list) {
      const key = measurementKey(r);
      if (existingKeys.has(key)) continue;
      lines.push(rowToCsv(r));
      written++;
    }
    if (lines.length) {
      await fsp.appendFile(file, (existing && !existing.endsWith('\n') ? '\n' : '') + lines.join('\n') + '\n', 'utf8');
    }
  }
  return written;
}

/** Statistika e arkivit CSV (numër skedarësh/fushash + rreshta) — për UI. */
export async function csvArchiveStats(): Promise<{ files: number; rows: number }> {
  if (upstashEnabled()) {
    try {
      const hash = await upstashHashGetAll(CSV_KEY);
      const months = Object.keys(hash);
      const rows = months.reduce((n, m) => n + hash[m].split('\n').filter(l => l.trim() && !l.startsWith('observed_at')).length, 0);
      return { files: months.length, rows };
    } catch {
      return { files: 0, rows: 0 };
    }
  }
  try {
    const files = fs.readdirSync(backtestDir()).filter(f => f.endsWith('.csv'));
    let rows = 0;
    for (const f of files) {
      const lines = fs.readFileSync(path.join(backtestDir(), f), 'utf8').split('\n');
      rows += lines.filter(l => l.trim() && !l.startsWith('observed_at')).length;
    }
    return { files: files.length, rows };
  } catch {
    return { files: 0, rows: 0 };
  }
}

// ── Lock ndër-procesesh ────────────────────────────────────────

/**
 * Lock-i i skanimit: në modalitetin file s'ka nevojë (një proces i vetëm,
 * mutex-i i motori mjafton → noop); në Upstash, sandbox-i dhe Vercel-i
 * mund të skanojnë njëkohësisht — lock-i me TTL e pengon dyfishimin.
 * TTL-i është rrjeti i sigurisë: edhe nëse procesi vdes pa liruar,
 * lock-i skadon vetë pas <ttlSeconds>.
 */
export async function acquireScanLock(ttlSeconds = 120): Promise<(() => Promise<void>) | null> {
  if (!upstashEnabled()) {
    return async () => { /* noop — modaliteti file ka një proces të vetëm */ };
  }
  try {
    return await upstashLock(LOCK_KEY, ttlSeconds);
  } catch (e) {
    // Nëse vetë Redis-i është i palexueshëm, s'ka bazë për t'u ndalur —
    // lëri skanimin të vazhdojë (preferohet puna e dyfishuar mbi e pamundura).
    console.error('[social-arb store] lock-i Upstash dështoi — vazhdoj pa lock:', (e as Error).message);
    return async () => { /* noop fallback */ };
  }
}

/** Ku është store-i (për diagnostikë në UI). */
export function storageInfo(): { dir: string; persistent: boolean; backend: 'file' | 'upstash' } {
  if (upstashEnabled()) {
    let host = 'upstash';
    try { host = new URL(process.env.UPSTASH_REDIS_REST_URL!).host; } catch { /* keqkonfigurim */ }
    return { dir: `Upstash Redis (${host})`, persistent: true, backend: 'upstash' };
  }
  const dir = resolveDataDir();
  const persistent = !dir.startsWith('/tmp');
  return { dir, persistent, backend: 'file' };
}
