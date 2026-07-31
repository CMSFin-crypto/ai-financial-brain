import { NextResponse } from 'next/server';
import { fetchHistoricalData, getBatchQuotesFast, getRealPrices } from '@/lib/alpha-vantage';
import { predictStock, rankStocks, type PredictionResult } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { loadLearningStats } from '@/lib/prediction-history';
import { savePrediction } from '@/lib/save-prediction';
import { buildTopBottomPicks, type RankedCandidate } from '@/lib/top-picks-selector';
import prisma from '@/lib/prisma';

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

const SECTOR_MAP: Record<string, string> = {
  AAPL:'Tech', MSFT:'Tech', GOOGL:'Tech', AMZN:'Consumer', NVDA:'Semi', META:'Tech',
  TSLA:'Auto', JPM:'Finance', V:'Finance', UNH:'Healthcare', JNJ:'Healthcare',
  WMT:'Consumer', PG:'Consumer', MA:'Finance', HD:'Consumer', COST:'Consumer',
  AVGO:'Semi', ADBE:'Tech', CRM:'Tech', AMD:'Semi', NFLX:'Tech',
  PYPL:'Finance', INTC:'Semi', QCOM:'Semi', TXN:'Semi', AMGN:'Healthcare',
  ORCL:'Tech', CME:'Finance', LRCX:'Semi', VRTX:'Healthcare',
  MU:'Semi', KLAC:'Semi', ARM:'Semi', AI:'Tech', CRWD:'Tech',
  NET:'Tech', ANET:'Tech', SNPS:'Semi', AMAT:'Semi',
  BAC:'Finance', AXP:'Finance', BKNG:'Consumer', SCHW:'Finance', GS:'Finance', MS:'Finance',
  ICE:'Finance', SPGI:'Finance', AON:'Finance', FISV:'Finance',
  COP:'Energy', CVX:'Energy', XOM:'Energy', SLB:'Energy', EOG:'Energy', DVN:'Energy', MPC:'Energy', FANG:'Energy',
  CAT:'Industrial', DE:'Industrial', GE:'Industrial', HON:'Industrial', RTX:'Industrial',
  LMT:'Defense', NOC:'Defense', BA:'Industrial', UPS:'Logistics',
  REGN:'Healthcare', SYK:'Healthcare', PFE:'Healthcare', TMO:'Healthcare', ABT:'Healthcare', CI:'Healthcare',
  PEP:'Consumer', KO:'Consumer', MDLZ:'Consumer', CL:'Consumer',
  BSX:'Healthcare', BDX:'Healthcare', PGR:'Insurance', MMC:'Insurance',
  SO:'Utilities', DUK:'Utilities',
  CSCO:'Tech', ACN:'Tech', INTU:'Tech', ISRG:'Healthcare', BLK:'Finance',
  LOW:'Consumer', SBUX:'Consumer', CMCSA:'Consumer',
  ADI:'Semi', ANSS:'Tech', CDNS:'Semi', CEG:'Energy', DDOG:'Tech',
  FI:'Finance', GD:'Defense', GLW:'Industrial', HPE:'Tech', LHX:'Defense',
  STX:'Tech', TGT:'Consumer', TJX:'Consumer', VRT:'Tech', VST:'Energy',
  WDC:'Tech', WFC:'Finance', WFRD:'Finance',
  EQIX:'REIT', PLD:'REIT', PSA:'REIT', WELL:'REIT', AMT:'REIT',
  'BRK-B':'Finance', MRK:'Healthcare', ZTS:'Healthcare', CB:'Insurance',
  DIS:'Consumer', IBM:'Tech', SHW:'Industrial',
};

const UNIQUE_TICKERS = [...new Set(ALL_TICKERS)];

// ─── Helper: load previous day's scores (cutoff 18h for real 1d delta) ─
async function loadPreviousScores(cutoffHours = 18): Promise<Record<string, { score: number; predictedAt: Date }>> {
  try {
    const cutoff = new Date(Date.now() - cutoffHours * 60 * 60 * 1000);

    const preds = await prisma.prediction.findMany({
      where: {
        horizonDays: 1,
        modelVersion: 'predict-v3-regime-spillover',
        predictedAt: { lte: cutoff },
      },
      orderBy: { predictedAt: 'desc' },
      select: { symbol: true, rawScore: true, predictedAt: true },
      take: 1000,
    });

    const bySymbol = new Map<string, { score: number; predictedAt: Date }>();
    for (const p of preds) {
      if (p.rawScore != null && !bySymbol.has(p.symbol)) {
        bySymbol.set(p.symbol, { score: p.rawScore, predictedAt: p.predictedAt });
      }
    }

    console.log(`[SCAN] Loaded ${cutoffHours}h-ago scores for ${bySymbol.size} symbols from DB`);
    return Object.fromEntries(bySymbol);
  } catch (err) {
    console.warn('[SCAN] Failed to load previous scores from DB:', err);
    return {};
  }
}

function computeVolumeDelta(data: Array<{ volume: number }>): number {
  if (data.length < 21) return 0;
  const recent = data[data.length - 1].volume;
  const avg20 = data.slice(-21, -1).reduce((s, d) => s + d.volume, 0) / 20;
  return avg20 > 0 ? (recent / avg20) - 1 : 0;
}

function computePriceChangePct(data: Array<{ close: number }>): number {
  if (data.length < 2) return 0;
  const prev = data[data.length - 2].close;
  const curr = data[data.length - 1].close;
  return prev > 0 ? ((curr - prev) / prev) * 100 : 0;
}

// ═══════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const results: Array<PredictionResult & {
      _ticker?: string; _lastClose?: number;
      _dataTimestamp?: number; _volumeDelta?: number;
      _priceChangePct?: number; _liveChangePct?: number; _liveSource?: string;
    }> = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;
    const scanStartMs = Date.now();

    const learningStats = await loadLearningStats().catch(() => ({
      totalPredictions: 0, checkedPredictions: 0,
      shortTermAccuracy: 50, mediumTermAccuracy: 50,
      directionAccuracy: 50, indicatorAccuracy: {},
      fundamentalAccuracy: {}, learningWeights: {},
      fundamentalWeights: {}, lastUpdated: new Date().toISOString(),
      bestIndicators: [], worstIndicators: [],
      averageAbsoluteError: 0, recentAccuracy: 50,
    }));

    // ── STEP 1: Load previous scores (1d and 3d) from DB ──
    const [prevScoresMap, prevScores3dMap] = await Promise.all([
      loadPreviousScores(18),
      loadPreviousScores(72),
    ]);

    // ── STEP 2: Fetch live prices (force refresh) + fundamentals ──
    console.log('[SCAN] Fetching live prices (force refresh)...');
    const [livePrices, allFundamentals] = await Promise.all([
      getRealPrices(UNIQUE_TICKERS, { forceRefresh: true }),
      getBatchQuotesFast(UNIQUE_TICKERS, { forceRefresh: true }),
    ]);
    console.log(`[SCAN] Live prices: ${Object.keys(livePrices).length}/${UNIQUE_TICKERS.length}, Fundamentals: ${Object.keys(allFundamentals).length}/${UNIQUE_TICKERS.length}`);

    // ── STEP 3: Scan tickers in batches ──
    const BATCH_SIZE = 5;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH_SIZE) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchHistoricalData(ticker, '6mo', { forceRefresh: true });
          if (!data || data.length < 60) {
            throw new Error('Insufficient data');
          }

          const baseResult = predictStock(ticker, data);
          const historicalLastClose = data[data.length - 1].close;

          // Use live price when available, fallback to historical
          const live = livePrices[ticker];
          const lastClose = live?.price && live.price > 0 ? live.price : historicalLastClose;

          const fund = allFundamentals[ticker];
          let fundamentalScore = 0;
          if (fund) {
            const fundResult = analyzeFundamentals(ticker, fund);
            fundamentalScore = fundResult.totalScore;
          }

          const combined = baseResult.technicalScore * 0.75 + fundamentalScore * 0.25;
          const volumeDelta = computeVolumeDelta(data);
          const priceChangePct = computePriceChangePct(data);

          // Prefer live quote timestamp; fallback to historical date
          const dataTimestamp = live?.timestamp
            ? new Date(live.timestamp).getTime()
            : new Date(data[data.length - 1].date).getTime();

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
            _dataTimestamp: dataTimestamp,
            _volumeDelta: volumeDelta,
            _priceChangePct: priceChangePct,
            _liveChangePct: live?.change ?? 0,
            _liveSource: live?.source ?? 'historical_fallback',
          };
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const r = batchResults[j];
        if (r.status === 'fulfilled') {
          results.push(r.value);
          fetched++;
        } else {
          errors.push(`${batch[j]}: ${r.reason?.message || 'Error'}`);
          failed++;
        }
      }

      if (i + BATCH_SIZE < UNIQUE_TICKERS.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const ranked = rankStocks(results);

    // ── STEP 4: Build candidates with REAL deltas, live prices, 3d history ──
    const candidates: RankedCandidate[] = ranked.map((r) => {
      const ticker = (r as any)._ticker ?? '';
      const prev1d = prevScoresMap[ticker];
      const prev3d = prevScores3dMap[ticker];

      let scoreDelta1d: number | undefined;
      if (prev1d && r.combinedScore != null) {
        scoreDelta1d = Math.round((r.combinedScore - prev1d.score) * 100) / 100;
      }

      let scoreDelta3d: number | undefined;
      if (prev3d && r.combinedScore != null) {
        scoreDelta3d = Math.round((r.combinedScore - prev3d.score) * 100) / 100;
      }

      return {
        symbol: ticker,
        sector: SECTOR_MAP[ticker] ?? 'UNKNOWN',
        score: r.combinedScore ?? r.score ?? 0,
        scoreDelta1d,
        scoreDelta3d,
        volumeDelta: (r as any)._volumeDelta,
        priceChangePct: (r as any)._priceChangePct,
        quoteTimestamp: (r as any)._dataTimestamp ?? scanStartMs,
      };
    }).filter(c => c.symbol);

    // ── STEP 5: Diversified top/bottom picks ──
    const { top, bottom } = await buildTopBottomPicks(candidates, 5, 5);

    const rankedBySymbol = new Map<string, PredictionResult>();
    for (const r of ranked) {
      const t = (r as any)._ticker;
      if (t) rankedBySymbol.set(t, r);
    }

    const cleanTop = top.map(t => {
      const base = rankedBySymbol.get(t.symbol);
      return {
        symbol: t.symbol, sector: t.sector, score: t.score,
        bullishRank: t.bullishRank, scoreDelta1d: t.scoreDelta1d, scoreDelta3d: t.scoreDelta3d,
        volumeDelta: t.volumeDelta, priceChangePct: t.priceChangePct,
        ageSec: Math.round(t.ageSec), topRepeat: t.topRepeat,
        freshnessPen: t.freshnessPen, noveltyPen: t.noveltyPenTop,
        confidence: base?.confidence ?? 0, direction: base?.direction ?? 'HOLD',
      };
    });

    const cleanBottom = bottom.map(b => {
      const base = rankedBySymbol.get(b.symbol);
      return {
        symbol: b.symbol, sector: b.sector, score: b.score,
        bearishRank: b.bearishRank, scoreDelta1d: b.scoreDelta1d, scoreDelta3d: b.scoreDelta3d,
        volumeDelta: b.volumeDelta, priceChangePct: b.priceChangePct,
        ageSec: Math.round(b.ageSec), bottomRepeat: b.bottomRepeat,
        freshnessPen: b.freshnessPen, noveltyPen: b.noveltyPenBottom,
        confidence: base?.confidence ?? 0, direction: base?.direction ?? 'HOLD',
      };
    });

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      total: UNIQUE_TICKERS.length, successful: fetched, failed,
      errors: errors.slice(0, 20),
      dataFreshness: {
        livePricesCount: Object.keys(livePrices).length,
        fundamentalsSource: 'static_json',
        historicalForcedRefresh: true,
      },
      learningStats: {
        totalPredictions: learningStats.totalPredictions,
        directionAccuracy: learningStats.directionAccuracy,
        recentAccuracy: learningStats.recentAccuracy,
        bestIndicators: learningStats.bestIndicators,
        worstIndicators: learningStats.worstIndicators,
      },
      topPicks: cleanTop, topShorts: cleanBottom,
      mostConfident: [...ranked].sort((a, b) => b.confidence - a.confidence).slice(0, 10),
      allResults: ranked.map((r) => {
        const { _ticker, _lastClose, _dataTimestamp, _volumeDelta, _priceChangePct, _liveChangePct, _liveSource, ...rest } = r as any;
        return rest as PredictionResult;
      }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PREDICT-SCAN] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
