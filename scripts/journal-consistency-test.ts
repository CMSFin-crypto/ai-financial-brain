// ═══════════════════════════════════════════════════════════════════
// TESTI I KONSISTENCËS — Ditari i Sinjaleve vs Backtest
// ═══════════════════════════════════════════════════════════════════
// Spec Seksioni 8.6 (CTC_v2_strategy_spec.md): "ekzekuto Job B mbi 30
// ditë historike dhe krahaso me rezultatet e backtest-it për të njëjtat
// sinjale. Duhet të përputhen."
//
// Pjesa 1: raste sintetike me dalje të njohura (target/stop/both/gap/
// time-stop/open) — verifikon evaluator-in kundrejt rregullave të spec-it.
// Pjesa 2: backtest-i i plotë REV (i njëjti motor i rev-validate) →
// tregtia e 40 ditëve të fundit → çdo tregti kaloj nëpër
// evaluateCheckpoints (i njëjti kod që përdor Job B) → krahaso daljen.
//
// Ekzekutimi:  bun run scripts/journal-consistency-test.ts
// ═══════════════════════════════════════════════════════════════════

import { evaluateCheckpoints, type SimpleBar } from '../src/lib/signal-journal';
import { fetchHistoricalData } from '../src/lib/alpha-vantage';
import { getScanUniverse } from '../src/lib/scanner/universe-core';
import { runRevBacktest } from '../src/lib/rev/backtest';
import {
  REV_MIDCAP_TIER,
  EDGAR_ELIGIBILITY_FORMS,
  revSectorOf,
  type RevBar,
  type RevFiling8k,
} from '../src/lib/rev/signal';
import { fetchRecentFilings } from '../src/lib/sec-edgar';

let failures = 0;
let passes = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passes += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── PJESA 1: raste sintetike ──

function bar(date: string, open: number, high: number, low: number, close: number): SimpleBar {
  return { date, open, high, low, close };
}

console.log('\n━━ PJESA 1 — Raste sintetike (rregullat e spec-it Seksioni 8.3) ━━\n');

{
  // CTC — target i goditur ditën 2
  const bars = [
    bar('2026-01-05', 100, 101, 99, 100.5), // d1 = dita e hyrjes (entry=open 100)
    bar('2026-01-06', 100.5, 110, 100, 109), // d2 — high ≥ target (110 ≥ 106)
  ];
  const r = evaluateCheckpoints({ strategy: 'CTC', entry: 100, stop: 95, target: 106, entryDate: '2026-01-05', bars })!;
  check('CTC target d2', r.finalStatus === 'target' && r.finalDayN === 2 && r.exitPrice === 106);
  check('CTC R i targetit = +1.2R', Math.abs((r.resultR ?? 0) - 1.2) < 1e-9);
}

{
  // CTC — qiri i njëjtë prek stop DHE target → STOP (konservativ)
  const bars = [bar('2026-01-05', 100, 106.5, 94.5, 100), bar('2026-01-06', 100, 101, 99, 100.5)];
  const r = evaluateCheckpoints({ strategy: 'CTC', entry: 100, stop: 95, target: 106, entryDate: '2026-01-05', bars })!;
  check('CTC dy nivele në të njëjtën qiri → STOP d1', r.finalStatus === 'stop' && r.finalDayN === 1 && r.exitPrice === 95);
}

{
  // CTC — gap nën stop në hapje → GAP_STOP te çmimi i hapjes
  const bars = [bar('2026-01-05', 100, 101, 99, 100.5), bar('2026-01-06', 92, 93, 91, 91.5)];
  const r = evaluateCheckpoints({ strategy: 'CTC', entry: 100, stop: 95, target: 106, entryDate: '2026-01-05', bars })!;
  check('CTC gap_stop te hapja (92)', r.finalStatus === 'gap_stop' && r.exitPrice === 92);
  check('CTC R i gap-it = (92-100)/5 = -1.6', Math.abs((r.resultR ?? 0) - (-1.6)) < 1e-9);
}

{
  // CTC — time stop dita 5 te close
  const bars = [
    bar('2026-01-05', 100, 101, 99, 100),
    bar('2026-01-06', 100, 102, 99, 101),
    bar('2026-01-07', 101, 103, 100, 102),
    bar('2026-01-08', 102, 104, 101, 103),
    bar('2026-01-09', 103, 105, 102, 104), // d5 — pa prekje → time_stop @ close 104
  ];
  const r = evaluateCheckpoints({ strategy: 'CTC', entry: 100, stop: 95, target: 106, entryDate: '2026-01-05', bars })!;
  check('CTC time_stop d5 @ close', r.finalStatus === 'time_stop' && r.finalDayN === 5 && r.exitPrice === 104);
  check('CTC checkpoint-et d1..d5 të plota', ['d1', 'd2', 'd3', 'd4', 'd5'].every((k) => (r.checkpoints as Record<string, unknown>)[k]));
}

{
  // REV — d1 = dita PAS hyrjes (hyrja në close të konfirmimit); time-stop d3
  const bars = [
    bar('2026-01-05', 100, 100.5, 97, 100), // dita e konfirmimit — hyrja @ close 100 (s'kontrollohet)
    bar('2026-01-06', 100, 101, 99, 100.5), // d1
    bar('2026-01-07', 100.5, 102, 100, 101.5), // d2
    bar('2026-01-08', 101, 102, 100.5, 101.8), // d3 — time_stop @ close
  ];
  const r = evaluateCheckpoints({ strategy: 'REV', entry: 100, stop: 96, target: 104.8, entryDate: '2026-01-05', bars })!;
  check('REV time_stop d3 @ close', r.finalStatus === 'time_stop' && r.finalDayN === 3 && r.exitPrice === 101.8);
  check('REV d1 = 2026-01-06 (dita pas hyrjes)', r.checkpoints.d1?.date === '2026-01-06');
}

{
  // REV — target d2; MFE/MAE kumulative
  const bars = [
    bar('2026-01-05', 100, 100.5, 97, 100),
    bar('2026-01-06', 100, 101, 98, 100.5), // d1 — low 98 → MAE
    bar('2026-01-07', 100.5, 106, 100, 105.5), // d2 — high 106 ≥ target 104.8
  ];
  const r = evaluateCheckpoints({ strategy: 'REV', entry: 100, stop: 96, target: 104.8, entryDate: '2026-01-05', bars })!;
  check('REV target d2', r.finalStatus === 'target' && r.finalDayN === 2 && r.exitPrice === 104.8);
  check('REV maeR d1 = (98-100)/4 = -0.5', Math.abs((r.checkpoints.d1?.maeR ?? 0) - (-0.5)) < 1e-9);
  check('REV mfeR final = (106-100)/4 = +1.5', Math.abs((r.mfeR ?? 0) - 1.5) < 1e-9);
  check('REV PnL net = (4.8/100)*100 - 0.2 = 4.6%', Math.abs((r.pnlPctNet ?? 0) - 4.6) < 1e-9);
}

{
  // Pa qira pas hyrjes → ende open (s'ka asgjë për vlerësim)
  const bars = [bar('2026-01-05', 100, 100.5, 97, 100)];
  const r = evaluateCheckpoints({ strategy: 'REV', entry: 100, stop: 96, target: 104.8, entryDate: '2026-01-05', bars })!;
  check('Pa ditë tregtare → open', r.finalStatus === 'open' && r.finalDayN === null);
}

{
  // Qiri që mungon (halt) — dN numëron vetëm ditët me të dhëna
  const bars = [
    bar('2026-01-05', 100, 100.5, 97, 100),
    bar('2026-01-06', 100, 101, 99, 100.5), // d1
    // 2026-01-07 mungon (halt)
    bar('2026-01-08', 100.5, 102, 100, 101.5), // d2
    bar('2026-01-09', 101, 102, 96, 100), // d3 — low 96 ≤ stop 96 → STOP
  ];
  const r = evaluateCheckpoints({ strategy: 'REV', entry: 100, stop: 96, target: 104.8, entryDate: '2026-01-05', bars })!;
  check('Halt → d3 mbi qiratë e disponueshme, STOP', r.finalStatus === 'stop' && r.finalDayN === 3 && r.checkpoints.d2?.date === '2026-01-08');
}

// ── PJESA 2: backtest-i REV i plotë vs evaluator-i ──

console.log('\n━━ PJESA 2 — Backtest REV (të dhëna reale) vs evaluateCheckpoints ━━\n');

async function part2() {
  const universe = [...new Set([...getScanUniverse(60), ...REV_MIDCAP_TIER.slice(0, 15)])].slice(0, 55);
  const range = '2y';
  const spyRaw = await fetchHistoricalData('SPY', range, { interval: '1d' });
  const spyBars = (spyRaw ?? []) as RevBar[];
  if (!spyBars.length) {
    console.log('  ✗ SPY data mungon — PJESA 2 kalojët pa ekzekutim');
    failures += 1;
    return;
  }

  const series: { symbol: string; bars: RevBar[] }[] = [];
  const filingsBySymbol: Record<string, RevFiling8k[]> = {};
  for (let i = 0; i < universe.length; i += 5) {
    const batch = universe.slice(i, i + 5);
    const res = await Promise.allSettled(
      batch.map(async (s) => ({
        symbol: s,
        bars: (await fetchHistoricalData(s, range, { interval: '1d' })) as RevBar[] | null,
        filings: await fetchRecentFilings(s, EDGAR_ELIGIBILITY_FORMS, 120),
      })),
    );
    for (const r of res) {
      if (r.status === 'fulfilled' && r.value.bars && r.value.bars.length >= 120) {
        series.push({ symbol: r.value.symbol, bars: r.value.bars });
        filingsBySymbol[r.value.symbol] = (r.value.filings?.filings ?? []).map((f) => ({
          filingDate: f.filingDate,
          items: (f.items ?? '').split(',').map((x) => x.trim()).filter(Boolean),
          form: f.form,
        }));
      }
    }
  }
  console.log(`  Univers me të dhëna: ${series.length} simbole; SPY: ${spyBars.length} qira`);

  const bt = runRevBacktest({ series, spyBars, filings8k: filingsBySymbol, isSplitPct: 0.7, wfWindowCount: 5 });

  // Merr tregtitë e 40 ditëve tregtare të fundit
  const allDates = spyBars.map((b) => b.date);
  const cutoff = allDates[Math.max(0, allDates.length - 41)];
  const recent = bt.trades.filter((t) => t.entryDate >= cutoff);
  console.log(`  Tregti REV në 40 ditët e fundit: ${recent.length} (nga ${bt.trades.length} gjithsej)`);

  if (!recent.length) {
    console.log('  ⚠ Pa tregti REV në dritaren 40-ditore — rrit universin ose dritaren nëse duhet');
  }

  let match = 0;
  let gapExplained = 0;
  let mismatch = 0;
  let rExact = 0;

  for (const t of recent) {
    const bars = series.find((s) => s.symbol === t.symbol)?.bars ?? [];
    const out = evaluateCheckpoints({
      strategy: 'REV',
      entry: t.entry,
      stop: t.stop,
      target: t.target,
      entryDate: t.entryDate,
      bars: bars as SimpleBar[],
      costPct: 0,
    });
    if (!out) {
      mismatch += 1;
      console.log(`  ✗ ${t.symbol} ${t.entryDate}: evaluator-i ktheu null`);
      continue;
    }
    // Mapo daljen e backtest-it në statuset e ditarit
    const expected = t.exitReason === 'TARGET' ? 'target' : t.exitReason === 'STOP' ? 'stop' : 'time_stop';
    const got = out.finalStatus;
    const ok =
      got === expected ||
      // Ditari është më i saktë me gap-et: GAP_STOP ku backtest-i numëron STOP te niveli
      (expected === 'stop' && got === 'gap_stop');
    if (ok) {
      match += 1;
      if (got === 'gap_stop') gapExplained += 1;
    } else {
      mismatch += 1;
      console.log(`  ✗ ${t.symbol} hyrje ${t.entryDate}: backtest=${t.exitReason} ditari=${got} (exit ${out.finalDate})`);
      continue;
    }
    // R bruto: i njëjtë kur s'ka gap (dalja te i njëjti nivel)
    const journalRGross =
      got === 'gap_stop'
        ? ((out.exitPrice ?? t.entry) - t.entry) / (t.entry - t.stop)
        : (out.resultR ?? 0);
    if (Math.abs(journalRGross - t.rGross) < 1e-6) rExact += 1;
  }

  console.log(`\n  Dalje që përputhen: ${match}/${recent.length}${gapExplained ? ` (nga të cilat ${gapExplained} GAP_STOP — ditari më i saktë se backtest-i)` : ''}`);
  console.log(`  R bruto identik (pa raste gap-u): ${rExact}/${match}`);
  if (mismatch > 0) failures += 1;
  if (recent.length > 0 && match === recent.length) passes += 1;
}

try {
  await part2();
} catch (e) {
  console.log(`  ✗ PJESA 2 dështoi: ${e instanceof Error ? e.message : String(e)}`);
  failures += 1;
}

console.log('\n━━ PËRFUNDIMI ━━');
console.log(`  Kaluan: ${passes}   Dështuan: ${failures}`);
console.log(
  failures === 0
    ? '  ✓ Konsistencë e plotë — evaluator-i i ditarit ndjek rregullat e spec-it dhe përputhet me backtest-in.'
    : '  ✗ Ka shkelje — NDIQO para se të përdorësh ditarin (spec Seksioni 8.6).'
);
process.exit(failures === 0 ? 0 : 1);
