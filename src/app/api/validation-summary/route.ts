import { NextResponse } from 'next/server';
import { getValidationSummary } from '@/lib/validation-lab';

export async function GET() {
  try {
    const summary = await getValidationSummary();
    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VALIDATION-SUMMARY] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
