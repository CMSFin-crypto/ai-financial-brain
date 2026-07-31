import { NextRequest, NextResponse } from 'next/server';
import { detectMarketRegime, regimeToSizingMultiplier } from '@/lib/regime-detection';
import { loadRecentRegimeHistory, saveRegimeSnapshot, applyRegimePersistence } from '@/lib/regime-history';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const persist = url.searchParams.get('persist') === 'true';
    const historyDays = Number(url.searchParams.get('historyDays') ?? '7');
    const minConfirm = Number(url.searchParams.get('minConfirmations') ?? '2');

    // Detect current regime from REAL SPY/VIX data
    const detection = await detectMarketRegime();

    // Load recent history for confirmation
    const history = await loadRecentRegimeHistory(historyDays);
    const confirmation = applyRegimePersistence(
      history,
      { regime: detection.regime, confidence: detection.confidence },
      minConfirm,
    );

    // Optionally persist to DB
    if (persist) {
      await saveRegimeSnapshot(detection.regime, detection.confidence);
    }

    return NextResponse.json({
      // Current detection
      regime: detection.regime,
      confidence: detection.confidence,
      transitionRisk: detection.transitionRisk,
      features: detection.features,
      // Position sizing integration
      sizing: {
        regimeMultiplier: regimeToSizingMultiplier(detection.regime as any),
        scoreMultiplier: detection.scoreMultiplier,
        allowLongs: detection.allowLongs,
        allowShorts: detection.allowShorts,
      },
      // Confirmation state
      confirmation: {
        confirmed: confirmation.confirmed,
        confirmedRegime: confirmation.confirmedRegime,
        streak: confirmation.streak,
      },
      // Recent history
      recentHistory: confirmation.recentHistory,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MARKET-REGIME] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
