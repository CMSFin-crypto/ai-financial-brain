import { NextResponse } from 'next/server';
import { assessMicroLiveReadiness } from '@/lib/micro-live-gate';

export async function GET() {
  try {
    const readiness = await assessMicroLiveReadiness();
    return NextResponse.json(readiness);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MICRO-LIVE-READINESS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
