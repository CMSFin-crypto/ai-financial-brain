// Test i pavarur i gate-ve Social Arb (P1 — skema v4):
//   1) wikiStats — rritja 7d vs baza 28d, javët e njëpasnjëshme, raporti pik/mesatare
//   2) gateSources — numërimi i burimeve (Trends + Wiki), GDELT s'numërohet,
//      fail-closed kur Wikipedia s'u mat
//   3) gateMateriality — pragu i materialitetit efektiv
//   4) computeReturnSinceStart — ankora në fillimin e trendit, kufiri 20 ditësh
//   5) gateNotPriced — «s'është çmuar» vs already_moved (+8%)
//   6) computeAvgDollarVolume + gateLiquidity — vëllami në $
//   7) gatePersistence — 3+ javë rritje, modeli i spike-it
//   8) evaluateGates + allGatesPassed + isAlreadyMoved
//   9) Migrimi i store-it v3 → v4 (të dhënat mbeten)
// Ekzekutim: bun scripts/test-social-arb-gates.ts

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  wikiStats, gateSources, gateMateriality, computeReturnSinceStart, gateNotPriced,
  computeAvgDollarVolume, gateLiquidity, gatePersistence, evaluateGates, allGatesPassed, isAlreadyMoved,
} from '../src/lib/social-arb/gates';
import type { WikiPoint, PricePoint } from '../src/lib/social-arb/sources';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}

const DAY = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10);

// ── 1) wikiStats ─────────────────────────────────────────────────

function makeWikiSeries(fn: (daysAgo: number) => number, days = 60): WikiPoint[] {
  const pts: WikiPoint[] = [];
  for (let d = days; d >= 0; d--) pts.push({ date: iso(d), views: fn(d) });
  return pts;
}

// rritje e qëndrueshme 3 javë: java e fundit 300, e para 200, më parë 100
const rising = makeWikiSeries(d => (d < 7 ? 300 : d < 14 ? 200 : 100));
const s1 = wikiStats(rising, iso(0));
check('wikiStats: rritja 7d vs baza 28d = +200%', Math.abs((s1.growth ?? 0) - 2) < 0.01, `${((s1.growth ?? 0) * 100).toFixed(1)}%`);
check('wikiStats: 3 javë rritjeje të njëpasnjëshme', s1.risingWeeks === 3, `risingWeeks=${s1.risingWeeks}`);
check('wikiStats: pik/mesatare e ulët për rritje të qëndrueshme', (s1.peakToAvg ?? 0) < 2.5, `${(s1.peakToAvg ?? 0).toFixed(2)}x`);

// modë e shkurtër: 1 ditë me 1000, pjesa tjetër 100
const spiky = makeWikiSeries(d => (d === 2 ? 1000 : 100));
const s2 = wikiStats(spiky, iso(0));
check('wikiStats: spike-i kapet nga raporti pik/mesatare', (s2.peakToAvg ?? 0) > 4, `${(s2.peakToAvg ?? 0).toFixed(1)}x`);

// seri e shkurtër → null (s'matet, s'fabrikohet)
const s3 = wikiStats(makeWikiSeries(() => 100, 20), iso(0));
check('wikiStats: seri < 35 ditë → të gjitha null', s3.growth === null && s3.risingWeeks === null && s3.peakToAvg === null);

// ── 2) gateSources ───────────────────────────────────────────────

const g1 = gateSources({ googleInFeed: true, wiki: { growth: 0.5, pageviews7dMedian: 300, baselineMedian: 200, risingWeeks: 3, peakToAvg: 1.5 } });
check('gateSources: Trends + Wiki në rritje → kalon', g1.passed === true);

const g2 = gateSources({ googleInFeed: false, wiki: { growth: 0.5, pageviews7dMedian: 300, baselineMedian: 200, risingWeeks: 3, peakToAvg: 1.5 } });
check('gateSources: vetëm Wikipedia (jo në feed) → nuk mjafton', g2.passed === false);

const g3 = gateSources({ googleInFeed: true, wiki: null, wikiError: 'HTTP 404' });
check('gateSources: Wikipedia e pamatshme → null (fail-closed, jo false)', g3.passed === null);

const g4 = gateSources({ googleInFeed: true, wiki: { growth: 0.05, pageviews7dMedian: 105, baselineMedian: 100, risingWeeks: 1, peakToAvg: 2 } });
check('gateSources: Wiki nën pragun +25% → vetëm 1 burim → dështon', g4.passed === false);
check('gateSources: detaji përmend pragun', g4.detail.includes('+25%'), g4.detail.slice(0, 60));

// ── 3) gateMateriality ───────────────────────────────────────────

const m1 = gateMateriality({ effective: 0.5, exposurePct: 0.6, capBucket: 'mid', linkType: 'direct', reason: 'test' });
check('gateMateriality: 50% ≥ 15% → kalon', m1.passed === true);
check('gateMateriality: detaji përmend lidhjen dhe kovën', m1.detail.includes('direct') && m1.detail.includes('mid'));

const m2 = gateMateriality({ effective: 0.05, exposurePct: 0.05, capBucket: 'mega', linkType: 'direct', reason: 'test' });
check('gateMateriality: 5% < 15% → dështon', m2.passed === false);

const m3 = gateMateriality({ effective: null, exposurePct: null, capBucket: 'mid', linkType: 'direct', reason: 's\'njihet' });
check('gateMateriality: e panjohur → null (WATCH, jo fshirje)', m3.passed === null);

// ── 4) computeReturnSinceStart ───────────────────────────────────

function makeStockSpy(stockRet: number, spyRet: number, days: number, startDate: string) {
  const stock: PricePoint[] = [], spy: PricePoint[] = [];
  const common = [...Array(days)].map((_, i) => iso((days - 1 - i)));
  for (const d of common) {
    stock.push({ date: d, close: 100, volume: 1_000_000 });
    spy.push({ date: d, close: 500 });
  }
  // aplikimi i kthimit pas datës bazë (baza = close i ditës së fillimit)
  const startIdx = stock.findIndex(p => p.date >= startDate);
  for (let i = startIdx + 1; i < stock.length; i++) {
    stock[i].close = 100 * (1 + stockRet);
    spy[i].close = 500 * (1 + spyRet);
  }
  return { stock, spy };
}

const seen30 = iso(30);
const r1 = computeReturnSinceStart(makeStockSpy(0.02, 0.01, 40, seen30).stock, makeStockSpy(0.02, 0.01, 40, seen30).spy, seen30);
check('computeReturnSinceStart: diferencë = kthimi i aksionit − SPY', r1 !== null && Math.abs(r1.relative - 0.01) < 1e-9);

// kufiri i 20 ditëve tregtimi: trend 40 ditë → matet vetëm dritarja e parë
const seen40 = iso(40);
const r2 = computeReturnSinceStart(makeStockSpy(0.5, 0.0, 40, seen40).stock, makeStockSpy(0.5, 0.0, 40, seen40).spy, seen40);
check('computeReturnSinceStart: kufizohet në 20 ditë tregtimi', r2 !== null && r2.tradingDays === 20, `days=${r2?.tradingDays}`);

// s'ka close të përbashkët → null
check('computeReturnSinceStart: seritë pa përputhje → null', computeReturnSinceStart([{ date: '2020-01-01', close: 1 }], [{ date: '2020-01-01', close: 1 }], seen30) === null);

// ── 5) gateNotPriced ─────────────────────────────────────────────

const n1 = gateNotPriced({ stockRet: 0.02, indexRet: 0.01, relative: 0.01, fromDate: iso(20), asOf: iso(0), tradingDays: 14 });
check('gateNotPriced: +1% ≤ +8% → kalon (s\'është çmuar)', n1.passed === true);

const n2 = gateNotPriced({ stockRet: 0.15, indexRet: 0.02, relative: 0.13, fromDate: iso(20), asOf: iso(0), tradingDays: 14 });
check('gateNotPriced: +13% > +8% → dështon (already_moved)', n2.passed === false);
check('gateNotPriced: detaji përmend already_moved', n2.detail.includes('already_moved'));

check('gateNotPriced: pa matje → null (fail-closed)', gateNotPriced(null).passed === null);
check('isAlreadyMoved: +13% → true, +1% → false', isAlreadyMoved({ relative: 0.13 }) === true && isAlreadyMoved({ relative: 0.01 }) === false);

// ── 6) likuiditeti ───────────────────────────────────────────────

const liqSeries: PricePoint[] = [...Array(25)].map((_, i) => ({ date: iso(24 - i), close: 50, volume: 100_000 })); // $5M/ditë
check('computeAvgDollarVolume: 50$ × 100k = 5M$/ditë', computeAvgDollarVolume(liqSeries) === 5_000_000);

const thin: PricePoint[] = [...Array(25)].map((_, i) => ({ date: iso(24 - i), close: 2, volume: 100_000 })); // $200k/ditë
check('gateLiquidity: 200k$/ditë < 2M$ → dështon', gateLiquidity(computeAvgDollarVolume(thin)).passed === false);
check('gateLiquidity: 5M$/ditë ≥ 2M$ → kalon', gateLiquidity(computeAvgDollarVolume(liqSeries)).passed === true);

const noVol: PricePoint[] = [...Array(25)].map((_, i) => ({ date: iso(24 - i), close: 50 })); // pa volum
check('gateLiquidity: pa volum nga burimi → null (fail-closed)', gateLiquidity(computeAvgDollarVolume(noVol)).passed === null);
check('gateLiquidity: null absolut → null me arsye', gateLiquidity(null, 's\'u morën').passed === null);

// ── 7) gatePersistence ────────────────────────────────────────────

const p1 = gatePersistence({ growth: 1, pageviews7dMedian: 200, baselineMedian: 100, risingWeeks: 3, peakToAvg: 1.5 });
check('gatePersistence: 3 javë + pa spike → kalon', p1.passed === true);

const p2 = gatePersistence({ growth: 1, pageviews7dMedian: 200, baselineMedian: 100, risingWeeks: 1, peakToAvg: 1.5 });
check('gatePersistence: vetëm 1 javë rritje → dështon', p2.passed === false);

const p3 = gatePersistence({ growth: 1, pageviews7dMedian: 200, baselineMedian: 100, risingWeeks: 3, peakToAvg: 6 });
check('gatePersistence: spike 6× > 4× → dështon (modë e shkurtër)', p3.passed === false);

check('gatePersistence: wiki null → null (fail-closed)', gatePersistence(null).passed === null);

// ── 8) evaluateGates + allGatesPassed ────────────────────────────

const all = evaluateGates({
  googleInFeed: true,
  wiki: { growth: 0.6, pageviews7dMedian: 300, baselineMedian: 200, risingWeeks: 3, peakToAvg: 1.5 },
  effectiveMateriality: 0.5, exposurePct: 0.6, capBucket: 'mid', linkType: 'direct',
  materialityReason: 'test',
  returnSinceStart: { stockRet: 0.02, indexRet: 0.01, relative: 0.01, fromDate: iso(20), asOf: iso(0), tradingDays: 14 },
  avgDollarVolume: 5_000_000,
});
check('evaluateGates: të gjitha provat e plota + të kaluara → allGatesPassed', allGatesPassed(all) === true);

const partial = evaluateGates({
  googleInFeed: true,
  wiki: null, wikiError: 'HTTP 404',
  effectiveMateriality: 0.5, exposurePct: 0.6, capBucket: 'mid', linkType: 'direct',
  materialityReason: 'test',
  returnSinceStart: { stockRet: 0.02, indexRet: 0.01, relative: 0.01, fromDate: iso(20), asOf: iso(0), tradingDays: 14 },
  avgDollarVolume: 5_000_000,
});
check('evaluateGates: wiki null bllokon (null ≠ kalim)', allGatesPassed(partial) === false);
check('evaluateGates: sources=null kur wiki mungon', partial.sources.passed === null && partial.persistence.passed === null);

const moved = evaluateGates({
  googleInFeed: true,
  wiki: { growth: 0.6, pageviews7dMedian: 300, baselineMedian: 200, risingWeeks: 3, peakToAvg: 1.5 },
  effectiveMateriality: 0.5, exposurePct: 0.6, capBucket: 'mid', linkType: 'direct',
  materialityReason: 'test',
  returnSinceStart: { stockRet: 0.15, indexRet: 0.01, relative: 0.14, fromDate: iso(20), asOf: iso(0), tradingDays: 14 },
  avgDollarVolume: 5_000_000,
});
check('evaluateGates: already_moved i vetëm mjafton të bllokojë', allGatesPassed(moved) === false && moved.not_priced.passed === false);

// ── 9) Migrimi v3 → v4 ──────────────────────────────────────────

const tmpDir = mkdtempSync(join(tmpdir(), 'sa-gates-'));
const v3Store = {
  version: 3,
  createdAt: '2026-09-01T00:00:00Z',
  lastScanAt: '2026-09-27T19:06:05Z',
  measurements: [{ observed_at: '2026-09-20', available_at: '2026-09-20', trend: 'starbucks', source: 'google_trends', region: 'US', interest: 1000, ticker: 'SBUX', product: 'Starbucks', company: 'Starbucks', materiality: 0.9, promo_risk: 0.2, event_risk: 0.3, stock_price: 95, index_price: 560 }],
  candidates: {
    'starbucks|SBUX|US': {
      key: 'starbucks|SBUX|US', trend: 'starbucks', ticker: 'SBUX', region: 'US',
      company: 'Starbucks', product: 'Starbucks (kafenetë)',
      status: 'WATCH', firstSeenAt: '2026-09-20T10:00:00Z', lastSeenAt: '2026-09-27T19:00:00Z', lastChangedAt: '2026-09-20T10:00:00Z',
      score: 62, breakdown: { demand: 20, confirmation: 8, materiality: 18, price: 8, quality: 5, event: 3 },
      reasons: ['test'], history: [{ at: '2026-09-20T10:00:00Z', from: 'NEW', to: 'DISCOVERED', reason: 'test' }],
      google: { inFeedToday: false, approxTraffic: null, traffic: null },
      gdelt: { articles1d: 5, growth: 0.3, confirmed: true },
      cause: null,
      price: { stockReturn: 0.01, indexReturn: 0.005, priceVsIndex: 0.005, asOf: '2026-09-26', fromDate: '2026-09-19', stockPrice: 95, indexPrice: 560, source: 'stockanalysis', error: null, checkedAt: '2026-09-27T19:00:00Z' },
      outcome: { baseDate: '2026-09-20', baseStock: 94, baseIndex: 555, d5: null, d20: null, pendingNote: 'prit edhe 5 ditë tregtimi për d5', lastCheckedAt: '2026-09-27T19:00:00Z' },
      // SKEMA V3: s'ka wiki/liquidity/sinceStart/gates — migrimi duhet t'i shtojë të zbrazëta
    },
  },
  scans: [{ at: '2026-09-27T19:06:05Z', durationMs: 45000, regions: ['US'], termsScanned: 40, termsClassified: 1, candidatesActive: 1, promoted: 0, removed: 0, sources: { google_trends: 'ok' }, errors: [] }],
};
writeFileSync(join(tmpDir, 'social-arb.json'), JSON.stringify(v3Store));

process.env.SOCIAL_ARB_DATA_DIR = tmpDir;
// leximi normalizon në v4 — import i vonuar pasi env të vendoset
const { readStore } = await import('../src/lib/social-arb/store');
const migrated = await readStore();
check('Migrimi: versioni bëhet 4', migrated.version === 4);
check('Migrimi: kandidati ruhet', Object.keys(migrated.candidates).length === 1);
const c = migrated.candidates['starbucks|SBUX|US'];
check('Migrimi: fushat e vjetra të paprekura (score, history, outcome)', c.score === 62 && c.history.length === 1 && c.outcome.pendingNote === 'prit edhe 5 ditë tregtimi për d5');
check('Migrimi: fushat e reja të zbrazëta (wiki/liquidity/gates)', c.wiki.growth === null && c.liquidity.avgDollarVolume === null && Array.isArray(c.gates) && c.gates.length === 0);
check('Migrimi: alreadyMoved false + materialityInfo e pritur', c.alreadyMoved === false && c.materialityInfo.capBucket === 'mid');
check('Migrimi: matjet ruhen (1 rresht)', migrated.measurements.length === 1);
check('Migrimi: skanimet ruhen (1 record)', migrated.scans.length === 1);
delete process.env.SOCIAL_ARB_DATA_DIR;
rmSync(tmpDir, { recursive: true, force: true });

// ── përfundim ────────────────────────────────────────────────────
console.log(`\n${pass} ✅ / ${fail} ❌ — ${fail === 0 ? 'TË GJITHA KALUAN' : 'KA DËSHTIME'}`);
process.exit(fail === 0 ? 0 : 1);
