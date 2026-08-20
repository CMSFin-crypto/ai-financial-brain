import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 30;

// ── Response Types ──
interface TopStockCard {
  symbol: string;
  company?: string;
  sector: string;
  horizonDays: 1 | 3 | 7;
  finalDecision: 'BUY';
  rawScore: number;
  hybridConfidence: number;
  displayRankScore: number;
  regime: string;
  regimeConfidence?: number;
  transitionRisk?: number;
  topReasons: string[];
  riskFlags: string[];
  updatedAt: string;
}

interface TopStocksResponse {
  generatedAt: string;
  modelVersion: string;
  topStocks: TopStockCard[];
  totalScanned: number;
  filteredOut: number;
  message?: string;
}

// ── Config ──
const CONFIG = {
  maxTotal: 9,
  maxPerHorizon: 3,
  maxPerSector: 2,
  minRawScore: 25,
  minConfidence: 0.58,
  maxTransitionRisk: 0.65,
  maxPredictionAgeHours: 24,
  // displayRankScore weights
  wRawScore: 0.40,
  wConfidence: 0.25,
  wRegime: 0.15,
  wSpillover: 0.10,
  wEventClean: 0.10,
};

export async function GET() {
  try {
    // 1. Fetch recent BUY predictions (PENDING status, fresh)
    const cutoff = new Date(Date.now() - CONFIG.maxPredictionAgeHours * 60 * 60 * 1000);

    const predictions = await db.prediction.findMany({
      where: {
        finalDecision: 'BUY',
        evaluationStatus: 'PENDING',
        predictedAt: { gte: cutoff },
        rawScore: { gte: CONFIG.minRawScore },
        calibratedConfidence: { gte: CONFIG.minConfidence },
        transitionRisk: { lte: CONFIG.maxTransitionRisk },
      },
      include: {
        factors: true,
        spilloverSignal: {
          select: {
            riskAlignment: true,
            asiaConsensus: true,
            vixDirection: true,
            sectorTrend: true,
            spilloverScore: true,
            confidence: true,
          },
        },
        marketSnapshots: {
          select: {
            regime: true,
            regimeConfidence: true,
            vixLevel: true,
          },
          take: 1,
        },
      },
      orderBy: { predictedAt: 'desc' },
    });

    if (predictions.length === 0) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        modelVersion: 'N/A',
        topStocks: [],
        totalScanned: 0,
        filteredOut: 0,
        message: 'Asnjë prediction BUY aktive. Një scan i ri duhet ekzekutuar.',
      } satisfies TopStocksResponse);
    }

    // 2. Get latest model version
    const modelVersion = predictions[0]?.modelVersion || 'unknown';

    // 3. Fetch upcoming high-severity events
    const symbols = [...new Set(predictions.map(p => p.symbol))];
    const now = new Date();
    const events = await db.eventSnapshot.findMany({
      where: {
        ticker: { in: symbols },
        eventDate: { gte: now },
        severity: { in: ['HIGH', 'CRITICAL'] },
      },
      orderBy: { daysUntil: 'asc' },
    });

    const eventRiskMap = new Map<string, { severity: string; daysUntil: number | null; eventType: string }[]>();
    for (const e of events) {
      if (!eventRiskMap.has(e.ticker)) eventRiskMap.set(e.ticker, []);
      eventRiskMap.get(e.ticker)!.push({
        severity: e.severity,
        daysUntil: e.daysUntil,
        eventType: e.eventType,
      });
    }

    // 4. Deduplicate: keep only latest prediction per symbol per horizon
    const latestByKey = new Map<string, typeof predictions[0]>();
    for (const p of predictions) {
      const key = `${p.symbol}:${p.horizonDays}`;
      const existing = latestByKey.get(key);
      if (!existing || p.predictedAt > existing.predictedAt) {
        latestByKey.set(key, p);
      }
    }

    // 5. Build cards with filtering
    const cards: TopStockCard[] = [];
    const sectorCounts = new Map<string, number>();
    const horizonCounts = new Map<number, number>();
    const candidates = Array.from(latestByKey.values()).sort((a, b) => b.rawScore - a.rawScore);

    for (const p of candidates) {
      if (cards.length >= CONFIG.maxTotal) break;

      const horizon = p.horizonDays as 1 | 3 | 7;
      const sector = p.sector || 'Unknown';

      // Event risk: skip critical event within 2 days
      const tickerEvents = eventRiskMap.get(p.symbol) || [];
      if (tickerEvents.some(e => e.severity === 'CRITICAL' && (e.daysUntil ?? 999) <= 2)) continue;

      // Per-horizon limit
      if ((horizonCounts.get(horizon) || 0) >= CONFIG.maxPerHorizon) continue;

      // Per-sector limit
      if ((sectorCounts.get(sector) || 0) >= CONFIG.maxPerSector) continue;

      // Build risk flags
      const riskFlags: string[] = [];
      if (tickerEvents.length > 0) {
        const ne = tickerEvents[0];
        riskFlags.push(`${ne.eventType} in ${ne.daysUntil}d`);
      }
      if ((p.transitionRisk ?? 0) > 0.5) riskFlags.push('High transition risk');
      if (p.regime?.includes('BEAR') || p.regime?.includes('PANIC')) riskFlags.push('Bearish regime');
      if ((p.regimeConfidence ?? 0) < 0.4) riskFlags.push('Low regime confidence');

      const sp = p.spilloverSignal;
      if (sp) {
        if ((sp.riskAlignment ?? 0) < -0.3) riskFlags.push('Negative spillover');
        if (sp.vixDirection === 'rising') riskFlags.push('VIX rising');
        if (sp.sectorTrend === 'weak') riskFlags.push('Weak sector');
      }

      if (riskFlags.length > 3) continue; // too risky

      // Build top reasons
      const bullishFactors = p.factors
        .filter(f => f.score > 0.5 && f.signal !== 'BEARISH')
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const topReasons: string[] = [];
      if (sp && (sp.asiaConsensus ?? 0) > 0.2) topReasons.push('Asia + sector aligned');
      if (sp && (sp.riskAlignment ?? 0) > 0.2) topReasons.push('Positive spillover signal');
      if (p.regime && !p.regime.includes('BEAR') && !p.regime.includes('PANIC')) {
        topReasons.push(`Regime ${p.regime?.replace(/_/g, ' ').toLowerCase()}, low transition risk`);
      }
      for (const f of bullishFactors) {
        if (topReasons.length >= 3) break;
        topReasons.push(f.description || `${f.factorName}: ${f.signal || 'bullish'}`);
      }
      if (topReasons.length === 0) topReasons.push('Multiple bullish factors aligned');

      // Compute displayRankScore (composite)
      const nScore = Math.min(p.rawScore / 100, 1);
      const nConf = Math.min(p.calibratedConfidence, 1);
      const regimeComp = (p.regime && !p.regime.includes('BEAR') && !p.regime.includes('PANIC'))
        ? (p.regimeConfidence ?? 0.5) : 0.2;
      const spillAlign = sp ? Math.max(0, (sp.riskAlignment ?? 0) * 0.5 + 0.5) : 0.5;
      const eventClean = riskFlags.length === 0 ? 1.0 : riskFlags.length <= 1 ? 0.7 : 0.4;

      const displayRankScore = Math.round((
        CONFIG.wRawScore * nScore +
        CONFIG.wConfidence * nConf +
        CONFIG.wRegime * regimeComp +
        CONFIG.wSpillover * spillAlign +
        CONFIG.wEventClean * eventClean
      ) * 100);

      const ageMs = Date.now() - p.predictedAt.getTime();
      const ageMin = Math.round(ageMs / 60000);
      const updatedAt = ageMin < 60 ? `${ageMin} min ago` : `${Math.round(ageMin / 60)}h ago`;

      cards.push({
        symbol: p.symbol,
        sector,
        horizonDays: horizon,
        finalDecision: 'BUY',
        rawScore: Math.round(p.rawScore),
        hybridConfidence: Math.round(p.calibratedConfidence * 100),
        displayRankScore,
        regime: p.regime || 'UNKNOWN',
        regimeConfidence: p.regimeConfidence ? Math.round(p.regimeConfidence * 100) : undefined,
        transitionRisk: p.transitionRisk ? Math.round(p.transitionRisk * 100) : undefined,
        topReasons: topReasons.slice(0, 3),
        riskFlags,
        updatedAt,
      });

      horizonCounts.set(horizon, (horizonCounts.get(horizon) || 0) + 1);
      sectorCounts.set(sector, (sectorCounts.get(sector) || 0) + 1);
    }

    cards.sort((a, b) => b.displayRankScore - a.displayRankScore);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      modelVersion,
      topStocks: cards,
      totalScanned: predictions.length,
      filteredOut: predictions.length - cards.length,
    } satisfies TopStocksResponse);
  } catch (error) {
    console.error('[TOP-STOCKS] Error:', error);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      modelVersion: 'N/A',
      topStocks: [],
      totalScanned: 0,
      filteredOut: 0,
      message: 'DB nuk është i disponueshëm. Konfiguro DATABASE_URL në Vercel.',
    } satisfies TopStocksResponse);
  }
}
