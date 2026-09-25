// ═══════════════════════════════════════════════════════════════
// TASK 26 — VERIFIKIMI I PLOTË I MOTORIT A/B (7 testet e spec-it)
// Ekzekuto: npx tsx scripts/test-task26-verification.ts
//
// Testet e kërkuara nga useri (emrat e sakta):
//   1. test_fundamental_timestamp_not_after_signal()
//   2. test_missing_fundamental_is_not_zero()
//   3. test_technical_only_does_not_use_fundamentals()
//   4. test_both_variants_use_same_execution_model()
//   5. test_costs_are_applied_to_both_variants()
//   6. test_oos_parameters_are_locked()
//   7. test_earnings_after_close_are_available_next_session()
//
// Nëse këto teste kalojnë, motori s'përdor informacion të ardhshëm
// (look-ahead) dhe krahasimi A/B është i drejtë.
// ═══════════════════════════════════════════════════════════════
import {
  runBacktest, prepareSymbol, BacktestContext, BacktestResult,
} from '../src/lib/validation/backtest-engine';
import {
  buildFundamentalTimeline, fundamentalContextAsOf, evaluateFundamentalFilter,
  FundamentalTimelineEntry,
} from '../src/lib/fundamentals/backtest-integration';
import {
  pointInTimeFundamentalContext, PointInTimeFact, asOf,
} from '../src/lib/fundamentals/point-in-time';
import {
  splitWindows, calendarWalkForward, CALENDAR_WF_SPECS,
} from '../src/lib/validation/walk-forward';
import type { HistoricalDataPoint } from '../src/lib/alpha-vantage';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`    ✓ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`    ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const J = (x: unknown) => JSON.stringify(x);

// ═══════════════ 1. GJENERUESI I TË DHËNAVE SINTETIKE ═══════════════

/** Ditët e tregtimit (pa të shtunë/ të diel) — n ditë nga një datë. */
function tradingDays(startDate: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(startDate + 'T00:00:00Z');
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Trend i qetë ngritës — për SPY/QQQ/ETF-të e sektorit. */
function trendBars(days: string[], startPrice: number, dailyPct: number, volume: number): HistoricalDataPoint[] {
  let p = startPrice;
  return days.map((date, i) => {
    const wobble = i % 2 === 0 ? 0.0008 : -0.0005;
    const open = +(p * 1.0002).toFixed(4);
    const close = +(p * (1 + dailyPct + wobble)).toFixed(4);
    const high = +(Math.max(open, close) * 1.001).toFixed(4);
    const low = +(Math.min(open, close) * 0.999).toFixed(4);
    p = close;
    return { date, open, high, low, close, volume };
  });
}

/** VIX i qetë (15) — regjimi OK. */
function flatBars(days: string[], level: number): HistoricalDataPoint[] {
  return days.map(date => ({
    date, open: level, high: +(level * 1.02).toFixed(2), low: +(level * 0.98).toFixed(2), close: level, volume: 0,
  }));
}

/**
 * Cikli 22-ditor i aksionit: 14 ditë ngritje (+0.55%), 5 ditë pullback
 * (-1.15%), 3 ditë rikthim (+0.6%). Volumi: 5M bazë, pullback në rënie
 * (4.5→2.5M), dita e parë e rikthimit 6.5M (spike). Faza 18 = dita e
 * sinjalit klasik PULLBACK (pbDays 5, pbPct ~-4.9%, RSI ~50-60).
 */
function cycleStockBars(days: string[], startPrice: number, phaseOffset: number): HistoricalDataPoint[] {
  let p = startPrice;
  return days.map((date, i) => {
    const phase = (i + phaseOffset) % 22;
    let pct: number;
    if (phase < 14) pct = 0.0055;
    else if (phase < 19) pct = -0.0115;
    else pct = 0.006;
    const open = +(p * 1.0005).toFixed(4);
    const close = +(p * (1 + pct)).toFixed(4);
    const high = +(Math.max(open, close) * 1.006).toFixed(4);
    const low = +(Math.min(open, close) * 0.994).toFixed(4);
    let volume = 5_000_000;
    if (phase >= 14 && phase < 19) volume = 4_500_000 - (phase - 14) * 500_000;
    if (phase === 19) volume = 6_500_000; // dita e parë e rikthimit — spike
    p = close;
    return { date, open, high, low, close, volume };
  });
}

// ═══════════════ 2. FAKTET FUNDAMENTALE SINTETIKE ═══════════════

/** 8 tremujorë: 2021-Q3 … 2023-Q2 — të gjithë filed në një datë. */
const QUARTER_ENDS = [
  '2021-09-30', '2021-12-31', '2022-03-31', '2022-06-30',
  '2022-09-30', '2022-12-31', '2023-03-31', '2023-06-30',
];
function quarterStart(end: string): string {
  const d = new Date(end + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString().slice(0, 10);
}

/**
 * Fakte EDGAR-style për një kompani. Metrikat që prodhon:
 *   revenueGrowth = (1+g)^4 − 1   (rritje vjetore)
 *   epsGrowth     = (1+e)^4 − 1
 *   FCF TTM       = YTD_tani + FY_vjetër − YTD_vjeçar  (metoda kumulative)
 *   debtToEquity  = debt / equity × 100
 */
function makeFacts(opts: {
  revGrowthPerQ: number; epsGrowthPerQ: number; debt: number; equity: number;
  ocfYtdNow: number; ocfYtdPrior: number; ocfFY: number;
  capexYtdNow: number; capexYtdPrior: number; capexFY: number;
  filed: string;
}): Record<string, PointInTimeFact[]> {
  const f = opts.filed;
  const rev: PointInTimeFact[] = QUARTER_ENDS.map((end, k) => ({
    concept: 'Revenues', value: +(100 * Math.pow(1 + opts.revGrowthPerQ, k)).toFixed(2),
    start: quarterStart(end), end, availableAt: f, form: k % 4 === 3 ? '10-K' : '10-Q', fy: 2021 + Math.floor((k + 2) / 4), fp: `Q${(k % 4) + 1}`,
  }));
  const eps: PointInTimeFact[] = QUARTER_ENDS.map((end, k) => ({
    concept: 'EarningsPerShareDiluted', value: +(1.2 * Math.pow(1 + opts.epsGrowthPerQ, k)).toFixed(4),
    start: quarterStart(end), end, availableAt: f, form: k % 4 === 3 ? '10-K' : '10-Q', fy: 2021 + Math.floor((k + 2) / 4), fp: `Q${(k % 4) + 1}`,
  }));
  const ocfs = (mult: number) => (v: number, s: string, e: string): PointInTimeFact => ({
    concept: mult, value: v, start: s, end: e, availableAt: f, form: '10-Q', fy: 2023, fp: 'Q2',
  });
  const ocf: PointInTimeFact[] = [
    ocfs('NetCashProvidedByUsedInOperatingActivities')(opts.ocfYtdPrior, '2022-01-01', '2022-06-30'),
    ocfs('NetCashProvidedByUsedInOperatingActivities')(opts.ocfFY, '2022-01-01', '2022-12-31'),
    ocfs('NetCashProvidedByUsedInOperatingActivities')(opts.ocfYtdNow, '2023-01-01', '2023-06-30'),
  ];
  const capex: PointInTimeFact[] = [
    ocfs('PaymentsToAcquirePropertyPlantAndEquipment')(opts.capexYtdPrior, '2022-01-01', '2022-06-30'),
    ocfs('PaymentsToAcquirePropertyPlantAndEquipment')(opts.capexFY, '2022-01-01', '2022-12-31'),
    ocfs('PaymentsToAcquirePropertyPlantAndEquipment')(opts.capexYtdNow, '2023-01-01', '2023-06-30'),
  ];
  const equity: PointInTimeFact[] = [{
    concept: 'StockholdersEquity', value: opts.equity, start: '2023-06-30', end: '2023-06-30',
    availableAt: f, form: '10-Q', fy: 2023, fp: 'Q2',
  }];
  const debt: PointInTimeFact[] = [{
    concept: 'LongTermDebt', value: opts.debt, start: '2023-06-30', end: '2023-06-30',
    availableAt: f, form: '10-Q', fy: 2023, fp: 'Q2',
  }];
  return {
    Revenues: rev, EarningsPerShareDiluted: eps,
    NetCashProvidedByUsedInOperatingActivities: ocf,
    PaymentsToAcquirePropertyPlantAndEquipment: capex,
    StockholdersEquity: equity, LongTermDebt: debt,
  };
}

/** Fakte MIRA — kalojnë standardin DHE strict-in. */
function goodFacts(filed: string) {
  return makeFacts({
    revGrowthPerQ: 0.03, epsGrowthPerQ: 0.035, debt: 3e9, equity: 5e9,
    ocfYtdNow: 2.0e9, ocfYtdPrior: 1.8e9, ocfFY: 4.2e9,
    capexYtdNow: -0.6e9, capexYtdPrior: -0.5e9, capexFY: -1.2e9,
    filed,
  });
}
/** Fakte KEQIA — revenue −20% vjetore (REVENUE_CRASH). */
function badFacts(filed: string) {
  return makeFacts({
    revGrowthPerQ: -0.055, epsGrowthPerQ: -0.03, debt: 4e9, equity: 5e9,
    ocfYtdNow: 0.4e9, ocfYtdPrior: 0.9e9, ocfFY: 2.0e9,
    capexYtdNow: -0.9e9, capexYtdPrior: -0.7e9, capexFY: -1.6e9,
    filed,
  });
}

// ═══════════════ 3. KONTEKSTI SINTETIK I MOTORIT ═══════════════

const DAYS = tradingDays('2023-06-01', 340);

function buildCtx(fundamentals?: Record<string, FundamentalTimelineEntry[]>): BacktestContext {
  const spy = prepareSymbol('SPY', 'Index', trendBars(DAYS, 400, 0.0010, 80e6));
  const qqq = prepareSymbol('QQQ', 'Index', trendBars(DAYS, 320, 0.0012, 50e6));
  const vix = prepareSymbol('^VIX', 'Volatility', flatBars(DAYS, 15));
  const xlk = prepareSymbol('XLK', 'ETF', trendBars(DAYS, 150, 0.0015, 3e6));
  const xly = prepareSymbol('XLY', 'ETF', trendBars(DAYS, 140, 0.0014, 2.5e6));
  const symbols = [
    prepareSymbol('TECH1', 'Tech', cycleStockBars(DAYS, 50, 0)),
    prepareSymbol('TECH2', 'Tech', cycleStockBars(DAYS, 45, 7)),
    prepareSymbol('CONS1', 'Consumer', cycleStockBars(DAYS, 55, 11)),
    prepareSymbol('CONS2', 'Consumer', cycleStockBars(DAYS, 48, 3)),
  ];
  return {
    calendar: DAYS, symbols, spy, qqq, vix,
    sectorEtfs: { Tech: xlk, Consumer: xly },
    universeSize: symbols.length, equity: 25000, fundamentals,
  };
}

const FULL_OPTS = { startIndex: 0, endIndex: DAYS.length - 1 } as const;

/** Dita e sinjalit të një tregtie (entry = dita pas sinjalit). */
function signalDayOf(entryDate: string): string {
  const i = DAYS.indexOf(entryDate);
  return i > 0 ? DAYS[i - 1] : entryDate;
}

// ═══════════════ TESTET ═══════════════

function test_fundamental_timestamp_not_after_signal(): void {
  console.log('── 1. test_fundamental_timestamp_not_after_signal ──');
  // (a) Timeline: usableFrom = filed + 1 ditë — asnjë snapshot i dukshëm ditën e vet
  const tl = buildFundamentalTimeline(goodFacts('2023-08-15'));
  check('timeline ka 1 snapshot (1 datë filing-u)', tl.length === 1, `ka ${tl.length}`);
  check('usableFrom = 2023-08-16 (filed 08-15 + 1 ditë)', tl[0].usableFrom === '2023-08-16' && tl[0].filed === '2023-08-15');

  // (b) Çdo ditë D: konteksti i kthyer ka usableFrom ≤ D (kurrë pas D-së)
  let allOk = true;
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2023, 5, 1) + i * 86400000).toISOString().slice(0, 10);
    const snap = fundamentalContextAsOf(tl, d);
    if (snap && tl.find(e => e.context === snap)!.usableFrom > d) allOk = false;
  }
  check('për ÇDO ditë D: snapshot-i i përdorur ka usableFrom ≤ D', allOk);
  check('sinjal më 2023-08-15 (dita e filing-ut) → pa kontekst', fundamentalContextAsOf(tl, '2023-08-15') === null);
  check('sinjal më 2023-08-14 (para filing-ut) → pa kontekst', fundamentalContextAsOf(tl, '2023-08-14') === null);
  const ctx1 = fundamentalContextAsOf(tl, '2023-08-16');
  check('sinjal më 2023-08-16 (D+1) → sheh kontekstin', ctx1 !== null && ctx1.revenueGrowth !== undefined && ctx1.revenueGrowth > 0);

  // (c) asOf(): faktet me availableAt > signal_timestamp hidhen poshtë
  const facts = [{ availableAt: '2025-06-01', v: 1 }];
  check('asOf: fakt i 2025-06-01 me sinjal 2025-05-31 → NULL', asOf(facts, '2025-05-31') === null);
  check('asOf: fakt i 2025-06-01 me sinjal 2025-06-02 → merret', asOf(facts, '2025-06-02') !== null);

  // (d) NIVELI I MOTORIT: filing i KEQ i filed në days[240] → sinjalet nga dita
  // e parë ≥ usableFrom bllokohen; asnjë tregti TECH2 me sinjal ≥ usableFrom
  const filedDay = DAYS[240];
  const usableFrom = new Date(new Date(filedDay + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
  const ctxA = buildCtx();
  const resA = runBacktest(ctxA, { ...FULL_OPTS, variant: 'full' });
  const tlBad = buildFundamentalTimeline(badFacts(filedDay));
  const ctxB = buildCtx({ TECH2: tlBad });
  const resB = runBacktest(ctxB, { ...FULL_OPTS, variant: 'full-fund' });
  check(`parakusht: A ka tregti TECH2 (${resA.trades.filter(t => t.symbol === 'TECH2').length} total)`, resA.trades.some(t => t.symbol === 'TECH2'));
  const bLate = resB.trades.filter(t => t.symbol === 'TECH2' && signalDayOf(t.entryDate) >= usableFrom);
  check(`B: asnjë tregti TECH2 me sinjal ≥ usableFrom (${usableFrom})`, bLate.length === 0, `${bLate.length} të tilla`);
  check('B: FUND_REVENUE_CRASH në rejectReasons', (resB.rejectReasons['FUND_REVENUE_CRASH'] ?? 0) > 0);
  check('B: sinjale të vlerësuara nga filtri (fundEvaluated > 0)', (resB.fundEvaluated ?? 0) > 0);
}

function test_missing_fundamental_is_not_zero(): void {
  console.log('── 2. test_missing_fundamental_is_not_zero ──');
  // (a) Kontekst null → kalon standardin, 4 kontrolle N/A (jo zero)
  const r1 = evaluateFundamentalFilter(null, 'standard');
  check('kontekst null → PASS (N/A ≠ FAIL) me naChecks=4', r1.pass === true && r1.naChecks === 4 && r1.hasAnyData === false);
  const r2 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: 0.08 }, 'standard');
  check('vetëm revenue 8% → PASS me naChecks=3 (jo 0)', r2.pass === true && r2.naChecks === 3);

  // (b) Metrikat që mungojnë janë undefined — KURRAHSE zero fallco
  const c = pointInTimeFundamentalContext({}, '2024-06-01T00:00:00Z');
  check('pa fakte: revenueGrowth undefined (jo 0)', c.revenueGrowth === undefined);
  check('pa fakte: epsGrowth undefined (jo 0)', c.epsGrowth === undefined);
  check('pa fakte: freeCashFlow undefined (jo 0)', c.freeCashFlow === undefined);
  check('pa fakte: debtToEquity undefined (jo 0)', c.debtToEquity === undefined);

  // (c) NIVELI I MOTORIT: 3 simbole pa timeline (N/A) + vetëm CONS2 me fakte
  //     mira → standardi nuk bllokon asgjë → tregti IDENTIKE me A
  const ctxA = buildCtx();
  const resA = runBacktest(ctxA, { ...FULL_OPTS, variant: 'full' });
  const ctxB = buildCtx({ CONS2: buildFundamentalTimeline(goodFacts('2023-08-15')) });
  const resB = runBacktest(ctxB, { ...FULL_OPTS, variant: 'full-fund' });
  check('3 simbole N/A + 1 mirë → tregti IDENTIKE me A (N/A ≠ FAIL)', J(resB.trades) === J(resA.trades));
  check('sinjalet N/A numërohen (fundNaPassed > 0)', (resB.fundNaPassed ?? 0) > 0, `ka ${resB.fundNaPassed ?? 0}`);

  // (d) KONTRASTI STRICT: N/A = FAIL → bllokohen TECH1/TECH2/CONS1
  const resS = runBacktest(ctxB, { ...FULL_OPTS, variant: 'full-fund-strict' });
  const symsS = new Set(resS.trades.map(t => t.symbol));
  check('strict: vetëm simbolet me të dhëna tregtojnë (CONS2)', symsS.has('CONS2') && !symsS.has('TECH1') && !symsS.has('TECH2') && !symsS.has('CONS1'));
  check('strict: FUND_MISSING_DATA në rejectReasons', (resS.rejectReasons['FUND_MISSING_DATA'] ?? 0) > 0);
}

function test_technical_only_does_not_use_fundamentals(): void {
  console.log('── 3. test_technical_only_does_not_use_fundamentals ──');
  // A ekzekutohet 2 herë: pa fundamentet dhe me fundamentet KEQIA për të
  // gjithë simbolet. Nëse A do të lexonte ctx.fundamentals, rezultatet
  // do të ndryshonin — por A është technical-only.
  const ctxNoFund = buildCtx();
  const resNoFund = runBacktest(ctxNoFund, { ...FULL_OPTS, variant: 'full' });

  const badAll: Record<string, FundamentalTimelineEntry[]> = {};
  for (const s of ['TECH1', 'TECH2', 'CONS1', 'CONS2']) {
    badAll[s] = buildFundamentalTimeline(badFacts('2023-08-15'));
  }
  const ctxWithBad = buildCtx(badAll);
  const resWithBad = runBacktest(ctxWithBad, { ...FULL_OPTS, variant: 'full' });

  check('varianti A: tregti IDENTIKE me ose pa fundamente keqia', J(resWithBad.trades) === J(resNoFund.trades));
  check('varianti A: sinjale IDENTIKE', resWithBad.signalsGenerated === resNoFund.signalsGenerated);
  const fundKeys = Object.keys(resWithBad.rejectReasons).filter(k => k.startsWith('FUND_'));
  check('varianti A: ZERO arsye FUND_* në rejects', fundKeys.length === 0, J(fundKeys));
  check('varianti A: nuk ka fusha fundEvaluated/fundNaPassed', resWithBad.fundEvaluated === undefined && resWithBad.fundNaPassed === undefined);
  check('parakusht: tregti të gjeneruara në A', resNoFund.trades.length > 0, `${resNoFund.trades.length}`);
}

function test_both_variants_use_same_execution_model(): void {
  console.log('── 4. test_both_variants_use_same_execution_model ──');
  // Kur të GJITHA fundamentet kalojnë, B duhet të jetë IDENTIK me A —
  // d.m.th. i njëjti entry/stop/target/risk/shares/kosto/dates.
  const goodAll: Record<string, FundamentalTimelineEntry[]> = {};
  for (const s of ['TECH1', 'TECH2', 'CONS1', 'CONS2']) {
    goodAll[s] = buildFundamentalTimeline(goodFacts('2023-08-15'));
  }
  const ctxA = buildCtx();
  const resA = runBacktest(ctxA, { ...FULL_OPTS, variant: 'full' });
  const ctxB = buildCtx(goodAll);
  const resB = runBacktest(ctxB, { ...FULL_OPTS, variant: 'full-fund' });

  check('B (të gjitha mirë) = A: listat e tregtive IDENTIKE deri në qindarkë', J(resB.trades) === J(resA.trades));
  const t0 = resA.trades[0];
  if (t0) {
    const b0 = resB.trades[0];
    check('i njëjti entry/stop/target/shares', b0 && t0.entryPrice === b0.entryPrice && t0.stop === b0.stop && t0.target === b0.target && t0.shares === b0.shares);
    check('e njëjta datë hyrjeje + e njëjta dalje + i njëjti r', b0 && t0.entryDate === b0.entryDate && t0.exitDate === b0.exitDate && Math.abs(t0.r - b0.r) < 1e-9);
  }
  check('i njëjti numër sinjalesh + rejects', resB.signalsGenerated === resA.signalsGenerated && resB.entryOrdersRejected === resA.entryOrdersRejected);

  // Kur një simbol DESHTON filtrin, VETËM ai humbet tregti — dhe çdo sinjal i
  // bllokuar kishte kaluar TË GJITHA portat teknike (porta e fundit):
  //   signals(B) + bllokimet FUND_* = signals(A) — izolim i saktë.
  const ctxBad = buildCtx({ TECH2: buildFundamentalTimeline(badFacts('2023-08-15')) });
  const resBad = runBacktest(ctxBad, { ...FULL_OPTS, variant: 'full-fund' });
  const fundBlockedTotal = Object.entries(resBad.rejectReasons)
    .filter(([k]) => k.startsWith('FUND_')).reduce((a, [, v]) => a + v, 0);
  check('izolimi: signals(B) + FUND_* bllokime = signals(A) (porta e fundit teknik)',
    resBad.signalsGenerated + fundBlockedTotal === resA.signalsGenerated,
    `B=${resBad.signalsGenerated} + FUND=${fundBlockedTotal} vs A=${resA.signalsGenerated}`);
  const badSet = new Set(resBad.trades.filter(t => t.symbol === 'TECH2').map(t => t.entryDate));
  const aSet = new Set(resA.trades.filter(t => t.symbol === 'TECH2').map(t => t.entryDate));
  check('B me filtrim: tregtit TECH2 janë nëngrup i A-së', [...badSet].every(d => aSet.has(d)) && badSet.size < aSet.size, `A=${aSet.size} B=${badSet.size}`);
}

function test_costs_are_applied_to_both_variants(): void {
  console.log('── 5. test_costs_are_applied_to_both_variants ──');
  const goodAll: Record<string, FundamentalTimelineEntry[]> = {};
  for (const s of ['TECH1', 'TECH2', 'CONS1', 'CONS2']) {
    goodAll[s] = buildFundamentalTimeline(goodFacts('2023-08-15'));
  }
  const ctxA = buildCtx();
  const resA = runBacktest(ctxA, { ...FULL_OPTS, variant: 'full' });
  const resB = runBacktest(buildCtx(goodAll), { ...FULL_OPTS, variant: 'full-fund' });

  const checkCosts = (label: string, res: BacktestResult) => {
    const allCosts = res.trades.every(t => t.costs > 0);
    check(`${label}: çdo tregti ka kosto > 0`, allCosts);
    const netOk = res.trades.every(t => Math.abs(t.pnlGross - t.pnlNet - t.costs) < 0.02);
    check(`${label}: pnlNet = pnlGross − costs (deri në qindarkë)`, netOk);
    const commOk = res.trades.every(t => t.costsBreakdown.commission >= 1.9); // 2 × min $1 (hyrje+dalje)
    check(`${label}: komisione reale IBKR (≥ $1/anë)`, commOk);
    const grossDiff = res.trades.filter(t => Math.abs(t.pnlGross - t.pnlNet) < 0.005).length;
    check(`${label}: asnjë tregti pa kosto (gross ≠ net për të gjitha)`, grossDiff === 0);
  };
  checkCosts('A (technical-only)', resA);
  checkCosts('B (tech + fundamental)', resB);
  const costSame = resA.trades.length === resB.trades.length &&
    resA.trades.every((t, i) => t.costs === resB.trades[i].costs && t.costsBreakdown.commission === resB.trades[i].costsBreakdown.commission);
  check('A dhe B: KOSTO IDENTIKE për tregti identike', costSame);

  // Risk 0.5% (spec i userit): e njëjta tregti e parë, sasia nga buxheti i
  // rrezikut — me MBROJTJEN no-leverage (pozicioni ≤ cash): formula e saktë.
  const resHalf = runBacktest(buildCtx(), { ...FULL_OPTS, variant: 'full', execution: { riskPctPerTrade: 0.5 } });
  const t10 = resA.trades[0], t05 = resHalf.trades[0];
  check('risk 0.5%: e njëjta tregti e parë (simbol/dita/entry/stop)', !!t05 && t05.symbol === t10.symbol && t05.entryDate === t10.entryDate && t05.entryPrice === t10.entryPrice && t05.stop === t10.stop);
  const rps = t10.entryPrice - t10.stop; // riskPerShare (stop i njëjtë)
  const riskShares05 = Math.floor((25000 * 0.005) / rps);   // buxheti 0.5% i rrezikut
  const riskShares10 = Math.floor((25000 * 0.010) / rps);   // buxheti 1.0%
  const cashCap = Math.floor(25000 / t10.entryPrice);       // pa leverage: ≤ cash
  check(`risk 0.5%: shares = floor(buxheti/riskPerShare) = ${riskShares05}`, t05.shares === riskShares05, `aktualisht ${t05?.shares}`);
  check(`risk 1.0%: shares = min(risk ${riskShares10}, cash ${cashCap}) — no-leverage cap`, t10.shares === Math.min(riskShares10, cashCap), `aktualisht ${t10.shares}`);
  check('risk 0.5% ≤ risk 1.0% në shares (gjysma e rrezikut)', t05.shares <= t10.shares);
}

function test_oos_parameters_are_locked(): void {
  console.log('── 6. test_oos_parameters_are_locked ──');
  // (a) Ndarja IS/OOS është deterministe — e njëjta për A dhe B
  const s1 = splitWindows(2610, { isPct: 0.70, wfWindows: 4 });
  const s2 = splitWindows(2610, { isPct: 0.70, wfWindows: 4 });
  check('splitWindows deterministik (dy thirrje identike)', J(s1) === J(s2));
  const expectedOosStart = Math.floor(2610 * 0.70); // 70/30 — e njëjta formulë për A dhe B
  check(`IS/OOS 70/30: oosStart = floor(2610×0.70) = ${expectedOosStart}`, s1.static.oosStart === expectedOosStart && s1.static.isEnd === expectedOosStart - 1);

  // (b) Spec-i kalendrik WF është i NDRYSHUESHËM — 5 dritare të fikuara
  const frozenSpecs = [
    { trainFrom: '2016-01-01', trainTo: '2020-12-31', testFrom: '2021-01-01', testTo: '2021-12-31' },
    { trainFrom: '2017-01-01', trainTo: '2021-12-31', testFrom: '2022-01-01', testTo: '2022-12-31' },
    { trainFrom: '2018-01-01', trainTo: '2022-12-31', testFrom: '2023-01-01', testTo: '2023-12-31' },
    { trainFrom: '2019-01-01', trainTo: '2023-12-31', testFrom: '2024-01-01', testTo: '2024-12-31' },
    { trainFrom: '2020-01-01', trainTo: '2024-12-31', testFrom: '2025-01-01', testTo: '2025-12-31' },
  ];
  const specDates = CALENDAR_WF_SPECS.map(s => ({ trainFrom: s.trainFrom, trainTo: s.trainTo, testFrom: s.testFrom, testTo: s.testTo }));
  check('CALENDAR_WF_SPECS: 5 dritare të fikuar paraprakisht (2016–2025)', J(specDates) === J(frozenSpecs));

  // (c) Dritaret kalendrike mbi kalendar real: pa mbivendosje, vjet të plota
  const longDays = tradingDays('2015-09-01', 2620);
  const wf1 = calendarWalkForward(longDays);
  const wf2 = calendarWalkForward(longDays);
  check('calendarWalkForward deterministik', J(wf1) === J(wf2));
  check('5 dritare WF mbi 10 vjet të dhëna', wf1.length === 5, `ka ${wf1.length}`);
  let yearsOk = true, overlapOk = true;
  for (let i = 0; i < wf1.length; i++) {
    const w = wf1[i];
    if (!w.testFrom.startsWith(`${2021 + i}-01`) || !w.trainTo.startsWith(`${2020 + i}-12`)) yearsOk = false;
    if (w.trainEnd >= w.testStart) overlapOk = false;
    if (i > 0 && w.testFrom <= wf1[i - 1].testTo) overlapOk = false;
  }
  check('test-et janë vitet 2021–2025 (të plota, kalendarike)', yearsOk);
  check('pa mbivendosje train/test dhe midis dritareve', overlapOk);

  // (d) Parametrat e motorit të njëjtë midis run-eve (pa drift post-hoc)
  const ctxA = buildCtx();
  const r1 = runBacktest(ctxA, { ...FULL_OPTS, variant: 'full' });
  const r2 = runBacktest(ctxA, { ...FULL_OPTS, variant: 'full' });
  check('run-i i dytë i A: IDENTIK (pa optimizim të fshehur)', J(r1.trades) === J(r2.trades) && r1.signalsGenerated === r2.signalsGenerated);

  // (e) A dhe B të gjitha-mira: të njëjtat dritare → i njëjti numër sinjalesh
  const goodAll: Record<string, FundamentalTimelineEntry[]> = {};
  for (const s of ['TECH1', 'TECH2', 'CONS1', 'CONS2']) {
    goodAll[s] = buildFundamentalTimeline(goodFacts('2023-08-15'));
  }
  const rB = runBacktest(buildCtx(goodAll), { ...FULL_OPTS, variant: 'full-fund' });
  check('A dhe B: sinjalet hyrëse IDENTIKE (të njëjtat dritare/parametra)', rB.signalsGenerated === r1.signalsGenerated);
}

function test_earnings_after_close_are_available_next_session(): void {
  console.log('── 7. test_earnings_after_close_are_available_next_session ──');
  // Shembulli i userit: earnings 2025-04-10 16:05 (pas mbylljes 16:00)
  // → i lejuar VETËM për sinjalet e 2025-04-11 e tutje.
  const tl = buildFundamentalTimeline(badFacts('2025-04-10'));
  check('filing 2025-04-10 → usableFrom 2025-04-11', tl[0].usableFrom === '2025-04-11');
  check('sinjal 2025-04-10 16:00 NUK e sheh filing-un e 16:05', fundamentalContextAsOf(tl, '2025-04-10') === null);
  check('sinjal 2025-04-11 → sheh filing-un (dita pasuese)', fundamentalContextAsOf(tl, '2025-04-11') !== null);
  // Rasti i lejuar intraday: available 15:30 ≤ signal 16:00 — të dhënat
  // ditore s'i dallojnë orët, prandaj motori zbaton rregullin MË TË
  // RREPTË (D+1 gjithmonë) — kjo e përmban me siguri rastin 15:30.
  const tl2 = buildFundamentalTimeline(goodFacts('2025-04-10'));
  const before = fundamentalContextAsOf(tl2, '2025-04-10');
  check('edhe filing-u mirë i 15:30: dita e vetë NUK e përdor (konservativ)', before === null);
  const after = fundamentalContextAsOf(tl2, '2025-04-11');
  check('dita pasuese e sheh plotësisht (revenueGrowth (1.03)^4−1 ≈ +12.55%)',
    after !== null && after.revenueGrowth !== undefined && Math.abs(after.revenueGrowth - (Math.pow(1.03, 4) - 1)) < 1e-3,
    `aktualisht ${after?.revenueGrowth}`);

  // NIVELI I MOTORIT: filing i KEQ publikuar DITËN E SINJALIT —
  // sinjali i asaj dite kalon (s'e pa ende), bllokohet nga nesër.
  const ctxA = buildCtx();
  const resA = runBacktest(ctxA, { ...FULL_OPTS, variant: 'full' });
  const t2trades = resA.trades.filter(t => t.symbol === 'TECH2');
  check('parakusht: TECH2 ka tregti në A', t2trades.length >= 2, `${t2trades.length}`);
  const firstSignal = signalDayOf(t2trades[0].entryDate);
  const laterTrades = t2trades.filter(t => signalDayOf(t.entryDate) > firstSignal);
  check('parakusht: ka sinjale TECH2 edhe pas të parit', laterTrades.length > 0, `${laterTrades.length}`);
  // Filing i keq ekzaktësisht ditën e sinjalit të parë:
  const tlBadOnSignalDay = buildFundamentalTimeline(badFacts(firstSignal));
  const resB = runBacktest(buildCtx({ TECH2: tlBadOnSignalDay }), { ...FULL_OPTS, variant: 'full-fund' });
  const b2 = resB.trades.filter(t => t.symbol === 'TECH2');
  const survived = b2.filter(t => signalDayOf(t.entryDate) === firstSignal);
  check('sinjali i ditës së filing-ut KALON (hyrja e nesërme ekziston)', survived.length === t2trades.filter(t => signalDayOf(t.entryDate) === firstSignal).length && survived.length > 0);
  check('të gjitha tregtit TECH2 në B kanë sinjal ≤ dita e filing-ut', b2.every(t => signalDayOf(t.entryDate) <= firstSignal));
  check('B: FUND_REVENUE_CRASH aktiv pas ditës së filing-ut', (resB.rejectReasons['FUND_REVENUE_CRASH'] ?? 0) > 0);
  check('tregtia e mbijetuar IDENTIKE me A (e njëjta ekzekutim)', J(survived) === J(t2trades.filter(t => signalDayOf(t.entryDate) === firstSignal)));
}

// ═══════════════ EKZEKUTIMI ═══════════════
const tests: [string, () => void][] = [
  ['test_fundamental_timestamp_not_after_signal', test_fundamental_timestamp_not_after_signal],
  ['test_missing_fundamental_is_not_zero', test_missing_fundamental_is_not_zero],
  ['test_technical_only_does_not_use_fundamentals', test_technical_only_does_not_use_fundamentals],
  ['test_both_variants_use_same_execution_model', test_both_variants_use_same_execution_model],
  ['test_costs_are_applied_to_both_variants', test_costs_are_applied_to_both_variants],
  ['test_oos_parameters_are_locked', test_oos_parameters_are_locked],
  ['test_earnings_after_close_are_available_next_session', test_earnings_after_close_are_available_next_session],
];

console.log('═══ TASK 26 — VERIFIKIMI I MOTORIT A/B (7 testet e spec-it) ═══\n');
const t0 = Date.now();
for (const [name, fn] of tests) {
  try { fn(); } catch (e) {
    fail++; failures.push(`${name} — përjashtim: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`    ✗ ${name} — PËRJASHTIM: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log('');
}
console.log(`═══ REZULTATI: ${pass} kaluan · ${fail} dështuan · ${(Date.now() - t0) / 1000}s ═══`);
if (fail > 0) {
  console.log('DËSHTIMET:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('MOTORI I VERIFIKUAR: pa look-ahead bias, krahasimi A/B i drejtë, kosto të aplikuara, parametra të fikuar.');
