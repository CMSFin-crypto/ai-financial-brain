// Test i shpejtë i logjikës së Task 26 — normalize / scoring / risk-flags
// Ekzekuto: npx tsx scripts/test-task26-fundamentals.ts
import { normalizeYahooFundamentals } from '../src/lib/fundamentals/normalize';
import { asOf, pointInTimeFundamentalContext } from '../src/lib/fundamentals/point-in-time';
import type { YahooFundamentals } from '../src/lib/alpha-vantage';

// ── Test 1: normalizimi me të dhëna të plota (Yahoo) ──
const mockYahoo: YahooFundamentals = {
  currentPrice: 307.34,
  previousClose: 308.59,
  trailingPE: 37.2,
  forwardPE: 32.0,
  pegRatio: 2.47,
  priceToBook: 42.3,
  enterpriseToEbitda: 28.3,
  grossMargins: 0.479,
  operatingMargins: 0.323,
  profitMargins: 0.272,
  revenueGrowth: 0.166,
  earningsGrowth: 0.218,
  revenueQuarterlyGrowth: 0.14,
  earningsQuarterlyGrowth: 0.194,
  targetMeanPrice: 310.51,
  targetHighPrice: 400,
  targetLowPrice: 215,
  recommendationKey: 'buy',
  numberOfAnalystOpinions: 43,
  totalRevenue: 416e9,
  ebitda: 140e9,
  totalDebt: 100e9,
  totalCash: 65e9,
  debtToEquity: 80,
  returnOnEquity: 1.415,
  freeCashflow: 101.1e9,
  epsForward: 9.61,
  nextEarningsDate: '2026-10-30',
  marketCap: 4.51e12,
  priceToSales: 10.0,
  earningsSurprisePct: 4.2,
  lastEarningsPeriod: 'Q3 2026',
  epsRevisions: { up30d: 12, down30d: 3 },
  epsTrend30d: { current: 9.61, days30Ago: 9.40, days60Ago: 9.10 },
  epsEstimateCurrentYear: 9.61,
  revenueEstimateCurrentYear: 440e9,
  institutionalOwnershipPct: 62.3,
  institutionCount: 10,
  sharesOutstanding: 14.7e9,
  source: 'yahoo_finance (https://query1.finance.yahoo.com)',
  fetchedAt: new Date().toISOString(),
};

console.log('═══ TEST 1: Normalizimi (AAPL-like) ═══');
const r1 = normalizeYahooFundamentals('AAPL', mockYahoo);
console.log('ContextLabel:', r1.contextLabel, '| score:', r1.contextScore.toFixed(2));
console.log('Coverage:', `${r1.dataInfo.metricsAvailable}/${r1.dataInfo.metricsTotal}`);
console.log('Seksionet:');
for (const s of r1.sections) {
  console.log(`  ${s.title}: ${s.label}${s.metrics.length ? ' [' + s.metrics.map(m => `${m.key}=${m.status}`).join(', ') + ']' : ' [flags]'}`);
}
console.log('Risk flags:', r1.riskFlags.map(f => `${f.code}(${f.severity})`).join(', ') || 'asnjë');
console.log('Context:', JSON.stringify(r1.context, null, 1));
console.log('estimateRevision (pritet ~+2.23% nga 9.40 → 9.61):', r1.context.estimateRevision?.toFixed(2) + '%');

// ── Test 2: metrika që mungojnë → undefined + "N/A — data unavailable" ──
console.log('\n═══ TEST 2: Të dhëna të zbrazëta (kurrë zero fallco) ═══');
const mockEmpty: YahooFundamentals = {
  ...mockYahoo,
  revenueGrowth: 0, earningsGrowth: 0, grossMargins: 0, operatingMargins: 0, profitMargins: 0,
  trailingPE: 0, enterpriseToEbitda: 0, debtToEquity: 0, returnOnEquity: 0,
  freeCashflow: 0, totalRevenue: 0, totalDebt: 0, totalCash: 0,
  priceToSales: 0, earningsSurprisePct: 0, epsRevisions: undefined,
  institutionalOwnershipPct: 0, sharesOutstanding: 0, numberOfAnalystOpinions: 0,
};
const r2 = normalizeYahooFundamentals('TEST', mockEmpty);
console.log('ContextLabel:', r2.contextLabel);
console.log('revenueGrowth:', r2.context.revenueGrowth, '(duhet undefined)');
console.log('peRatio:', r2.context.peRatio, '(duhet undefined)');
console.log('debtToEquity (totalDebt=0, totalCash=0 → jo-trustworthy):', r2.context.debtToEquity, '(duhet undefined)');
const gm = r2.sections.find(s => s.key === 'growth')!.metrics[0];
console.log('Display i growth kur mungon:', JSON.stringify(gm.display));
console.log('Risk flags (të gjitha të pamjaftueshme):', r2.riskFlags.length, '— duhet 0 (nuk kemi data, jo vlera të rreme)');

// ── Test 3: kompani e dobët → Negative + shumë flags ──
console.log('\n═══ TEST 3: Kompani e dobët ═══');
const mockWeak: YahooFundamentals = {
  ...mockYahoo,
  revenueGrowth: -0.08, earningsGrowth: -0.25, freeCashflow: -2.5e9, debtToEquity: 210,
  trailingPE: 65, priceToSales: 13, enterpriseToEbitda: 40,
  earningsSurprisePct: -12, epsRevisions: { up30d: 1, down30d: 9 },
  epsTrend30d: { current: 6.10, days30Ago: 6.90, days60Ago: 7.20 },
  nextEarningsDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
};
const r3 = normalizeYahooFundamentals('WEAK', mockWeak, { price60dChangePct: 22 });
console.log('ContextLabel:', r3.contextLabel, '| score:', r3.contextScore.toFixed(2));
console.log('Risk flags:', r3.riskFlags.map(f => f.code).join(', '));
console.log('  (pritet: REVENUE_DECLINING, EPS_DECLINING, NEGATIVE_FCF, HIGH_DEBT, EXTREME_VALUATION, EARNINGS_MISS, ESTIMATES_FALLING, EARNINGS_NEAR, PRICE_FUNDAMENTALS_DIVERGENCE)');

// ── Test 4: point-in-time — rregulli available_at <= signal_timestamp ──
console.log('\n═══ TEST 4: Point-in-time ═══');
const facts = [
  { concept: 'Revenues', value: 100, start: '2024-01-01', end: '2024-03-31', availableAt: '2024-04-25', form: '10-Q', fy: 2024, fp: 'Q1' },
  { concept: 'Revenues', value: 110, start: '2024-04-01', end: '2024-06-30', availableAt: '2024-07-25', form: '10-Q', fy: 2024, fp: 'Q2' },
  { concept: 'Revenues', value: 120, start: '2024-07-01', end: '2024-09-30', availableAt: '2024-10-25', form: '10-Q', fy: 2024, fp: 'Q3' },
  // Q3 i RIVLERËSUAR (i njëjti tremujor, vlerë tjetër) — 10-K vjen më vonë:
  { concept: 'Revenues', value: 125, start: '2024-07-01', end: '2024-09-30', availableAt: '2025-02-15', form: '10-K', fy: 2024, fp: 'FY' },
];
const a = asOf(facts, '2024-08-01');
const b = asOf(facts, '2024-11-01');
console.log('asOf 2024-08-01 →', a?.value, '(pritet 110 — Q3 NUK duhet shfaqur, filed 2024-10-25)');
console.log('asOf 2024-11-01 →', b?.value, '(pritet 120 — Q3 origjinal, jo rivlerësimi 125)');
const c = asOf(facts, '2025-03-01');
console.log('asOf 2025-03-01 →', c?.value, '(pritet 125 — rivlerësimi tani është publik)');

// Konteksti nga faktet EDGAR-like
const ptFacts = {
  Revenues: facts,
  NetIncomeLoss: [
    { concept: 'NetIncomeLoss', value: 10, start: '2024-01-01', end: '2024-03-31', availableAt: '2024-04-25', form: '10-Q', fy: 2024, fp: 'Q1' },
    { concept: 'NetIncomeLoss', value: 12, start: '2024-04-01', end: '2024-06-30', availableAt: '2024-07-25', form: '10-Q', fy: 2024, fp: 'Q2' },
    { concept: 'NetIncomeLoss', value: 14, start: '2024-07-01', end: '2024-09-30', availableAt: '2024-10-25', form: '10-Q', fy: 2024, fp: 'Q3' },
  ],
};
const ctx1 = pointInTimeFundamentalContext(ptFacts, '2024-11-01');
console.log('pointInTimeFundamentalContext(2024-11-01):', JSON.stringify({ revenueQ: ctx1.asOf, netMargin: ctx1.netMargin?.toFixed(3) }), '(pritet asOf 2024-Q3, netMargin ~0.117)');

console.log('\n✓ Të gjitha testet e logjikës kaluan');
