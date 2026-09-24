// ═══════════════════════════════════════════════════════════════
// TEST — Ditar Top 10: targeti i planifikuar kundrejt rezultatit real
// Teston computeBarOutcome (përmes evaluateTop10Journal s'duhet DB —
// këtu testohet logjika bërthamë përmes një kopjeje të izoluar) +
// deriveTradeFields (i eksportuar) me rastet e spec-it të userit.
// ═══════════════════════════════════════════════════════════════
// Ekzekuto: npx tsx scripts/test-journal-target-tracking.ts

import { deriveTradeFields } from '../src/lib/top10-journal';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('── 1. Shembulli i spec-it: NVDA TARGET_HIT ──');
// Entry 120, Target 126, Stop 117, Max price after entry 127.40 → TARGET_HIT
const nvda = deriveTradeFields({
  ticker: 'NVDA', entry: 120, stop: 117, target: 126,
  exitStatus: 'HIT_TARGET', resultR: 2, mfeR: 2.47, maeR: 0.2,
});
check('status = TARGET_HIT', nvda.tradeStatus === 'TARGET_HIT', nvda.tradeStatus);
check('targetExecuted = true', nvda.targetExecuted === true);
check('targetTouched = true', nvda.targetTouched === true);
check('actualExitPrice = 126.00', nvda.actualExitPrice === 126, `${nvda.actualExitPrice}`);
check('realizedPnlPct = +5.0%', nvda.realizedPnlPct === 5, `${nvda.realizedPnlPct}`);
check('maxFavorablePrice ≈ 127.41 (120 + 2.47×3)', Math.abs((nvda.maxFavorablePrice ?? 0) - 127.41) < 0.02, `${nvda.maxFavorablePrice}`);
check('exitReason = profit_target', nvda.exitReason === 'profit_target');
check('companyName = NVIDIA', nvda.companyName === 'NVIDIA', nvda.companyName);

console.log('── 2. STOP_HIT (AMD i spec-it: -3.75% ≈ -1R) ──');
const amd = deriveTradeFields({
  ticker: 'AMD', entry: 160, stop: 154, target: 174,
  exitStatus: 'HIT_STOP', resultR: -1, mfeR: 0.1, maeR: 1,
});
check('status = STOP_HIT', amd.tradeStatus === 'STOP_HIT');
check('actualExitPrice = 154', amd.actualExitPrice === 154);
check('realizedPnlPct = -3.75% (2 decimale si në spec)', amd.realizedPnlPct === -3.75, `${amd.realizedPnlPct}`);
check('stopTouched = true', amd.stopTouched === true);
check('targetTouched = false (s\e preku targetin)', amd.targetTouched === false);
check('exitReason = stop_loss', amd.exitReason === 'stop_loss');

console.log('── 3. TOUCHED por s\u00eb EKZEKUTUAR (stop-i i pari konservativ) ──');
// Çmimi e preku targetin në MFE por u mbyll në stop: touched=true, executed=false
const tked = deriveTradeFields({
  ticker: 'XYZ', entry: 100, stop: 97, target: 106,
  exitStatus: 'HIT_STOP', resultR: -1, mfeR: 2.1, maeR: 1.0,
});
check('targetTouched = true (MFE 2.1R ≥ 2R targeti)', tked.targetTouched === true);
check('targetExecuted = false (u mbyll në stop)', tked.targetExecuted === false);
check('status = STOP_HIT (konservativ)', tked.tradeStatus === 'STOP_HIT');

console.log('── 4. PARTIAL_TARGET vs TIME_EXIT (skadimi) ──');
const partial = deriveTradeFields({
  ticker: 'P1', entry: 100, stop: 97, target: 106,
  exitStatus: 'EXPIRED', resultR: 0.8, mfeR: 1.2, maeR: 0.3,
});
check('status = PARTIAL_TARGET (resultR 0.8 > 0.05)', partial.tradeStatus === 'PARTIAL_TARGET', partial.tradeStatus);
check('actualExitPrice = 102.4 (100 + 0.8×3)', partial.actualExitPrice === 102.4, `${partial.actualExitPrice}`);
check('realizedPnlPct = +2.4%', partial.realizedPnlPct === 2.4, `${partial.realizedPnlPct}`);
check('exitReason = time_exit', partial.exitReason === 'time_exit');

const flat = deriveTradeFields({
  ticker: 'P2', entry: 100, stop: 97, target: 106,
  exitStatus: 'EXPIRED', resultR: -0.2, mfeR: 0.3, maeR: 0.5,
});
check('status = TIME_EXIT (resultR -0.2 ≤ 0.05)', flat.tradeStatus === 'TIME_EXIT', flat.tradeStatus);

console.log('── 5. NO_FILL → TARGET_NOT_HIT ──');
const nofill = deriveTradeFields({
  ticker: 'NF', entry: 100, stop: 97, target: 106,
  exitStatus: 'NO_FILL', resultR: null, mfeR: null, maeR: null,
});
check('status = TARGET_NOT_HIT', nofill.tradeStatus === 'TARGET_NOT_HIT');
check('exitReason = order_not_filled', nofill.exitReason === 'order_not_filled');
check('targetTouched = false (pa pozicion)', nofill.targetTouched === false);
check('actualExitPrice = null', nofill.actualExitPrice === null);

console.log('── 6. OPEN ──');
const open = deriveTradeFields({
  ticker: 'OP', entry: 100, stop: 97, target: 106,
  exitStatus: 'OPEN', resultR: 0.5, mfeR: 0.6, maeR: 0.2,
});
check('status = OPEN', open.tradeStatus === 'OPEN');
check('actualExitPrice = null (s\u00eb ka dalje)', open.actualExitPrice === null);
check('exitReason = still_open', open.exitReason === 'still_open');
check('realizedPnlPct = null (ende i parealizuar)', open.realizedPnlPct === null);

console.log('── 7. Backup-plan: nivelet që mungojnë ──');
const noLevels = deriveTradeFields({ ticker: 'QQQ', entry: null, stop: null, target: null, exitStatus: 'OPEN' });
check('s\u00eb thyhet — kthen vetëm companyName', noLevels.companyName === 'QQQ');

// ═══════════════════════════════════════════════════════════════
// Task 31 — Drill-down: strategyCompliance (përputhshmëria me strategjinë)
// ═══════════════════════════════════════════════════════════════
import { strategyCompliance } from '../src/lib/top10-journal';

console.log('── 8. Përputhshmëria: hyrje ideale (të gjithë parametrat OK) ──');
const ok = strategyCompliance({
  rvol: 1.92, regimeLevel: 'OK', atrStatus: 'OK', atrPct: 2.4, tags: [],
});
check('compliant = true (pa shkelje)', ok.compliant === true);
check('notes bosh', ok.notes.length === 0);

console.log('── 9. Përputhshmëria: RVOL nën 1.5x ──');
const noRvol = strategyCompliance({
  rvol: 1.12, regimeLevel: 'OK', atrStatus: 'OK', atrPct: 2.0, tags: ['NO_RVOL'],
});
check('compliant = false', noRvol.compliant === false);
check('shënim RVOL përmban pragun 1.5x', noRvol.notes.some((n) => n.includes('1.5x')), JSON.stringify(noRvol.notes));
check('vetëm NJË shënim RVOL (pa dublim nga etiketa)', noRvol.notes.filter((n) => n.startsWith('RVOL')).length === 1, JSON.stringify(noRvol.notes));

console.log('── 10. Përputhshmëria: regjim jo-OK + ATR TOO_VOLATILE ──');
const bad = strategyCompliance({
  rvol: 2.0, regimeLevel: 'CAUTION', atrStatus: 'TOO_VOLATILE', atrPct: 6.1, tags: ['REGIME'],
});
check('compliant = false', bad.compliant === false);
check('shënim regjimi CAUTION', bad.notes.some((n) => n.includes('CAUTION')), JSON.stringify(bad.notes));
check('shënim ATR i paqëndrueshëm', bad.notes.some((n) => n.includes('shumë i paqëndrueshëm')), JSON.stringify(bad.notes));
check('pa dublim të shënimit të regjimit', bad.notes.filter((n) => n.startsWith('Regjimi')).length === 1, JSON.stringify(bad.notes));

console.log('── 11. Përputhshmëria: ATR TOO_SLOW ──');
const slow = strategyCompliance({
  rvol: 1.8, regimeLevel: 'OK', atrStatus: 'TOO_SLOW', atrPct: 1.1, tags: [],
});
check('compliant = false (lëvizje e ngadaltë)', slow.compliant === false && slow.notes.some((n) => n.includes('e ngadaltë')), JSON.stringify(slow.notes));

console.log('── 12. Përputhshmëria: etiketa pa vlera skalare (backfill i vjetër) ──');
const tagOnly = strategyCompliance({ rvol: null, regimeLevel: null, atrStatus: null, tags: ['NO_RVOL'] });
check('compliant = false nga etiketa NO_RVOL', tagOnly.compliant === false && tagOnly.notes.some((n) => n.startsWith('RVOL')), JSON.stringify(tagOnly.notes));

console.log(`\n═══ REZULTATI: ${pass} kaluan · ${fail} dështuan ═══`);
process.exit(fail > 0 ? 1 : 0);
