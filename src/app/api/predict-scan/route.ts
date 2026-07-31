import { NextResponse } from 'next/server';
import { fetchHistoricalData, getBatchQuotesFast } from '@/lib/alpha-vantage';
import { predictStock, rankStocks } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { loadLearningStats } from '@/lib/prediction-history';
import { savePrediction } from '@/lib/save-prediction';
import { buildTopBottomPicks, type RankedCandidate } from '@/lib/top-picks-selector';
import type { PredictionResult } from '@/lib/prediction-engine';

export const maxDuration = 300;

const ALL_TICKERS = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','BRK-B','JPM','V',
  'UNH','JNJ','WMT','PG','MA','HD','COST','ABBV','AVGO','PEP',
  'KO','NKE','MRK','TMO','CSCO','ACN','ABT','ADBE','CRM','AMD',
  'NFLX','PYPL','INTC','CMCSA','QCOM','COP','TXN','AMGN','ORCL','CME',
  'LOW','SBUX','INTU','ISRG','BLK','AXP','BKNG','GILD','MDLZ','LRCX',
  'ADI','VRTX','REGN','FISV','CI','SYK','MU','CB','SLB','ZTS',
  'BSX','BDX','PGR','CL','MMC','EOG','SO','DUK','PFE','BA',
  'DE','CAT','GE','IBM','DIS','RTX','HON','UPS','CVX','EQIX',
  'LMT','PLD','PSA','WELL','AMT','AON','SPGI','SHW','NOC','ICE',
  'AI','AMAT','ANET','ANSS','ARM','BAC','CDNS','CEG','CRWD','DDOG',
  'DVN','FANG','FI','GD','GLW','GS','HPE','KLAC','LHX',
  'MPC','MS','NET','SCHW','SNPS','STX',
  'TGT','TJX','VRT','VST','WDC','WFC','WFRD',
];

// Rough sector map for concentration penalty
const SECTOR_MAP: Record<string, string> = {
  AAPL:'Tech', MSFT:'Tech', GOOGL:'Tech', AMZN:'Consumer', NVDA:'Semi', META:'Tech',
  TSLA:'Auto', JPM:'Finance', V:'Finance', UNH:'Healthcare', JNJ:'Healthcare',
  WMT:'Consumer', PG:'Consumer', MA:'Finance', HD:'Consumer', COST:'Consumer',
  AVGO:'Semi', ADBE:'Tech', CRM:'Tech', AMD:'Semi', NFLX:'Tech',
  PYPL:'Finance', INTC:'Semi', QCOM:'Semi', TXN:'Semi', AMGN:'Healthcare',
  ORCL:'Tech', CME:'Finance', LRCX:'Semi', VRTX:'Healthcare',
  MU:'Semi', KLAC:'Semi', ARM:'Semi', AI:'Tech', CRWD:'Tech',
  NET:'Tech', ANET:'Tech', SNPS:'Semi', AMAT:'Semi',
  // Finance
  BAC:'Finance', AXP:'Finance', BKNG:'Consumer', SCHW:'Finance', GS:'Finance', MS:'Finance',
  ICE:'Finance', SPGI:'Finance', AON:'Finance', CBOE:'Finance',
  // Energy
  COP:'Energy', CVX:'Energy', XOM:'Energy', SLB:'Energy', EOG:'Energy', DVN:'Energy', MPC:'Energy', FANG:'Energy',
  // Industrials
  CAT:'Industrial', DE:'Industrial', GE:'Industrial', HON:'Industrial', RTX:'Industrial',
  LMT:'Defense', NOC:'Defense', BA:'Industrial', UPS:'Logistics',
  // Healthcare
  REGN:'Healthcare', SYK:'Healthcare', PFE:'Healthcare', TMO:'Healthcare', ABT:'Healthcare',
  // etc.
};

const UNIQUE_TICKERS = [...new Set(ALL_TICKERS)];

export async function GET() {
  try {
    const results: Array<PredictionResult & { _ticker?: string; _lastClose?: number }> = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;
    const scanStartMs = Date.now();

    // Load learning stats once
    const learningStats = await loadLearningStats().catch(() => ({
      totalPredictions: 0, checkedPredictions: 0,
      shortTermAccuracy: 50, mediumTermAccuracy: 50,
      directionAccuracy: 50, indicatorAccuracy: {},
      fundamentalAccuracy: {}, learningWeights: {},
      fundamentalWeights: {}, lastUpdated: new Date().toISOString(),
      bestIndicators: [], worstIndicators: [],
      averageAbsoluteError: 0, recentAccuracy: 50,
    }));

    // Batch fundamentals
    console.log('[SCAN] Fetching fundamentals...');
    const allFundamentals = await getBatchQuotesFast(UNIQUE_TICKERS);
    console.log(`[SCAN] Got fundamentals for ${Object.keys(allFundamentals).length}/${UNIQUE_TICKERS.length} tickers`);

    // Fetch previous scan results for scoreDelta computation
    let prevScores: Record<string, number> = {};
    try {
      const prevRes = await fetch('/api/prediction-history?limit=200').then(r => r.json());
      if (prevRes.predictions) {
        // Group by symbol, take latest score per symbol
        const bySymbol = new Map<string, number>();
        for (const p of prevRes.predictions) {
          if (p.rawScore != null) bySymbol.set(p.symbol, p.rawScore);
        }
        prevScores = Object.fromEntries(bySymbol);
      }
    } catch {
      // Non-critical
    }

    // Scan in batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH_SIZE) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchHistoricalData(ticker, '6mo');
          if (!data || data.length < 60) {
            throw new Error('Të dhëna të pamjaftueshme');
          }

          const baseResult = predictStock(ticker, data);
          const lastClose = data[data.length - 1].close;

          // Fundamental analysis
          const fund = allFundamentals[ticker];
          let fundamentalScore = 0;
          if (fund) {
            const fundResult = analyzeFundamentals(ticker, fund);
            fundamentalScore = fundResult.totalScore;
          }

          // Combined score (same as before)
          const combined = baseResult.technicalScore * 0.75 + fundamentalScore * 0.25;

          // Store for learning (non-blocking)
          savePrediction({
            symbol: ticker, horizonDays: 1,
            modelVersion: 'predict-v3-regime-spillover',
            entryPrice: lastClose,
            rawScore: combined,
            calibratedConfidence: baseResult.confidence,
            finalDecision: baseResult.direction === 'STRONG_SELL' || baseResult.direction === 'SELL' ? 'SELL'
              : baseResult.direction === 'STRONG_BUY' || baseResult.direction === 'BUY' ? 'BUY' : 'HOLD',
            factors: [],
          }).catch(() => {});

          return {
            ...baseResult,
            score: Math.round(combined * 100) / 100,
            combinedScore: Math.round(combined * 100) / 100,
            fundamentalData: fundamentalScore !== 0 ? {
              score: fundamentalScore, summary: '', scores: {},
            } : null,
            _ticker: ticker,
            _lastClose: lastClose,
          };
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const r = batchResults[j];
        if (r.status === 'fulfilled') {
          results.push(r.value);
          fetched++;
        } else {
          errors.push(`${batch[j]}: ${r.reason?.message || 'Gabim'}`);
          failed++;
        }
      }

      if (i + BATCH_SIZE < UNIQUE_TICKERS.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const ranked = rankStocks(results);

    // ── Top/Bottom picks with freshness/novelty/concentration ──
    const candidates: RankedCandidate[] = ranked.map((r) => ({
      symbol: (r as any)._ticker ?? '',
      sector: SECTOR_MAP[(r as any)._ticker] ?? 'UNKNOWN',
      score: r.combinedScore ?? r.score ?? 0,
      scoreDelta1d: (r as any)._ticker && prevScores[(r as any)._ticker] != null
        ? r.combinedScore - prevScores[(r as any)._ticker]
        : undefined,
      quoteTimestamp: scanStartMs, // all scanned in same run, same timestamp
    })).filter(c => c.symbol);

    const { top, bottom } = await buildTopBottomPicks(candidates, 5, 5);

    // Build clean output (strip internal fields)
    const cleanTop = top.map(t => ({
      symbol: t.symbol,
      sector: t.sector,
      score: t.score,
      bullishRank: t.bullishRank,
      ageSec: Math.round(t.ageSec),
      topRepeat: t.topRepeat,
      confidence: (ranked.find(r => (r as any)._ticker === t.symbol))?.confidence ?? 0,
      direction: (ranked.find(r => (r as any)._ticker === t.symbol))?.direction ?? 'HOLD',
    }));

    const cleanBottom = bottom.map(b => ({
      symbol: b.symbol,
      sector: b.sector,
      score: b.score,
      bearishRank: b.bearishRank,
      ageSec: Math.round(b.ageSec),
      bottomRepeat: b.bottomRepeat,
      confidence: (ranked.find(r => (r as any)._ticker === b.symbol))?.confidence ?? 0,
      direction: (ranked.find(r => (r as any)._ticker === b.symbol))?.direction ?? 'HOLD',
    }));

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      total: UNIQUE_TICKERS.length,
      successful: fetched,
      failed,
      errors: errors.slice(0, 20),
      learningStats: {
        totalPredictions: learningStats.totalPredictions,
        directionAccuracy: learningStats.directionAccuracy,
        recentAccuracy: learningStats.recentAccuracy,
        bestIndicators: learningStats.bestIndicators,
        worstIndicators: learningStats.worstIndicators,
      },
      // New diversified picks
      topPicks: cleanTop,
      topShorts: cleanBottom,
      // Legacy fields (backward compat)
      mostConfident: [...ranked].sort((a, b) => b.confidence - a.confidence).slice(0, 10),
      allResults: ranked.map((r) => {
        const { _ticker, _lastClose, ...rest } = r as PredictionResult & { _ticker?: string; _lastClose?: number };
        return rest as PredictionResult;
      }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICT-SCAN] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
