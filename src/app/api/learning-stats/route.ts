import { NextResponse } from 'next/server';
import { getLearningDashboard, checkPredictionOutcomes } from '@/lib/learning-engine';

export const maxDuration = 60;

export async function GET() {
  try {
    const { searchParams } = new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
    const check = searchParams?.get('check') === 'true';

    let checkResult: { checked: number; updated: number; errors: string[] } | null = null;
    if (check) {
      checkResult = await checkPredictionOutcomes();
    }

    const dashboard = getLearningDashboard();

    return NextResponse.json({
      ...dashboard,
      checkResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-STATS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
