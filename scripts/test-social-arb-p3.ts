// Test i pavarur i Pjesës 3 (Task 53 — skema v5):
//   1) classifyCause — kufijtë e fjalëve + pragjet raportuale:
//      «Crash Bandicoot» s'refuzohet, «execute» s'aktivizon «cut»,
//      «Niagara Falls» s'aktivizon «falls», 1 titull «recall» mes 100
//      s'refuzon, 25/100 refuzon, «workers strike» refuzon, pozitivi punon
//   2) computeTrendStart — dita e parë e rritjes së vazhdueshme (Camillo-style)
//   3) orderCandidatesForMeasurement — rotacioni: asnjë kandidat aktiv pa
//      matje më gjatë se ⌈aktivë/MAX⌉ skanime (anti-urie)
//   4) fillOutcomeFromAnchor — baza = close-i i ditës së TREGTIMIT PAS
//      ankorës (jo e njëjta ditë) + updatePromotionOutcome (F)
//   5) groupKeyOf / dedupeByGroupKey — një rast për term|ticker (E)
//   6) Migrimi v4→v5 — store-i i vjetër hapet pa humbje (fushat e reja
//      plotësohen; promotedAt rikonstruktohet nga historia)
// Ekzekutim: bun scripts/test-social-arb-p3.ts

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeTrendStart, groupKeyOf, dedupeByGroupKey,
} from '../src/lib/social-arb/gates';
import {
  classifyCause, orderCandidatesForMeasurement, fillOutcomeFromAnchor, updatePromotionOutcome,
} from '../src/lib/social-arb/engine';
import type { Candidate, Measurement } from '../src/lib/social-arb/types';
import type { PricePoint } from '../src/lib/social-arb/sources';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}

const DAY = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10);
const mkArticle = (title: string, i = 0) => ({ title, url: `https://x/${i}`, domain: 'x.com', seenAt: new Date().toISOString() });

// ── 1) classifyCause — kufijtë e fjalëve + pragjet raportuale ─────────────

// «Crash Bandicoot» është lojë — s'refuzon më (fjala 'crash' u hoq nga listat)
const crashTitles = [...Array(30)].map((_, i) => mkArticle(['Crash Bandicoot 5 gameplay shown',
  'Crash Bandicoot remaster tops charts', 'Fans love Crash Bandicoot', 'Crash Bandicoot sales surge'][i % 4], i));
const cCrash = classifyCause(crashTitles, null, null, new Date().toISOString());
check('classifyCause: «Crash Bandicoot» s\'refuzohet (lojë, jo aksident)', cCrash.type !== 'negative_event', cCrash.type);

// 'cut' brenda 'execute' — kufiri i fjalëve e ndalon
const execTitle = [...Array(20)].map((_, i) => mkArticle('Company executes growth plan for ' + (2026 + (i % 3)), i));
const cExec = classifyCause(execTitle, null, null, new Date().toISOString());
check('classifyCause: «executes» s\'përputhet me «cut» (kufij fjalësh)', cExec.type !== 'negative_event', cExec.type);

// 'falls' brenda «Niagara Falls» — kufiri i fjalëve e ndalon
const niagaraTitle = [...Array(20)].map((_, i) => mkArticle('Niagara Falls tourism record season', i));
const cFalls = classifyCause(niagaraTitle, null, null, new Date().toISOString());
check('classifyCause: «Niagara Falls» s\'përputhet me «falls»', cFalls.type !== 'negative_event', cFalls.type);

// 1 titull «recall» mes 100 — s'refuzon (raporti 1% < 20%)
const oneRecall = [...Array(100)].map((_, i) => mkArticle(i === 50 ? 'Toyota recalls 2M cars over airbags' : 'Brand launches new product line ' + i, i));
const c1 = classifyCause(oneRecall, null, null, new Date().toISOString());
check('classifyCause: 1 titull «recall» mes 100 s\'refuzon', c1.type !== 'negative_event', `${c1.type}`);

// 25 nga 100 tituj «recall» — refuzon (25% ≥ 20%)
const manyRecall = [...Array(100)].map((_, i) => mkArticle(i < 25 ? 'FDA announces recall of product batch ' + i : 'Brand news roundup ' + i, i));
const c2 = classifyCause(manyRecall, null, null, new Date().toISOString());
check('classifyCause: 25/100 tituj «recall» refuzojnë', c2.type === 'negative_event', c2.type);

// «workers strike» — frazë e saktë negative
const strikeTitles = [...Array(20)].map((_, i) => mkArticle(i < 6 ? 'Workers strike at main plant enters day 3' : 'Company updates guidance ' + i, i));
const c3 = classifyCause(strikeTitles, null, null, new Date().toISOString());
check('classifyCause: «workers strike» (6/20 tituj) refuzon', c3.type === 'negative_event', c3.type);

// pozitivi vazhdon të punojë — 2+ tituj me provë shitjesh
const posTitles = [...Array(10)].map((_, i) => mkArticle(i < 5 ? 'Sales surge continues for the brand, stores sold out' : 'Market report ' + i, i));
const c4 = classifyCause(posTitles, null, null, new Date().toISOString());
check('classifyCause: «sales surge»/«sold out» → pozitiv i mundshëm', c4.type === 'positive_demand_possible', c4.type);

// pa artikuj fare → unclear (jo negative_event)
const c5 = classifyCause([], null, null, new Date().toISOString());
check('classifyCause: zero artikuj → unclear', c5.type === 'unclear');

// 'stock falls' — frazë specifike, 4/10 tituj → refuzon
const stockFalls = [...Array(10)].map((_, i) => mkArticle(i < 4 ? 'Stock falls after weak guidance' : 'Product review ' + i, i));
const c6 = classifyCause(stockFalls, null, null, new Date().toISOString());
check('classifyCause: «stock falls» (4/10) refuzon', c6.type === 'negative_event', c6.type);

// ── 2) computeTrendStart ─────────────────────────────────────────────────

type WikiPt = { date: string; views: number };
function makeWikiSeries(fn: (daysAgo: number) => number, days = 90): WikiPt[] {
  const pts: WikiPt[] = [];
  for (let d = days; d >= 0; d--) pts.push({ date: iso(d), views: fn(d) });
  return pts;
}

// rritje 21-ditore (hapi në ditën 21): mediana 7-ditore e zbut kufirin me
// ~gjysmë dritareje → fillimi i raportuar 17 ditë më parë (jo 21) —
// e saktë, e qëndrueshme dhe brenda javës së parë të rritjes reale
const ts21 = computeTrendStart(makeWikiSeries(d => (d < 21 ? 300 : 100)), iso(0));
check('computeTrendStart: rritja 21-ditore zbulohet (jo null)', ts21 !== null, ts21 ?? 'null');
check('computeTrendStart: fillimi brenda javës së parë të rritjes reale',
  ts21 !== null && Date.parse(iso(21)) <= Date.parse(ts21) && Date.parse(ts21) <= Date.parse(iso(14)), ts21 ?? 'null');

// trendi i ngadaltë 8-javor Camillo-style — RAMPË e vazhdueshme (jo hap):
// nivelet ngjiten pa push që nga dita 56 — vetëm Wikipedia e sheh këtë formë.
// (Shënim: një HAP 8-javor do të saturonte bazën me lag — s'ka lift AKTIV
// më — bie te fallback firstSeen; kjo është sjellja e dëshiruar.)
const ts56 = computeTrendStart(makeWikiSeries(d => (d >= 56 ? 100 : 100 + (56 - d) * 5)), iso(0));
check('computeTrendStart: rampa 8-javore zbulohet', ts56 !== null, ts56 ?? 'null');
check('computeTrendStart: fillimi i rampës brenda javës së parë të rritjes reale',
  ts56 !== null && Date.parse(iso(63)) <= Date.parse(ts56) && Date.parse(ts56) <= Date.parse(iso(49)), ts56 ?? 'null');

// seri pa rritje → null (s'ka fillim)
check('computeTrendStart: seri e sheshtë → null',
  computeTrendStart(makeWikiSeries(() => 100), iso(0)) === null);

// seri e shkurtër → null (duhen ≥49 ditë për bazën 28d+lag 14d)
check('computeTrendStart: seri 30-ditore → null',
  computeTrendStart(makeWikiSeries(d => (d < 21 ? 300 : 100), 30), iso(0)) === null);

// spike-i njëditor S'krijon fillim trendi (mediana e zbut)
const spiky = makeWikiSeries(d => (d === 3 ? 5000 : 100));
check('computeTrendStart: spike njëditor s' + ' krijon trend → null',
  computeTrendStart(spiky, iso(0)) === null);

// ── 3) orderCandidatesForMeasurement — rotacioni (A) ────────────────────

const items = [
  { key: 'new-1', isNew: true },
  { key: 'new-2', isNew: true },
  ...[...Array(10)].map((_, i) => ({ key: `old-measured-${i}`, isNew: false })),
  ...[...Array(10)].map((_, i) => ({ key: `old-never-${i}`, isNew: false })),
];
const measuredAt = new Map<string, string | null>(
  [...Array(10)].map((_, i) => [`old-measured-${i}`, iso(24 - i * 0.5) as string]),
);
const lastOf = (k: string) => measuredAt.get(k) ?? null;
const ordered = orderCandidatesForMeasurement(items, lastOf);

check('rotacioni: të pamatërit (existing) të parët', ordered[0].key.startsWith('old-never'));
check('rotacioni: matjet e vjetra përpara të rinjve të feed-it', !ordered.slice(0, 10).some(x => x.isNew));
check('rotacioni: të rinjtë (new) në fund', ordered[ordered.length - 1].key === 'new-2' || ordered[ordered.length - 2].key === 'new-2');

// garancia N-skanimesh: 30 kandidatë aktivë, MAX 10 → të gjithë të matur brenda 3 skanimesh
const N_ACTIVE = 30, MAX = 10;
const actives = [...Array(N_ACTIVE)].map((_, i) => ({ key: `cand-${i}`, isNew: false }));
const lastMeasured = new Map<string, string | null>(actives.map(a => [a.key, null]));
const scansDone = (() => {
  let scans = 0;
  let allMeasured = actives.every(a => lastMeasured.get(a.key) !== null);
  while (!allMeasured && scans < 10) {
    scans++;
    const batch = orderCandidatesForMeasurement(actives, k => lastMeasured.get(k) ?? null).slice(0, MAX);
    for (const b of batch) lastMeasured.set(b.key, new Date().toISOString());
    allMeasured = actives.every(a => lastMeasured.get(a.key) !== null);
  }
  return scans;
})();
check(`rotacioni: ${N_ACTIVE} aktivë / MAX ${MAX} → të gjithë të matur brenda 3 skanimesh`, scansDone === 3, `skanime=${scansDone}`);

// ── 4) fillOutcomeFromAnchor — baza = dita PAS (F) ──────────────────────

const stock: PricePoint[] = [];
const spy: PricePoint[] = [];
for (let d = 30; d >= 0; d--) {
  const date = iso(d);
  stock.push({ date, close: 100 + (30 - d), volume: 1_000_000 });
  spy.push({ date, close: 500 });
}
// ankorja = dita e zbulimit (iso(20)); baza duhet të jetë close-i i ditës
// SË PARË të tregtimit PAS asaj date — jo i ditës së njëjtë
const anchor = iso(20);
const out = { baseDate: null as string | null, baseStock: null as number | null, baseIndex: null as number | null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null };
fillOutcomeFromAnchor(out, stock, spy, anchor, new Date().toISOString());
check('fillOutcomeFromAnchor: baza = dita e PARË e tregtimit PAS ankorës', out.baseDate === iso(19), `base=${out.baseDate} (pritur ${iso(19)})`);

// ankora sot → s'ka close të ardhshme ende → pending, jo bazë e rreme
const outToday = { baseDate: null as string | null, baseStock: null as number | null, baseIndex: null as number | null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null };
fillOutcomeFromAnchor(outToday, stock, spy, iso(0), new Date().toISOString());
check('fillOutcomeFromAnchor: ankora sot → pending, jo bazë', outToday.baseDate === null && !!outToday.pendingNote, outToday.pendingNote ?? '');

// updatePromotionOutcome — kandidati me promotedAt merr rezultat nga ai moment
const cand = {
  key: 'x|X|US', trend: 'x', ticker: 'X', region: 'US', company: 'X', product: 'X',
  status: 'RESEARCH', firstSeenAt: new Date(Date.now() - 25 * DAY).toISOString(),
  outcome: { baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null },
  outcomeFromPromotion: { promotedAt: null, baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null },
  history: [{ at: new Date(Date.now() - 10 * DAY).toISOString(), from: 'WATCH' as const, to: 'RESEARCH' as const, reason: 'test' }],
} as unknown as Candidate;
updatePromotionOutcome(cand, stock, spy, new Date().toISOString());
check('updatePromotionOutcome: promotedAt rikonstruktohet nga historia',
  cand.outcomeFromPromotion.promotedAt === cand.history[0].at);
check('updatePromotionOutcome: baza = dita e parë PAS promovimit (pak a shumë iso(9))',
  cand.outcomeFromPromotion.baseDate !== null && Date.parse(cand.outcomeFromPromotion.baseDate as string) <= Date.parse(iso(9)) && Date.parse(cand.outcomeFromPromotion.baseDate as string) >= Date.parse(iso(10)),
  `base=${cand.outcomeFromPromotion.baseDate}`);

// ── 5) groupKeyOf / dedupeByGroupKey — mostrat e pavarura (E) ────────────

check('groupKeyOf: normalizohet (lowercase term, uppercase ticker)',
  groupKeyOf('Starbucks', 'sbux') === 'starbucks|SBUX');

const mkCand = (region: string, firstSeenDaysAgo: number): Candidate => ({
  key: `starbucks|SBUX|${region}`, groupKey: 'starbucks|SBUX', trend: 'Starbucks', ticker: 'SBUX', region,
  company: 'Starbucks', product: 'x', status: 'WATCH', discoveredVia: 'google_trends',
  firstSeenAt: new Date(Date.now() - firstSeenDaysAgo * DAY).toISOString(),
  lastSeenAt: new Date().toISOString(), lastChangedAt: new Date().toISOString(), lastMeasuredAt: null, trendStart: null,
  score: 0, componentsAvailable: 6,
  breakdown: { demand: 0, confirmation: 0, materiality: 0, price: 0, quality: 0, event: 0 },
  reasons: [], history: [],
  google: { inFeedToday: false, approxTraffic: null, traffic: null },
  gdelt: { articles1d: null, growth: null, confirmed: false },
  cause: null,
  price: { stockReturn: null, indexReturn: null, priceVsIndex: null, asOf: null, fromDate: null, stockPrice: null, indexPrice: null, source: null, error: null, checkedAt: null },
  outcome: { baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null },
  outcomeFromPromotion: { promotedAt: null, baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null },
  wiki: { article: null, growth: null, pageviews7dMedian: null, baselineMedian: null, risingWeeks: null, peakToAvg: null, error: null, checkedAt: null },
  liquidity: { avgDollarVolume: null, error: null, checkedAt: null },
  sinceStart: { fromDate: null, asOf: null, tradingDays: null, stockRet: null, indexRet: null, relative: null, checkedAt: null },
  materialityInfo: { exposurePct: null, reason: '', capBucket: 'large', linkType: 'direct' },
  gates: [], alreadyMoved: false,
  catalyst: { nextEarningsDate: null, daysToEarnings: null, error: null, checkedAt: null },
});
const four = [mkCand('AU', 2), mkCand('GB', 5), mkCand('US', 12), mkCand('CA', 30), mkCand('WW', 40)];
const deduped = dedupeByGroupKey(four);
check('dedupeByGroupKey: 5 rajet → 1 rast statistikor', deduped.length === 1, `${deduped.length}`);
check('dedupeByGroupKey: fiton firstSeenAt më i hershëm (WW, 40 ditë)', deduped[0].region === 'WW', deduped[0].region);

// ── 6) Migrimi v4 → v5 ──────────────────────────────────────────────────

const tmpDir = mkdtempSync(join(tmpdir(), 'sa-p3-'));
const v4Store = {
  version: 4,
  createdAt: '2026-09-01T00:00:00Z',
  lastScanAt: '2026-10-06T19:06:05Z',
  measurements: [] as Measurement[],
  candidates: {
    'starbucks|SBUX|US': {
      key: 'starbucks|SBUX|US', trend: 'starbucks', ticker: 'SBUX', region: 'US',
      company: 'Starbucks', product: 'Starbucks (kafenetë)',
      status: 'RESEARCH', firstSeenAt: '2026-09-20T10:00:00Z', lastSeenAt: '2026-10-06T19:00:00Z', lastChangedAt: '2026-09-22T10:00:00Z',
      score: 62, breakdown: { demand: 20, confirmation: 8, materiality: 18, price: 8, quality: 5, event: 3 },
      reasons: ['test'], history: [
        { at: '2026-09-20T10:00:00Z', from: 'NEW', to: 'DISCOVERED', reason: 'test' },
        { at: '2026-09-22T10:00:00Z', from: 'WATCH', to: 'RESEARCH', reason: 'NGJITJE test' },
      ],
      google: { inFeedToday: false, approxTraffic: null, traffic: null },
      gdelt: { articles1d: 5, growth: 0.3, confirmed: true },
      cause: null,
      price: { stockReturn: 0.01, indexReturn: 0.005, priceVsIndex: 0.005, asOf: '2026-10-05', fromDate: '2026-09-28', stockPrice: 95, indexPrice: 560, source: 'stockanalysis', error: null, checkedAt: '2026-10-06T19:00:00Z' },
      outcome: { baseDate: '2026-09-21', baseStock: 94, baseIndex: 555, d5: null, d20: null, pendingNote: 'prit', lastCheckedAt: '2026-10-06T19:00:00Z' },
      // SKEMA V4: ka wiki/gates por JO fushat v5
      wiki: { article: 'Starbucks', growth: 0.4, pageviews7dMedian: 3000, baselineMedian: 2000, risingWeeks: 3, peakToAvg: 1.8, error: null, checkedAt: '2026-10-06T19:00:00Z' },
      liquidity: { avgDollarVolume: 4_000_000, error: null, checkedAt: '2026-10-06T19:00:00Z' },
      sinceStart: { fromDate: '2026-09-20', asOf: '2026-10-06', tradingDays: 11, stockRet: 0.02, indexRet: 0.01, relative: 0.01, checkedAt: '2026-10-06T19:00:00Z' },
      materialityInfo: { exposurePct: 0.95, reason: 'test', capBucket: 'large', linkType: 'direct' },
      gates: [{ gate: 'sources', passed: true, detail: 'test', checkedAt: '2026-10-06T19:00:00Z' }],
      alreadyMoved: false,
    },
  },
  scans: [],
};
writeFileSync(join(tmpDir, 'social-arb.json'), JSON.stringify(v4Store));
process.env.SOCIAL_ARB_DATA_DIR = tmpDir;
const { readStore } = await import('../src/lib/social-arb/store');
const v5 = await readStore();
const v5c = v5.candidates['starbucks|SBUX|US'];
check('Migrimi v4→v5: versioni bëhet 5', v5.version === 5);
check('Migrimi v4→v5: fushat e vjetra të paprekura (wiki.growth, score, outcome)',
  v5c.wiki.growth === 0.4 && v5c.score === 62 && v5c.outcome.baseDate === '2026-09-21');
check('Migrimi v4→v5: groupKey derivohet (pa rajon)', v5c.groupKey === 'starbucks|SBUX');
check('Migrimi v4→v5: promotedAt nga historia e ngjitjes',
  v5c.outcomeFromPromotion.promotedAt === '2026-09-22T10:00:00Z');
check('Migrimi v4→v5: fushat e reja me default (lastMeasuredAt/trendStart/catalyst)',
  v5c.lastMeasuredAt === null && v5c.trendStart === null && v5c.catalyst.nextEarningsDate === null && v5c.discoveredVia === 'google_trends');
check('Migrimi v4→v5: meta.wikiScanCursor = 0', v5.meta.wikiScanCursor === 0);
delete process.env.SOCIAL_ARB_DATA_DIR;
rmSync(tmpDir, { recursive: true, force: true });

// ── përfundim ────────────────────────────────────────────────────────────
console.log(`\n${pass} ✅ / ${fail} ❌ — ${fail === 0 ? 'TË GJITHA KALUAN' : 'KA DËSHTIME'}`);
process.exit(fail === 0 ? 0 : 1);
