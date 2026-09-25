import { NextResponse } from 'next/server';
import { runLearningCycle, computeFactorInsights, getLearnedMultipliers } from '@/lib/scanner-learning/factor-insights';
import { getOutcomeProgress } from '@/lib/scanner-learning/backfill-outcomes';

export const maxDuration = 60;

// ═══ POST /api/scanner/learn ═══
// Cikli i PLOTË i të mësuarit:
//   1. Vlerëson rezultatet PENDING me të dhëna historike reale
//   2. Analizon zonat e faktorëve (RSI, ADX, Trend, Volum, Likuiditet, Regjimi)
//   3. Përditëson multiplikatorët — të cilët skaneri i aplikon automatikisht
//
// Thirret automatikisht nga cron ditor 05:00 UTC, ose manualisht nga UI.
export async function POST() {
  try {
    const result = await runLearningCycle();
    return NextResponse.json({
      ok: true,
      evaluation: result.evaluation, // { checked, evaluated, skipped, uniqueTickerDays }
      insights: result.insights, // { sample, zones, multipliers }
      weights: result.weights, // rreshtat e ruajtura në ScannerFactorWeight
    });
  } catch (error: any) {
    console.error('[SCANNER-LEARN] Error:', error);
    return NextResponse.json(
      { error: 'Cikli i të mësuarit dështoi', detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}

// ═══ GET /api/scanner/learn ═══
// Statusi aktual: peshat aktive + progresi i mostrës.
export async function GET() {
  try {
    const [weights, progress, insights] = await Promise.all([
      getLearnedMultipliers(),
      getOutcomeProgress(),
      computeFactorInsights().catch(() => null),
    ]);
    return NextResponse.json({
      endpoint: '/api/scanner/learn',
      method: 'POST',
      description: 'Vlerëso rezultatet + përditëso peshat e faktorëve nga e kaluara',
      autoSchedule: 'çdo ditë 05:00 UTC (cron evaluate-predictions)',
      progress,
      weights,
      baseline: insights?.sample ?? null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Statusi nuk u lexua', detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}
