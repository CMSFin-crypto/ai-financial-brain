// ============================================================
// SMOKE TEST — Verify 4 key prediction system endpoints
// Run: npx tsx scripts/smoke-test.ts
// ============================================================

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function fetchJSON(url: string, label: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[FAIL] ${label}: HTTP ${res.status} — ${JSON.stringify(data)}`);
      return null;
    }
    return data;
  } catch (err: any) {
    console.error(`[FAIL] ${label}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== SMOKE TEST: Prediction System ===');
  console.log(`Base URL: ${BASE}\n`);

  let pass = 0;
  let fail = 0;

  // 1. /api/predict/AAPL
  console.log('--- Test 1: /api/predict/AAPL ---');
  const pred = await fetchJSON(`${BASE}/api/predict/AAPL`, 'predict/AAPL');
  if (pred) {
    const hasDirection = !!pred.direction;
    const hasConfidence = typeof pred.confidence === 'number' && pred.confidence >= 0;
    const hasHorizons = pred.horizons?.['1D'] && pred.horizons?.['5D'] && pred.horizons?.['20D'];
    const hasGate = pred.gateStatus === 'TRADE' || pred.gateStatus === 'NO_TRADE';
    const scores = pred.indicatorScores || {};
    const nonZeroCount = Object.values(scores).filter((v: number) => v !== 0).length;

    console.log(`  direction: ${pred.direction}`);
    console.log(`  confidence: ${pred.confidence}`);
    console.log(`  combinedScore: ${pred.combinedScore}`);
    console.log(`  gateStatus: ${pred.gateStatus}`);
    console.log(`  horizons: ${JSON.stringify(pred.horizons)}`);
    console.log(`  regime: ${pred.regime}`);
    console.log(`  nonZeroIndicators: ${nonZeroCount}/${Object.keys(scores).length}`);

    if (hasDirection && hasConfidence && hasHorizons && hasGate) {
      console.log('  [PASS] predict/AAPL ✓\n');
      pass++;
    } else {
      console.log('  [FAIL] predict/AAPL — missing required fields\n');
      fail++;
    }
  } else {
    fail++;
  }

  // 2. /api/ai-learning/evaluate
  console.log('--- Test 2: /api/ai-learning/evaluate ---');
  const evalResult = await fetchJSON(`${BASE}/api/ai-learning/evaluate`, 'evaluate');
  if (evalResult) {
    console.log(`  evaluated: ${evalResult.evaluated}`);
    console.log(`  correct: ${evalResult.correct}`);
    console.log(`  accuracy: ${evalResult.accuracy}%`);
    console.log(`  weightsUpdated: ${evalResult.weightsUpdated}`);
    console.log('  [PASS] ai-learning/evaluate ✓\n');
    pass++;
  } else {
    fail++;
  }

  // 3. /api/ai-learning/weights
  console.log('--- Test 3: /api/ai-learning/weights ---');
  const weights = await fetchJSON(`${BASE}/api/ai-learning/weights`, 'weights');
  if (weights) {
    console.log(`  technical: ${weights.technical?.length} factors`);
    console.log(`  fundamental: ${weights.fundamental?.length} factors`);
    console.log(`  summary: ${JSON.stringify(weights.summary)}`);

    const hasRSI = weights.technical?.some((w: any) => w.factor === 'rsi');
    const hasMACD = weights.technical?.some((w: any) => w.factor === 'macdHistogram');

    if (weights.technical?.length > 0 && hasRSI && hasMACD) {
      console.log('  [PASS] ai-learning/weights ✓\n');
      pass++;
    } else {
      console.log('  [FAIL] ai-learning/weights — missing factors\n');
      fail++;
    }
  } else {
    fail++;
  }

  // 4. /api/ai-backtest/AAPL
  console.log('--- Test 4: /api/ai-backtest/AAPL ---');
  const backtest = await fetchJSON(`${BASE}/api/ai-backtest/AAPL`, 'backtest');
  if (backtest) {
    console.log(`  totalReturnPct: ${backtest.summary?.totalReturnPct}`);
    console.log(`  benchmarkReturnPct: ${backtest.summary?.benchmarkReturnPct}`);
    console.log(`  alphaPct: ${backtest.summary?.alphaPct}`);
    console.log(`  winRate: ${backtest.summary?.winRate}%`);
    console.log(`  tradeCount: ${backtest.summary?.tradeCount}`);
    console.log(`  noTradeCount: ${backtest.summary?.noTradeCount}`);
    console.log(`  totalCostsPct: ${backtest.summary?.totalCostsPct}`);
    console.log(`  maxDrawdownPct: ${backtest.summary?.maxDrawdownPct}`);
    console.log(`  sharpeRatio: ${backtest.summary?.sharpeRatio}`);

    if (backtest.summary && typeof backtest.summary.totalCostsPct === 'number') {
      console.log('  [PASS] ai-backtest/AAPL — has cost data ✓\n');
      pass++;
    } else {
      console.log('  [FAIL] ai-backtest/AAPL — missing summary or costs\n');
      fail++;
    }
  } else {
    fail++;
  }

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Passed: ${pass}/4`);
  console.log(`Failed: ${fail}/4`);
  console.log(fail === 0 ? '\nALL TESTS PASSED ✓' : '\nSOME TESTS FAILED ✗');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
