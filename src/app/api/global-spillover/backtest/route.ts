// Legacy redirect — use /api/global-spillover/backtest/[symbol] instead
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'SMH';
  const mode = searchParams.get('mode') || 'v1_only';
  const hold = searchParams.get('hold') || '3';
  const range = searchParams.get('range') || '1y';
  const multi = searchParams.get('multi') || '';

  const params = new URLSearchParams({ mode, hold, range });
  if (multi) params.set('multi', 'true');

  const url = `/api/global-spillover/backtest/${symbol}?${params}`;
  return NextResponse.json({ redirect: url, message: 'Use /api/global-spillover/backtest/[symbol] instead' });
}
