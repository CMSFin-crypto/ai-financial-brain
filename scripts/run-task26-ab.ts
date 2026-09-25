// ═══════════════════════════════════════════════════════════════
// TASK 26 — EKZEKUTIMI I PLOTË I TESTIT A/B (me cache fazash)
// Ekzekuto: npx tsx scripts/run-task26-ab.ts  (rireso derisa të përfundojë)
//
// Konfigurimi (spec i userit):
//   Universe: 400 · Data: 10vjet · Risk: 0.5% DHE 1.0%
//   Costs + Slippage: enabled (IBKR: komision+spread+slippage+impact)
//   Point-in-time: enabled (EDGAR companyfacts, rregulli filed+1)
//   WF: statik 70/30 + dritare RROTULLUESE 36m train → 6m test, hap 6m
//   A dhe B në TË NJËJTAT dritare, parametrat e fikuara.
// ═══════════════════════════════════════════════════════════════
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { fetchHistoricalData, HistoricalDataPoint } from '../src/lib/alpha-vantage';
import { getScanUniverse } from '../src/lib/scanner/universe-400';
import { SECTOR_MAP } from '../src/app/api/ibkr-scan/route';
import {
  runBacktest, prepareSymbol, BacktestContext, BacktestResult, BacktestVariant,
} from '../src/lib/validation/backtest-engine';
import { splitWindows } from '../src/lib/validation/walk-forward';
import { computeMetrics, BacktestTrade, MetricSet } from '../src/lib/validation/metrics';
import { filterUniverseAsOf } from '../src/lib/validation/universe-history';
import { fetchEarningsTimelines } from '../src/lib/validation/earnings-history';
import { buildFundVerdict } from '../src/lib/validation/report-builder';
import {
  buildFundamentalTimelines, fundamentalContextAsOf, evaluateFundamentalFilter,
  FundamentalTimelineEntry,
} from '../src/lib/fundamentals/backtest-integration';

const START_EQUITY = 25000;
const SECTOR_ETF_MAP: Record<string, string> = {
  Tech: 'XLK', Consumer: 'XLY', Staples: 'XLP', Healthcare: 'XLV',
  Finance: 'XLF', Energy: 'XLE', Industrial: 'XLI', REITs: 'XLRE',
  Utilities: 'XLU', Communication: 'XLC', Materials: 'XLB',
};
const CACHE_DIR = '/tmp/task26-cache';
const WALL_BUDGET_S = 470; // mbrenda kufirit 600s të veglës

const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const J = (x: unknown) => JSON.stringify(x);
const save = (name: string, data: unknown) => {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(`${CACHE_DIR}/${name}.json`, JSON.stringify(data));
  log(`cache: ${name} u ruajt`);
};
const load = <T>(name: string): T | null => {
  try { return JSON.parse(readFileSync(`${CACHE_DIR}/${name}.json`, 'utf8')) as T; } catch { return null; }
};

interface SideResult { is: MetricSet; oos: MetricSet; }

function metricsRow(m: MetricSet) {
  return {
    tregti: m.trades, winRate: m.winRatePct, profitFactor: m.profitFactor,
    expectancy: m.expectancy, maxDrawdownPct: m.maxDrawdownPct,
    returnNet: m.netProfit, returnPct: m.returnPct,
    avgWin: m.avgWin, avgLoss: m.avgLoss, humbjeRadhazi: m.maxConsecutiveLosses,
    totalCosts: m.totalCosts, avgR: m.avgR,
  };
}

async function main() {
  const t0 = Date.now();
  const budgetLeft = () => (WALL_BUDGET_S * 1000 - (Date.now() - t0)) > 0;
  log('TASK 26 A/B — nis ekzekutimi (me cache fazash)');

  // ═══ FAZA 1: çmimet 10-vjeçare (Yahoo) ═══
  let hist = load<Record<string, HistoricalDataPoint[] | null>>('prices');
  if (hist) {
    log(`faza 1 nga cache: ${Object.keys(hist).length} simbole`);
  } else {
    hist = {};
    const rawUniverse = [...new Set(getScanUniverse(400))];
    const etfs = [...new Set(Object.values(SECTOR_ETF_MAP))];
    const BATCH = 10;
    const fetchOne = async (sym: string) => { hist![sym] = await fetchHistoricalData(sym, '10y', { interval: '1d' }); };
    const critical = ['SPY', 'QQQ', '^VIX', ...etfs];
    for (let i = 0; i < critical.length; i += BATCH) {
      await Promise.allSettled(critical.slice(i, i + BATCH).map(fetchOne));
    }
    if (!hist['SPY'] || !hist['QQQ'] || !hist['^VIX']) throw new Error('SPY/QQQ/VIX mungojne');
    for (let i = 0; i < rawUniverse.length; i += BATCH) {
      await Promise.allSettled(rawUniverse.slice(i, i + BATCH).map(fetchOne));
      if (i % 100 === 0) log(`fetch çmime ${Math.min(i + BATCH, rawUniverse.length)}/${rawUniverse.length}`);
      if (i + BATCH < rawUniverse.length) await new Promise(r => setTimeout(r, 120));
    }
    save('prices', hist);
  }
  if (!budgetLeft()) { log('BUXHETI — ristarto për fazat e tjera'); return process.exit(2); }

  const calendar = hist['SPY']!.map(b => b.date);
  log(`kalendar: ${calendar[0]} → ${calendar[calendar.length - 1]} (${calendar.length} ditë)`);

  const firstBarDate: Record<string, string> = {};
  for (const [sym, d] of Object.entries(hist)) if (d && d.length > 0) firstBarDate[sym] = d[0].date;
  const rawUniverse = [...new Set(getScanUniverse(400))];
  const { kept } = filterUniverseAsOf(rawUniverse, calendar[0], calendar[calendar.length - 1], firstBarDate);
  log(`universi as-of: ${kept.length} mbeten`);

  // ═══ FAZA 2: kalendar earnings EDGAR (8-K 2.02) ═══
  let earnTimelines = load<Record<string, any>>('earnings');
  if (earnTimelines && Object.keys(earnTimelines).length > 0) {
    log(`faza 2 nga cache: ${Object.keys(earnTimelines).length} timeline earnings`);
  } else {
    log('fetch kalendar earnings EDGAR (8-K Item 2.02)...');
    const r = await fetchEarningsTimelines(kept, hist);
    earnTimelines = r.timelines;
    log(`earnings: ${r.withEvents}/${kept.length} simbole me timeline`);
    save('earnings', earnTimelines);
  }
  if (!budgetLeft()) { log('BUXHETI — ristarto për fazat e tjera'); return process.exit(2); }

  // ═══ FAZA 3: fundamentet EDGAR companyfacts (point-in-time) ═══
  let fundTimelines = load<Record<string, FundamentalTimelineEntry[]>>('funds');
  let fundSkipped = 0;
  if (fundTimelines && Object.keys(fundTimelines).length >= 10) {
    fundSkipped = load<{ skipped: number }>('funds-meta')?.skipped ?? 0;
    log(`faza 3 nga cache: ${Object.keys(fundTimelines).length} timeline fundamentesh`);
  } else {
    log('fetch EDGAR companyfacts (fundamentet point-in-time)...');
    const r = await buildFundamentalTimelines(kept, { deadlineMs: 420_000 });
    fundTimelines = r.timelines;
    fundSkipped = r.skippedForDeadline;
    log(`fundamentet: ${r.symbolsWithData}/${r.totalAttempted} simbole me timeline` +
      `${r.skippedForDeadline > 0 ? ` · ${r.skippedForDeadline} për deadline` : ''}`);
    save('funds', fundTimelines);
    save('funds-meta', { skipped: fundSkipped });
  }
  if (!budgetLeft()) { log('BUXHETI — ristarto për fazat e tjera'); return process.exit(2); }

  // ═══ FAZA 4: motori + raporti ═══
  const symbolsAll = [];
  for (const sym of kept) {
    const d = hist[sym];
    if (!d || d.length < 210) continue;
    const ps = prepareSymbol(sym, SECTOR_MAP[sym] || 'Other', d);
    const tl = earnTimelines[sym];
    if (tl && tl.events?.length > 0) ps.earnings = tl;
    symbolsAll.push(ps);
  }
  const spy = prepareSymbol('SPY', 'Index', hist['SPY']!);
  const qqq = prepareSymbol('QQQ', 'Index', hist['QQQ']!);
  const vix = prepareSymbol('^VIX', 'Volatility', hist['^VIX']!);
  const sectorEtfs: Record<string, ReturnType<typeof prepareSymbol>> = {};
  for (const etf of [...new Set(Object.values(SECTOR_ETF_MAP))]) {
    const d = hist[etf];
    if (d && d.length > 210) sectorEtfs[etf] = prepareSymbol(etf, 'ETF', d);
  }
  const ctx: BacktestContext = {
    calendar, symbols: symbolsAll, spy, qqq, vix, sectorEtfs,
    universeSize: symbolsAll.length, equity: START_EQUITY,
    fundamentals: fundTimelines,
  };
  log(`motori gati: ${symbolsAll.length} simbole · ${Object.keys(fundTimelines).length} me fundamentet`);

  const totalDays = calendar.length;
  const split = splitWindows(totalDays, { isPct: 0.70, wfWindows: 4 });
  const oosFrom = calendar[split.static.oosStart], oosTo = calendar[split.static.oosEnd];
  const isFrom = calendar[split.static.isStart], isTo = calendar[split.static.isEnd];
  log(`IS: ${isFrom} → ${isTo} · OOS: ${oosFrom} → ${oosTo}`);

  // Dritaret RROTULLUESE (shembulli i userit): train 36m → test 6m, hap 6m
  const addMonths = (iso: string, m: number) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + m);
    return d.toISOString().slice(0, 10);
  };
  const idxOf = (dateKey: string) => {
    let lo = 0, hi = calendar.length - 1, ans = calendar.length;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (calendar[mid] >= dateKey) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
    return ans;
  };
  const rolling: { label: string; train: string; testStartIdx: number; testEndIdx: number; testFrom: string; testTo: string }[] = [];
  {
    const firstTest = addMonths(calendar[0], 36);
    let k = 0;
    while (true) {
      const testFrom = addMonths(firstTest, 6 * k);
      const testTo = addMonths(testFrom, 6);
      const s = idxOf(testFrom), e = idxOf(testTo) - 1;
      if (s >= totalDays - 20) break;
      rolling.push({
        label: `${testFrom.slice(0, 7)} → ${testTo.slice(0, 7)}`,
        train: `${calendar[0]} → ${addMonths(testFrom, -36)}`,
        testStartIdx: s, testEndIdx: Math.min(e, totalDays - 1),
        testFrom: calendar[s], testTo: calendar[Math.min(e, totalDays - 1)],
      });
      k++;
    }
  }
  log(`dritare rrotulluese 36/6/6: ${rolling.length} (${rolling[0]?.label} … ${rolling[rolling.length - 1]?.label})`);

  // ── EKZEKUTIMI: A / B / B-strict × IS/OOS × risk 1.0% & 0.5% ──
  const runSides = (riskPct: number) => {
    const execution = riskPct !== 1.0 ? { riskPctPerTrade: riskPct } : undefined;
    const run = (variant: BacktestVariant, range: 'is' | 'oos'): BacktestResult =>
      runBacktest(ctx, {
        startIndex: range === 'is' ? split.static.isStart : split.static.oosStart,
        endIndex: range === 'is' ? split.static.isEnd : split.static.oosEnd,
        variant, execution,
      });
    const out: Record<string, SideResult & { oosRes: BacktestResult; isRes: BacktestResult }> = {};
    for (const v of ['full', 'full-fund', 'full-fund-strict'] as BacktestVariant[]) {
      const isRes = run(v, 'is'), oosRes = run(v, 'oos');
      out[v] = {
        is: computeMetrics(isRes.trades, START_EQUITY),
        oos: computeMetrics(oosRes.trades, START_EQUITY),
        isRes, oosRes,
      };
    }
    return out;
  };

  log('ekzekutimi me risk 1.0% (baseline i aprovuar)...');
  const r10 = runSides(1.0);
  log(`A: IS ${r10.full.is.trades}t / OOS ${r10.full.oos.trades}t · B: OOS ${r10['full-fund'].oos.trades}t · strict: OOS ${r10['full-fund-strict'].oos.trades}t`);

  log('ekzekutimi me risk 0.5% (spec i userit)...');
  const r05 = runSides(0.5);
  log(`A: IS ${r05.full.is.trades}t / OOS ${r05.full.oos.trades}t · B: OOS ${r05['full-fund'].oos.trades}t · strict: OOS ${r05['full-fund-strict'].oos.trades}t`);

  // ── Dritaret rrotulluese 36/6/6 (A kundrejt B) ──
  log('dritaret rrotulluese 36/6/6 (A vs B)...');
  const rollingRows = rolling.map(w => {
    const a = runBacktest(ctx, { startIndex: w.testStartIdx, endIndex: w.testEndIdx, variant: 'full' });
    const b = runBacktest(ctx, { startIndex: w.testStartIdx, endIndex: w.testEndIdx, variant: 'full-fund' });
    return {
      label: w.label, train: w.train, testFrom: w.testFrom, testTo: w.testTo,
      a: metricsRow(computeMetrics(a.trades, START_EQUITY)),
      b: metricsRow(computeMetrics(b.trades, START_EQUITY)),
    };
  });

  // ── Performca vjetore OOS + koncentrimi ──
  const netByYear = (trades: BacktestTrade[]) => {
    const m = new Map<number, { net: number; n: number }>();
    for (const t of trades) {
      const y = Number(t.exitDate.slice(0, 4));
      const cur = m.get(y) || { net: 0, n: 0 };
      cur.net += t.pnlNet; cur.n++;
      m.set(y, cur);
    }
    return m;
  };
  const aY = netByYear(r10.full.oosRes.trades);
  const bY = netByYear(r10['full-fund'].oosRes.trades);
  const allYears = [...new Set([...aY.keys(), ...bY.keys()])].sort((x, y) => x - y);
  const perYear = allYears.map(y => ({
    year: y,
    aNet: Math.round((aY.get(y)?.net ?? 0) * 100) / 100, aTrades: aY.get(y)?.n ?? 0,
    bNet: Math.round((bY.get(y)?.net ?? 0) * 100) / 100, bTrades: bY.get(y)?.n ?? 0,
  }));
  let bTop3SharePct: number | null = null;
  if (r10['full-fund'].oos.netProfit > 0 && r10['full-fund'].oosRes.trades.length >= 10) {
    const bySym = new Map<string, number>();
    for (const t of r10['full-fund'].oosRes.trades) bySym.set(t.symbol, (bySym.get(t.symbol) || 0) + t.pnlNet);
    const tops = [...bySym.values()].sort((x, y) => y - x).slice(0, 3);
    bTop3SharePct = Math.round((tops.reduce((x, y) => x + y, 0) / r10['full-fund'].oos.netProfit) * 1000) / 10;
  }

  // ── VERDIKTET (të njëjtat 6 kritere si prod) ──
  const verdict10 = buildFundVerdict({
    aOos: r10.full.oos, bOos: r10['full-fund'].oos,
    aIs: r10.full.is, bIs: r10['full-fund'].is,
    perYear: perYear.map(p => ({ year: p.year, aNet: p.aNet, bNet: p.bNet, bTrades: p.bTrades })),
    bTop3SymbolsProfitSharePct: bTop3SharePct,
  });
  const verdict05 = buildFundVerdict({
    aOos: r05.full.oos, bOos: r05['full-fund'].oos,
    aIs: r05.full.is, bIs: r05['full-fund'].is,
    perYear, bTop3SymbolsProfitSharePct: bTop3SharePct,
  });

  // ── PROVA POINT-IN-TIME (nga run-i real) ──
  const snapshotFor = (symbol: string, signalDay: string) => {
    const tl: FundamentalTimelineEntry[] | undefined = fundTimelines[symbol];
    const c = fundamentalContextAsOf(tl, signalDay);
    if (!c) return null;
    const entry = tl?.find(e => e.context === c);
    return { entry, c };
  };
  const pipSamples: any[] = [];
  for (const t of r10['full-fund'].oosRes.trades.slice(0, 6)) {
    const signalDay = calendar[Math.max(0, calendar.indexOf(t.entryDate) - 1)];
    const s = snapshotFor(t.symbol, signalDay);
    pipSamples.push({
      ticker: t.symbol, signalTime: `${signalDay} 16:00 (mbyllje)`,
      fundamentalDataAsOf: s?.entry ? `${s.entry.filed} (EOD — përdorshëm ${s.entry.usableFrom})` : 'N/A — pa filing para sinjalit',
      metrics: s ? {
        revenueGrowth: s.c.revenueGrowth, epsGrowth: s.c.epsGrowth,
        freeCashFlow: s.c.freeCashFlow, debtToEquity: s.c.debtToEquity,
      } : null,
      filter: s ? evaluateFundamentalFilter(s.c, 'standard').pass : 'PASS (N/A ≠ FAIL)',
      result: `hyri ${t.entryDate} → ${t.exitReason} ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R`,
    });
  }
  const blockedSamples: any[] = [];
  for (const t of r10.full.oosRes.trades) {
    if (blockedSamples.length >= 4) break;
    const signalDay = calendar[Math.max(0, calendar.indexOf(t.entryDate) - 1)];
    const s = snapshotFor(t.symbol, signalDay);
    if (!s) continue;
    const f = evaluateFundamentalFilter(s.c, 'standard');
    if (!f.pass) {
      blockedSamples.push({
        ticker: t.symbol, signalTime: `${signalDay} 16:00`,
        fundamentalDataAsOf: `${s.entry!.filed} (EOD)`,
        reason: `FUND_${f.reason}`,
        aResult: `në A: hyri ${t.entryDate} → ${t.exitReason} ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R (${t.pnlNet >= 0 ? '+' : ''}$${t.pnlNet.toFixed(0)})`,
      });
    }
  }

  // ── RAPORTI ──
  const withFund = symbolsAll.filter(s => fundTimelines[s.symbol] !== undefined).length;
  const coverage = {
    symbolsWithData: withFund, universeSize: symbolsAll.length,
    coveragePct: symbolsAll.length > 0 ? Math.round((withFund / symbolsAll.length) * 1000) / 10 : 0,
    skippedForDeadline: fundSkipped,
    source: 'SEC EDGAR XBRL companyfacts (10-Q/10-K/8-K — data e filing-ut si available_at)',
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      universe: 400, symbolsKept: symbolsAll.length,
      dataRange: `${calendar[0]} → ${calendar[calendar.length - 1]}`,
      equity: START_EQUITY,
      costs: 'IBKR Fixed ($0.005/aks, min $1) + spread + slippage (4bps + 1.2bps/ATR%) + market impact',
      pointInTime: 'EDGAR companyfacts — rregulli "filed D → përdorshëm D+1" (pas mbylljes → dita pasuese)',
      split: `IS ${isFrom}→${isTo} · OOS ${oosFrom}→${oosTo} (70/30 statik)`,
      rollingWf: `train 36 muaj → test 6 muaj, hap 6 muaj (${rolling.length} dritare)`,
    },
    coverage,
    risk1: {
      A_technical_only: { is: metricsRow(r10.full.is), oos: metricsRow(r10.full.oos) },
      B_standard: {
        is: metricsRow(r10['full-fund'].is), oos: metricsRow(r10['full-fund'].oos),
        fundRejects: {
          is: Object.fromEntries(Object.entries(r10['full-fund'].isRes.rejectReasons).filter(([k]) => k.startsWith('FUND_'))),
          oos: Object.fromEntries(Object.entries(r10['full-fund'].oosRes.rejectReasons).filter(([k]) => k.startsWith('FUND_'))),
        },
      },
      B_strict: { is: metricsRow(r10['full-fund-strict'].is), oos: metricsRow(r10['full-fund-strict'].oos) },
    },
    risk05: {
      A_technical_only: { is: metricsRow(r05.full.is), oos: metricsRow(r05.full.oos) },
      B_standard: { is: metricsRow(r05['full-fund'].is), oos: metricsRow(r05['full-fund'].oos) },
      B_strict: { is: metricsRow(r05['full-fund-strict'].is), oos: metricsRow(r05['full-fund-strict'].oos) },
    },
    rollingWf: rollingRows,
    perYearOos: perYear,
    bTop3SymbolsProfitSharePct: bTop3SharePct,
    verdictRisk1: { keep: verdict10.keep, criteria: verdict10.criteria, note: verdict10.note },
    verdictRisk05: { keep: verdict05.keep, note: verdict05.note },
    pointInTimeEvidence: { passed: pipSamples, blocked: blockedSamples },
  };

  writeFileSync('/home/z/my-project/download/task26-ab-results.json', J(report, null, 2));
  log('raporti u ruajt: download/task26-ab-results.json');

  // ── Tabela e userit (8 metrikat, OOS) ──
  const fmt = (x: any) => typeof x === 'number' ? (Math.abs(x) >= 1000 ? x.toLocaleString('en-US') : String(x)) : String(x);
  console.log('\n════════════ TABELA KRAHASUESE — OOS (risk 1.0%) ════════════');
  console.log(`${'Metrika'.padEnd(22)}${'Technical-only'.padEnd(18)}${'Tech + Fundamental'.padEnd(20)}${'Tech + Fund STRICT'}`);
  const a = metricsRow(r10.full.oos), b = metricsRow(r10['full-fund'].oos), s = metricsRow(r10['full-fund-strict'].oos);
  const rows: [string, any, any, any][] = [
    ['Tregti OOS', a.tregti, b.tregti, s.tregti],
    ['Win rate %', a.winRate, b.winRate, s.winRate],
    ['Profit factor', a.profitFactor, b.profitFactor, s.profitFactor],
    ['Expectancy $', a.expectancy, b.expectancy, s.expectancy],
    ['Max drawdown %', a.maxDrawdownPct, b.maxDrawdownPct, s.maxDrawdownPct],
    ['Return OOS $', a.returnNet, b.returnNet, s.returnNet],
    ['Avg win / loss $', `${a.avgWin} / ${a.avgLoss}`, `${b.avgWin} / ${b.avgLoss}`, `${s.avgWin} / ${s.avgLoss}`],
    ['Humbje radhazi', a.humbjeRadhazi, b.humbjeRadhazi, s.humbjeRadhazi],
  ];
  for (const [m, x, y, z] of rows) console.log(`${m.padEnd(22)}${fmt(x).padEnd(18)}${fmt(y).padEnd(20)}${fmt(z)}`);
  console.log(`\nA (IS): ${r10.full.is.trades}t PF ${r10.full.is.profitFactor} · B (IS): ${r10['full-fund'].is.trades}t PF ${r10['full-fund'].is.profitFactor} · strict (IS): ${r10['full-fund-strict'].is.trades}t PF ${r10['full-fund-strict'].is.profitFactor}`);
  console.log(`\nVERDIKTI (risk 1.0%): ${verdict10.keep ? 'KEEP-FILTER' : 'CONTEXT-ONLY'}`);
  console.log(verdict10.note);
  console.log(`\nVERDIKTI (risk 0.5%): ${verdict05.keep ? 'KEEP-FILTER' : 'CONTEXT-ONLY'}`);
  console.log(verdict05.note);
  console.log('\nDritaret rrotulluese 36/6/6 (A | B):');
  for (const w of rollingRows) {
    console.log(`  ${w.label.padEnd(16)} A: ${String(w.a.tregti).padStart(4)}t ${w.a.returnNet >= 0 ? '+' : ''}$${fmt(w.a.returnNet).padStart(7)} PF ${String(w.a.profitFactor).padStart(5)}  ·  B: ${String(w.b.tregti).padStart(4)}t ${w.b.returnNet >= 0 ? '+' : ''}$${fmt(w.b.returnNet).padStart(7)} PF ${String(w.b.profitFactor).padStart(5)}`);
  }
  console.log(`\nPer-viti OOS (A → B): ${perYear.map(p => `${p.year}: $${fmt(p.aNet)}→$${fmt(p.bNet)} (${p.aTrades}→${p.bTrades}t)`).join(' · ')}`);
  console.log(`\nMbulimi EDGAR: ${coverage.symbolsWithData}/${coverage.universeSize} = ${coverage.coveragePct}%${coverage.skippedForDeadline ? ` · ${coverage.skippedForDeadline} për deadline` : ''}`);
  console.log('\nPROVA POINT-IN-TIME — mostra tregtish të B (snapshot-i i përdorur në kohën e sinjalit):');
  for (const p of pipSamples) console.log(`  ${p.ticker}: sinjal ${p.signalTime} · fundamentet as of ${p.fundamentalDataAsOf} · filter ${p.filter} · ${p.result}`);
  console.log('\nTregti të A që B i bllokoi (fundamentet e dukshme atë ditë):');
  for (const p of blockedSamples) console.log(`  ${p.ticker}: sinjal ${p.signalTime} · as of ${p.fundamentalDataAsOf} → ${p.reason} · ${p.aResult}`);
  log(`GATIT — ${(Date.now() - t0) / 1000}s total`);
}

main().catch(e => { console.error('DESHTOI:', e); process.exit(1); });
