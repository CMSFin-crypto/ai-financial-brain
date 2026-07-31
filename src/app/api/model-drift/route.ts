import { NextResponse } from 'next/server';
import { assessDrift, getRegimeWeightBuckets } from '@/lib/drift-monitor';

export async function GET() {
  try {
    const [driftReport, regimeBuckets] = await Promise.all([
      assessDrift(),
      getRegimeWeightBuckets(),
    ]);

    return NextResponse.json({
      drift: driftReport,
      regimeWeightBuckets: regimeBuckets,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MODEL-DRIFT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
