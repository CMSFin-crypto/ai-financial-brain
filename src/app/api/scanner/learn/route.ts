import { NextResponse } from 'next/server';
import { updateWeeklyWeights } from '@/lib/scanner-learning/outcomes-and-weights';

// ═══ POST /api/scanner/learn ═══
// Triggers weekly weight update from recent outcome labels.
// Cron: run 1x/week (e.g., Sunday 22:00 ET) after outcomes have settled.
//
// Response:
//   { updated: true, n: 142, winRate: 0.52, fadeRate: 0.18, weights: [...] }
//   or
//   { updated: false, reason: "min_sample", n: 23, minRequired: 40 }
export async function POST() {
  try {
    const result = await updateWeeklyWeights();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[SCANNER-LEARN] Error:', error);
    return NextResponse.json(
      { error: 'Përditësimi i peshave dështoi', detail: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/scanner/learn',
    method: 'POST',
    description: 'Përditëso peshat e faktorëve nga outcomes e fundit (continuation vs fade)',
    schedule: '1x/week pas close + 3 ditë',
  });
}
