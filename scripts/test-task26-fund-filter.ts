// ═══════════════════════════════════════════════════════════════
// TASK 26 FAZA 2 — testet e filtrit fundamental + point-in-time
// Ekzekuto: npx tsx scripts/test-task26-fund-filter.ts
//
// Teston:
//   1. Filtri standard: N/A ≠ FAIL (mungesa kalon, numërohet)
//   2. Filtri strict: mungesa = dështim
//   3. Rregulli "publikuar pas mbylljes → dita pasuese":
//      filing i datës D përdoret VETËM nga sinjalet D+1 e tutje
//   4. Timeline: snapshot-i as-of nuk shikon filing-e të ardhshme
//   5. Krahasimi: 'full' (A) kundrejt 'full-fund' (B) mbi të dhëna
//      sintetike — motori ekzekuton vetëm ndryshimin e filtrit.
// ═══════════════════════════════════════════════════════════════
import {
  evaluateFundamentalFilter,
  buildFundamentalTimeline,
  fundamentalContextAsOf,
} from '../src/lib/fundamentals/backtest-integration';
import type { FundamentalContext } from '../src/lib/fundamentals/normalize';
import { computeMetrics } from '../src/lib/validation/metrics';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail ? '— ' + detail : ''}`); }
}

console.log('── Test 1: Filtri STANDARD (N/A ≠ FAIL) ──');
{
  // 1a. Kontekst bosh → kalon (N/A ≠ FAIL), 4 kontrolle N/A
  const r1 = evaluateFundamentalFilter(null, 'standard');
  check('kontekst null → PASS (N/A ≠ FAIL)', r1.pass === true && r1.naChecks === 4 && r1.hasAnyData === false);

  // 1b. Kontekst bosh por me riskFlags (s'ka metrika) → kalan
  const empty: FundamentalContext = { riskFlags: [] };
  const r1b = evaluateFundamentalFilter(empty, 'standard');
  check('kontekst bosh me riskFlags → PASS, 4 N/A', r1b.pass === true && r1b.naChecks === 4);

  // 1c. Revenue negative → FAIL me arsye
  const r2 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: -0.05 }, 'standard');
  check('revenue −5% → FAIL REVENUE_NEGATIVE', !r2.pass && r2.reason === 'REVENUE_NEGATIVE');

  // 1d. Revenue crash (≤ −10%) → arsye më specifike
  const r3 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: -0.12 }, 'standard');
  check('revenue −12% → FAIL REVENUE_CRASH (rrezik kritik)', !r3.pass && r3.reason === 'REVENUE_CRASH');

  // 1e. EPS negative → FAIL
  const r4 = evaluateFundamentalFilter({ riskFlags: [], epsGrowth: -0.03 }, 'standard');
  check('EPS −3% → FAIL EPS_NEGATIVE', !r4.pass && r4.reason === 'EPS_NEGATIVE');

  // 1f. FCF negativ → FAIL
  const r5 = evaluateFundamentalFilter({ riskFlags: [], freeCashFlow: -5e8 }, 'standard');
  check('FCF −500M → FAIL FCF_NEGATIVE', !r5.pass && r5.reason === 'FCF_NEGATIVE');

  // 1g. D/E ekstreme → FAIL
  const r6 = evaluateFundamentalFilter({ riskFlags: [], debtToEquity: 258 }, 'standard');
  check('D/E 258% → FAIL DEBT_EXTREME', !r6.pass && r6.reason === 'DEBT_EXTREME');

  // 1h. D/E 200% (mbi 150, nën 250) → standard KALON
  const r7 = evaluateFundamentalFilter({ riskFlags: [], debtToEquity: 200 }, 'standard');
  check('D/E 200% → standard PASS (vetëm >250 bllokohet)', r7.pass === true);

  // 1i. Të dhëna pjese-pjese: 1 e keq mungon → 3 kontrolle N/A + kalon
  const r8 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: 0.1, epsGrowth: 0.2 }, 'standard');
  check('rritje pozitive + 2 mungesa → PASS, naChecks=2', r8.pass === true && r8.naChecks === 2);

  // 1j. Metrika 0 reale (rritje 0%) → standard kalon (kushti ≥ 0)
  const r9 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: 0, epsGrowth: 0, freeCashFlow: 0, debtToEquity: 50 }, 'standard');
  check('rritje 0% + FCF 0 → standard PASS (kufiri ≥ 0)', r9.pass === true && r9.naChecks === 0);
}

console.log('── Test 2: Filtri STRICT (N/A = FAIL) ──');
{
  const s1 = evaluateFundamentalFilter(null, 'strict');
  check('kontekst null → FAIL MISSING_DATA', !s1.pass && s1.reason === 'MISSING_DATA');

  const s2 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: 0.05, epsGrowth: 0.1, freeCashFlow: 1e9, debtToEquity: 100 }, 'strict');
  check('të 4 pozitive + D/E 100% → PASS', s2.pass === true);

  const s3 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: 0.05, epsGrowth: 0.1 }, 'strict');
  check('2 mungesa → FAIL MISSING_DATA (strict)', !s3.pass && s3.reason === 'MISSING_DATA');

  const s4 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: 0, epsGrowth: 0.1, freeCashFlow: 1e9, debtToEquity: 100 }, 'strict');
  check('revenue 0% → FAIL REVENUE_NOT_POSITIVE (strict kërkon > 0)', !s4.pass && s4.reason === 'REVENUE_NOT_POSITIVE');

  const s5 = evaluateFundamentalFilter({ riskFlags: [], revenueGrowth: 0.05, epsGrowth: 0.1, freeCashFlow: 1e9, debtToEquity: 180 }, 'strict');
  check('D/E 180% > 150% → FAIL DEBT_ABOVE_THRESHOLD', !s5.pass && s5.reason === 'DEBT_ABOVE_THRESHOLD');
}

console.log('── Test 3: Rregulli "pas mbylljes → dita pasuese" ──');
{
  // Faktet: 10-Q i Q2 filed më 2024-07-25; 10-K (rivlerësim) filed 2024-11-20.
  // Sinjal më 2024-07-25 (ditën e filing-ut) NUK e sheh — filing-u mund
  // të jetë publikuar pas mbylljes. Sinjal më 2024-07-26 e sheh.
  const facts = {
    Revenues: [
      { concept: 'Revenues', value: 110, start: '2024-04-01', end: '2024-06-30', availableAt: '2024-07-25', form: '10-Q', fy: 2024, fp: 'Q2' },
      { concept: 'Revenues', value: 100, start: '2023-04-01', end: '2023-06-30', availableAt: '2024-07-25', form: '10-Q', fy: 2024, fp: 'Q2' },
      { concept: 'Revenues', value: 120, start: '2024-07-01', end: '2024-09-30', availableAt: '2024-11-20', form: '10-Q', fy: 2024, fp: 'Q3' },
      { concept: 'Revenues', value: 105, start: '2023-07-01', end: '2023-09-30', availableAt: '2024-11-20', form: '10-Q', fy: 2024, fp: 'Q3' },
    ],
  } as any;
  const tl = buildFundamentalTimeline(facts);
  check('timeline ka 2 snapshot-e (2 data filing)', tl.length === 2, `aktualisht ${tl.length}`);
  check('snapshot-i 1 usableFrom = 2024-07-26 (filed+1)', tl[0].usableFrom === '2024-07-26' && tl[0].filed === '2024-07-25');
  check('snapshot-i 2 usableFrom = 2024-11-21 (filed+1)', tl[1].usableFrom === '2024-11-21');

  // Ditën e filing-ut (2024-07-25) → konteksti i PARI nuk është i dukshëm
  const at0 = fundamentalContextAsOf(tl, '2024-07-25');
  check('sinjal më 25 korrik (dita e filing-ut) → pa kontekst', at0 === null);

  // Ditën pasuese → sheh Q2 me rritje (110−100)/100 = +10%
  const at1 = fundamentalContextAsOf(tl, '2024-07-26');
  check('sinjal më 26 korrik → sheh Q2 (filed dje)', at1 !== null && Math.abs((at1.revenueGrowth ?? 0) - 0.10) < 1e-9);

  // Ditën e filing-ut të dytë → ende sheh Q2, jo Q3
  const at2 = fundamentalContextAsOf(tl, '2024-11-20');
  check('sinjal më 20 nëntor (filing i dytë) → ende Q2, jo Q3', at2 !== null && Math.abs((at2.revenueGrowth ?? 0) - 0.10) < 1e-9);

  // Ditën pasuese → sheh Q3 me rritje (120−105)/105 = +14.3%
  const at3 = fundamentalContextAsOf(tl, '2024-11-21');
  check('sinjal më 21 nëntor → sheh Q3 (+14.3%)', at3 !== null && Math.abs((at3.revenueGrowth ?? 0) - (15 / 105)) < 1e-9);

  // Timeline bosh / undefined → null (N/A)
  check('timeline bosh → null', fundamentalContextAsOf([], '2024-01-01') === null);
  check('timeline undefined → null', fundamentalContextAsOf(undefined, '2024-01-01') === null);
}

console.log('── Test 4: Metrikat e reja (humbje radhazi + avgWin/avgLoss) ──');
{
  const mk = (pnl: number, i: number) => ({
    symbol: 'T', sector: 'S', entryDate: `2024-01-${String(i + 1).padStart(2, '0')}`, exitDate: `2024-01-${String(i + 2).padStart(2, '0')}`,
    entryPrice: 10, exitPrice: 11, stop: 9, target: 13, shares: 10, exitReason: 'TARGET', r: 1, pnlNet: pnl, pnlGross: pnl, costs: 0,
    costsBreakdown: { commission: 0, spread: 0, slippage: 0, impact: 0 }, score: 60,
    scoreBreakdown: { trend: 0, pullback: 0, rs: 0, volume: 0, market: 0, event: 0, risk: 0, final: 0, max: 10 },
    setupType: 'PULLBACK', equityAfter: 100,
  });
  // Sekuencë: W L L W L L L W → max humbje radhazi = 3
  const trades = [mk(50, 0), mk(-30, 1), mk(-20, 2), mk(60, 3), mk(-10, 4), mk(-15, 5), mk(-25, 6), mk(40, 7)];
  const m = computeMetrics(trades as any, 25000);
  check('maxConsecutiveLosses = 3', m.maxConsecutiveLosses === 3, `aktualisht ${m.maxConsecutiveLosses}`);
  check('avgWin = 50$ mesatare (50+60+40)/3', Math.abs(m.avgWin - 50) < 0.01);
  check('avgLoss = 20$ mesatare (30+20+10+15+25)/5', Math.abs(m.avgLoss - 20) < 0.01);
  const m0 = computeMetrics([], 25000);
  check('tregti bosh → 0 humbje radhazi', m0.maxConsecutiveLosses === 0);
}

console.log('');
console.log(`REZULTATI: ${pass} kaluan · ${fail} dështuan`);
if (fail > 0) process.exit(1);
