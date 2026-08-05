import { NextResponse } from 'next/server';
import { fetchHistoricalData, getBatchQuotesFast, getRealPrices } from '@/lib/alpha-vantage';
import { predictHybridV2, rankHybridStocksV2 } from '@/lib/hybrid-prediction';
import { postEvaluationUpdate } from '@/lib/evaluation-engine';
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
  'MOD','MPC','MS','NET','PARR','SCHW','SNPS','STX',
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

const UNIQUE_TICKERS = [...new Set(ALL_TICKERS.map(t => t.toUpperCase()))];

export async function GET() {
  try {
    // ─── STEP 1: Auto-evaluate past predictions (DB-backed) ──
    console.log('[AI-PREDICT-SCAN] Step 1: Auto-evaluating past predictions...');
    let evalResult = { evaluated: 0, correct: 0, lessonsExtracted: 0, weightsUpdated: 0 };
    try {
      const evalEngine = await import('@/lib/evaluation-engine');
      const result = await evalEngine.evaluateDuePredictions();
      evalResult = {
        evaluated: result.evaluated,
        correct: result.correct,
        lessonsExtracted: 0,
        weightsUpdated: 0,
      };
      if (result.evaluated > 0) {
        console.log(`[AI-PREDICT-SCAN] Evaluated ${result.evaluated} (${result.correct} correct). Running post-eval...`);
        const postEval = await evalEngine.postEvaluationUpdate();
        evalResult.lessonsExtracted = postEval.lessonsExtracted;
        evalResult.weightsUpdated = postEval.weightsUpdated;
      }
    } catch (err: any) {
      console.log(`[AI-PREDICT-SCAN] Evaluation skipped: ${err.message}`);
    }

    // ─── STEP 2: Fetch live prices + fundamentals ──
    console.log('[AI-PREDICT-SCAN] Step 2: Fetching prices...');
    const [livePrices, allFundamentals] = await Promise.all([
      getRealPrices(UNIQUE_TICKERS, { forceRefresh: true }),
      getBatchQuotesFast(UNIQUE_TICKERS, { forceRefresh: true }),
    ]);
    console.log(`[AI-PREDICT-SCAN] Live: ${Object.keys(livePrices).length}, Fund: ${Object.keys(allFundamentals).length}`);

    // ─── STEP 3: Run v2 5-factor predictions ──
    console.log('[AI-PREDICT-SCAN] Step 3: Running v2 predictions...');
    const results: Awaited<ReturnType<typeof predictHybridV2>>[] = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;

    const BATCH_SIZE = 3;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH_SIZE) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const [historicalData, fundMap] = await Promise.all([
            fetchHistoricalData(ticker, '6mo', { forceRefresh: true }),
            Promise.resolve(allFundamentals[ticker] || null),
          ]);

          if (!historicalData || historicalData.length < 60) {
            throw new Error('Insufficient data');
          }

          const fundamentals = fundMap;
          const live = livePrices[ticker];
          const currentPrice = live?.price && live.price > 0 ? live.price : (historicalData[historicalData.length - 1]?.close ?? 0);

          return predictHybridV2(ticker, historicalData, fundamentals, currentPrice, {
            horizonDays: 1,
            sector: SECTOR_MAP[ticker],
            saveToDb: true,
            skipSpillover: true, // scan speed: skip expensive spillover per-symbol
          });
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

    // ─── STEP 4: Rank ──
    const ranked = rankHybridStocksV2(results);

    // ─── STEP 5: Build candidates for DailyPick ──
    const candidates: RankedCandidate[] = ranked.allResults.map((r) => ({
      symbol: r.symbol,
      sector: r.sector ?? 'UNKNOWN',
      score: r.rawScore,
      quoteTimestamp: Date.now(),
    })).filter(c => c.symbol);

    const { top, bottom } = await buildTopBottomPicks(candidates, 5, 5);

    // ─── STEP 6: Get DB stats ──
    const dbStats = await prisma.aIStats.findFirst().catch(() => null);

    // ─── Return ──
    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      modelVersion: 'predict-v5-5factor',
      total: UNIQUE_TICKERS.length,
      successful: fetched,
      failed,
      errors: errors.slice(0, 20),
      evaluationResult: evalResult,
      learningStats: {
        totalPredictions: dbStats?.totalPredictions ?? 0,
        directionAccuracy: dbStats?.avgAccuracy ?? 50,
        source: 'db',
      },
      topPicks: ranked.topPicks.map(r => ({
        symbol: r.symbol, sector: r.sector, score: r.rawScore,
        direction: r.direction, confidence: r.calibratedConfidence,
        topReasons: r.topReasons,
        spilloverSummary: r.spilloverAssessment ? `${r.spilloverAssessment.setupType} (${r.spilloverAssessment.spilloverScore.toFixed(1)})` : undefined,
        regimeState: r.regimeAssessment?.regime,
        eventRisk: r.eventRisk?.eventType !== 'none' ? r.eventRisk.description : undefined,
      })),
      topShorts: ranked.topShorts.map(r => ({
        symbol: r.symbol, sector: r.sector, score: r.rawScore,
        direction: r.direction, confidence: r.calibratedConfidence,
        topReasons: r.topReasons,
      })),
      mostConfident: ranked.mostConfident.map(r => ({
        symbol: r.symbol, score: r.rawScore,
        direction: r.direction, confidence: r.calibratedConfidence,
      })),
      allResults: ranked.allResults.map(r => ({
        symbol: r.symbol, sector: r.sector,
        score: r.rawScore, direction: r.direction,
        confidence: r.calibratedConfidence,
        technicalScore: r.technicalScore, fundamentalScore: r.fundamentalScore,
        spilloverScore: r.spilloverScore, regimeScore: r.regimeScore, eventScore: r.eventScore,
        topReasons: r.topReasons, aiInsight: r.aiInsight,
        saved: r.saved, predictionId: r.predictionId,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-PREDICT-SCAN] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
