import { NextResponse } from 'next/server';

// Legacy redirect to the new momentum route
export async function GET() {
  return NextResponse.redirect('/api/momentum/5-pillars', 307);
}
