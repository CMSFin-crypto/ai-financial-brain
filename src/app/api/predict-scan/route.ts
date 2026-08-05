import { NextResponse } from 'next/server';
import { fetchHistoricalData, getBatchQuotesFast, getRealPrices } from '@/lib/alpha-vantage';
import { predictStock, rankStocks, type PredictionResult } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { savePrediction } from '@/lib/save-prediction';
import { buildTopBottomPicks, type RankedCandidate } from '@/lib/top-picks-selector';
import { getRegimeAssessment } from '@/lib/regime-engine';
import { checkMultiEventRisk } from '@/lib/event-risk';
import { getModelWeights, seedDefaultWeights } from '@/lib/model-weights';
import { evaluateDuePredictions, postEvaluationUpdate } from '@/lib/evaluation-engine';
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

// ─── Helpers ──

async function loadPreviousScores(cutoffHours = 18): Promise<Record<string, { score: number; predictedAt: Date }>> {
  try {
    const cutoff = new Date(Date.now() - cutoffHours * 60 * 60 * 1000);
    const preds = await prisma.prediction.findMany({
      where: { horizonDays: 1, modelVersion: 'predict-v5-5factor', predictedAt: { lte: cutoff } },
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
    console.log(`[SCAN] Loaded ${cutoffHours}h-ago scores for ${bySymbol.size} symbols`);
    return Object.fromEntries(bySymbol);
  } catch (err) {
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
      _sector?: string; _topReasons?: string[]; _eventSummary?: string;
      _regime?: string;
    }> = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;
    const scanStartMs = Date.now();

    // ── STEP 0: Auto-evaluate past predictions (DB-backed) ──
    console.log('[SCAN] Step 0: Auto-evaluating past predictions...');
    try {
      const evalResult = await evaluateDuePredictions();
      if (evalResult.evaluated > 0) {
        console.log(`[SCAN] Evaluated ${evalResult.evaluated} (${evalResult.correct} correct). Post-eval...`);
        await postEvaluationUpdate().catch(() => {});
      }
    } catch (err: any) {
      console.log(`[SCAN] Evaluation skipped: ${err.message}`);
    }

    // ── STEP 1: Get regime + weights (shared across all tickers) ──
    console.log('[SCAN] Step 1: Loading regime + weights...');
    const [regimeAssessment, weights] = await Promise.all([
      getRegimeAssessment().catch(() => null),
      getModelWeights(1).catch(() => null),
    ]);
    const hw = weights?.horizonWeights;

    // ── STEP 2: Load previous scores ──
    const [prevScoresMap, prevScores3dMap] = await Promise.all([
      loadPreviousScores(18),
      loadPreviousScores(72),
    ]);

    // ── STEP 3: Fetch live prices + fundamentals ──
    console.log('[SCAN] Step 3: Fetching live prices + fundamentals...');
    const [livePrices, allFundamentals] = await Promise.all([
      getRealPrices(UNIQUE_TICKERS, { forceRefresh: true }),
      getBatchQuotesFast(UNIQUE_TICKERS, { forceRefresh: true }),
    ]);
    console.log(`[SCAN] Live: ${Object.keys(livePrices).length}, Fund: ${Object.keys(allFundamentals).length}`);

    // ── STEP 4: Scan with 5-factor scoring ──
    console.log('[SCAN] Step 4: Scanning with 5-factor engine...');
    const BATCH_SIZE = 5;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH_SIZE) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchHistoricalData(ticker, '6mo', { forceRefresh: true });
          if (!data || data.length < 60) throw new Error('Insufficient data');

          const baseResult = predictStock(ticker, data);
          const historicalLastClose = data[data.length - 1].close;
          const live = livePrices[ticker];
          const lastClose = live?.price && live.price > 0 ? live.price : historicalLastClose;
          const sector = SECTOR_MAP[ticker] ?? 'UNKNOWN';

          // Fundamental
          const fund = allFundamentals[ticker];
          let fundamentalScore = 0;
          if (fund) {
            try {
              const fundResult = analyzeFundamentals(ticker, fund);
              fundamentalScore = fundResult.totalScore;
            } catch { /* skip */ }
          }

          // Event risk (per-ticker, cheap)
          const multiEvent = checkMultiEventRisk(ticker);
          const eventScore = multiEvent.compositeRiskScore;

          // 5-factor combination with spillover PROXY from regime drivers
          const techNorm = Math.max(-100, Math.min(100, baseResult.score));
          const fundNorm = Math.max(-100, Math.min(100, fundamentalScore * 3));
          const eventNorm = Math.max(-100, Math.min(100, eventScore));
          const regimeNorm = regimeAssessment ? Math.max(-100, Math.min(100, regimeAssessment.regimeScore)) : 0;

          // Spillover proxy from regime context (no per-ticker API call needed)
          let spillProxy = 0;
          if (regimeAssessment) {
            const d = regimeAssessment.drivers;
            const spySig = d.spy1d > 0.5 ? 1 : d.spy1d < -0.5 ? -1 : 0;
            const qqqSig = d.qqq1d > 0.5 ? 1 : d.qqq1d < -0.5 ? -1 : 0;
            const smhSig = d.smh1d > 0.5 ? 1 : d.smh1d < -0.5 ? -1 : 0;
            const kospiSig = d.kospi1d > 0.5 ? 1 : d.kospi1d < -0.5 ? -1 : 0;
            const vixPen = d.vixLevel > 25 ? -10 : d.vixLevel > 20 ? -5 : 0;
            const sigs = [spySig, qqqSig, smhSig, kospiSig].filter(s => s !== 0);
            spillProxy = sigs.length > 0 ? Math.max(-100, Math.min(100, Math.round((sigs.reduce((a, b) => a + b, 0) / sigs.length) * 25 + vixPen))) : 0;
          }
          const spillNorm = spillProxy;

          const techW = hw?.technical ?? 0.55;
          const fundW = hw?.fundamental ?? 0.05;
          const spillW = hw?.spillover ?? 0.20;
          const regimeW = hw?.regime ?? 0.10;
          const eventW = hw?.event ?? 0.10;

          const combined = Math.round((
            techNorm * techW +
            fundNorm * fundW +
            spillNorm * spillW +
            regimeNorm * regimeW +
            eventNorm * eventW
          ) * 10) / 10;

          // Decision
          const absScore = Math.abs(combined);
          let direction: 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';
          if (multiEvent.hasCriticalEvent && absScore < 40) {
            direction = 'NO_TRADE';
          } else if (absScore >= 25) {
            direction = combined > 0 ? 'BUY' : 'SELL';
          } else if (absScore >= 10) {
            direction = 'HOLD';
          } else {
            direction = 'NO_TRADE';
          }

          // 5-factor confluence confidence
          const agreeCount = [fundNorm, spillNorm, regimeNorm].filter(s => {
            if (s === 0) return false;
            return (s > 0) === (techNorm > 0);
          }).length;
          const conflictCount = [fundNorm, spillNorm, regimeNorm].filter(s => {
            if (s === 0) return false;
            return (s > 0) !== (techNorm > 0) && Math.abs(s) > 20;
          }).length;
          let hybridConf = baseResult.confidence + agreeCount * 5 - conflictCount * 8;
          if (regimeAssessment?.isVolatile) hybridConf -= 5;
          if (multiEvent.hasCriticalEvent) hybridConf -= 15;
          else if (multiEvent.events.length > 0) hybridConf -= 5;
          hybridConf = Math.max(10, Math.min(98, Math.round(hybridConf)));

          // Build reasons
          const reasons: string[] = [];
          reasons.push(`Teknika: ${techNorm > 0 ? '+' : ''}${techNorm.toFixed(1)}`);
          if (spillNorm !== 0) reasons.push(`Spillover (proxy): ${spillNorm > 0 ? '+' : ''}${spillNorm.toFixed(1)}`);
          if (fundNorm !== 0) reasons.push(`Fundamentet: ${fundNorm > 0 ? '+' : ''}${fundNorm.toFixed(1)}`);
          if (regimeAssessment && regimeAssessment.regime !== 'RANGE_NEUTRAL') {
            reasons.push(`Regjimi: ${regimeAssessment.regime}`);
          }
          if (multiEvent.hasCriticalEvent) {
            reasons.push(`Rrezik ngjarjeje: ${multiEvent.summary}`);
          }

          // Build factors for DB (lightweight for scan)
          const factors = [
            { factorName: 'technicalAggregate', factorType: 'technical', score: techNorm, weight: techW, signal: techNorm > 0 ? 'BULLISH' : 'BEARISH' },
            { factorName: 'fundamentalAggregate', factorType: 'fundamental', score: fundNorm, weight: fundW, signal: fundNorm > 0 ? 'BULLISH' : fundNorm < 0 ? 'BEARISH' : 'NEUTRAL' },
            { factorName: 'regimeAggregate', factorType: 'regime', score: regimeNorm, weight: regimeW, signal: regimeAssessment?.isBullish ? 'BULLISH' : regimeAssessment?.isBearish ? 'BEARISH' : 'NEUTRAL' },
            { factorName: 'spilloverAggregate', factorType: 'spillover', score: spillNorm, weight: spillW, signal: spillNorm > 10 ? 'BULLISH' : spillNorm < -10 ? 'BEARISH' : 'NEUTRAL', description: 'Spillover (proxy from regime)' },
            { factorName: 'eventRiskAggregate', factorType: 'event', score: eventNorm, weight: eventW, signal: multiEvent.worstEvent.severity },
          ];

          // Save with full factors + 5-factor confidence
          savePrediction({
            symbol: ticker, sector, horizonDays: 1,
            modelVersion: 'predict-v5-5factor',
            entryPrice: lastClose,
            rawScore: combined,
            calibratedConfidence: hybridConf,
            finalDecision: direction,
            factors,
            regime: regimeAssessment?.regime,
            regimeConfidence: regimeAssessment?.confidence,
            transitionRisk: regimeAssessment?.transitionRisk,
            marketSnapshot: regimeAssessment ? {
              regime: regimeAssessment.regime,
              regimeConfidence: regimeAssessment.confidence,
              spyPrice: 0,
              vixLevel: regimeAssessment.drivers.vixLevel,
            } : undefined,
            eventSnapshots: multiEvent.events.length > 0 ? multiEvent.events.map(e => ({
              eventType: e.eventType,
              daysUntil: e.daysUntil,
              severity: e.severity,
              description: e.description,
            })) : undefined,
            decisionReasons: reasons,
          }).catch(() => {});

          const volumeDelta = computeVolumeDelta(data);
          const priceChangePct = computePriceChangePct(data);
          const dataTimestamp = live?.timestamp
            ? new Date(live.timestamp).getTime()
            : new Date(data[data.length - 1].date).getTime();

          return {
            ...baseResult,
            score: Math.round(combined * 100) / 100,
            combinedScore: Math.round(combined * 100) / 100,
            _ticker: ticker,
            _lastClose: lastClose,
            _dataTimestamp: dataTimestamp,
            _volumeDelta: volumeDelta,
            _priceChangePct: priceChangePct,
            _liveChangePct: live?.change ?? 0,
            _liveSource: live?.source ?? 'historical_fallback',
            _sector: sector,
            _topReasons: reasons.slice(0, 3),
            _eventSummary: multiEvent.hasCriticalEvent ? multiEvent.summary : undefined,
            _regime: regimeAssessment?.regime,
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

    // ── STEP 5: Build candidates ──
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
        sector: (r as any)._sector ?? SECTOR_MAP[ticker] ?? 'UNKNOWN',
        score: r.combinedScore ?? r.score ?? 0,
        scoreDelta1d, scoreDelta3d,
        volumeDelta: (r as any)._volumeDelta,
        priceChangePct: (r as any)._liveChangePct ?? (r as any)._priceChangePct,
        quoteTimestamp: (r as any)._dataTimestamp ?? scanStartMs,
      };
    }).filter(c => c.symbol);

    // ── STEP 6: Top/Bottom picks ──
    const { top, bottom } = await buildTopBottomPicks(candidates, 5, 5);

    const rankedBySymbol = new Map<string, PredictionResult>();
    for (const r of ranked) {
      const t = (r as any)._ticker;
      if (t) rankedBySymbol.set(t, r);
    }

    const cleanTop = top.map(t => {
      const base = rankedBySymbol.get(t.symbol);
      const r = base as any;
      return {
        symbol: t.symbol, sector: t.sector, score: t.score,
        bullishRank: t.bullishRank, scoreDelta1d: t.scoreDelta1d, scoreDelta3d: t.scoreDelta3d,
        volumeDelta: t.volumeDelta, priceChangePct: t.priceChangePct,
        ageSec: Math.round(t.ageSec), topRepeat: t.topRepeat,
        freshnessPen: t.freshnessPen, noveltyPen: t.noveltyPenTop,
        confidence: base?.confidence ?? 0, direction: base?.direction ?? 'HOLD',
        topReasons: r?._topReasons, eventSummary: r?._eventSummary, regime: r?._regime,
      };
    });

    const cleanBottom = bottom.map(b => {
      const base = rankedBySymbol.get(b.symbol);
      const r = base as any;
      return {
        symbol: b.symbol, sector: b.sector, score: b.score,
        bearishRank: b.bearishRank, scoreDelta1d: b.scoreDelta1d, scoreDelta3d: b.scoreDelta3d,
        volumeDelta: b.volumeDelta, priceChangePct: b.priceChangePct,
        ageSec: Math.round(b.ageSec), bottomRepeat: b.bottomRepeat,
        freshnessPen: b.freshnessPen, noveltyPen: b.noveltyPenBottom,
        confidence: base?.confidence ?? 0, direction: base?.direction ?? 'HOLD',
        topReasons: r?._topReasons, eventSummary: r?._eventSummary, regime: r?._regime,
      };
    });

    // ── STEP 7: DB stats ──
    const dbStats = await prisma.aIStats.findFirst().catch(() => null);

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      modelVersion: 'predict-v5-5factor',
      total: UNIQUE_TICKERS.length, successful: fetched, failed,
      errors: errors.slice(0, 20),
      dataFreshness: {
        livePricesCount: Object.keys(livePrices).length,
        fundamentalsSource: 'static_json',
        historicalForcedRefresh: true,
      },
      regime: regimeAssessment ? {
        regime: regimeAssessment.regime,
        confidence: regimeAssessment.confidence,
        regimeScore: regimeAssessment.regimeScore,
        isBullish: regimeAssessment.isBullish,
        isBearish: regimeAssessment.isBearish,
        allowLongs: regimeAssessment.allowLongs,
        allowShorts: regimeAssessment.allowShorts,
      } : null,
      learningStats: {
        totalPredictions: dbStats?.totalPredictions ?? 0,
        directionAccuracy: dbStats?.avgAccuracy ?? 50,
        source: 'db',
      },
      topPicks: cleanTop, topShorts: cleanBottom,
      mostConfident: [...ranked].sort((a, b) => b.confidence - a.confidence).slice(0, 10).map((r: any) => ({
        symbol: r._ticker, score: r.combinedScore ?? r.score,
        direction: r.direction, confidence: r.confidence,
        topReasons: r._topReasons, regime: r._regime,
      })),
      allResults: ranked.map((r: any) => {
        const { _ticker, _lastClose, _dataTimestamp, _volumeDelta, _priceChangePct,
                _liveChangePct, _liveSource, _sector, _topReasons, _eventSummary,
                _regime, ...rest } = r;
        return rest as PredictionResult;
      }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PREDICT-SCAN] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
