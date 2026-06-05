// ═══════════════════════════════════════════════════════════════
// AI LEARNING ENGINE — Mëson nga gabimet, përmirëso akuracine
// Systema e mesimit: regjistron parashikimet, vlerëson saktesinë,
// nxjerr mësime dhe i injekton ato në promptet e ardhshme
// ═══════════════════════════════════════════════════════════════

import { db } from './db';

// ─── Types ───────────────────────────────────────────────────
export interface PredictionRecord {
  ticker: string;
  company: string;
  sector: string;
  signal: string;       // BUY/SELL/HOLD/BULLISH/BEARISH/NEUTRAL
  confidence: number;   // 0-100
  predictedPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  timeframe?: string;    // short/medium/long
  reasoning?: string;
  source: string;       // analyze/daily-picks/sector-scan/technical
}

export interface LearningStats {
  totalPredictions: number;
  evaluatedPredictions: number;
  correctPredictions: number;
  avgAccuracy: number;
  bestSector: string | null;
  worstSector: string | null;
  streakCorrect: number;
  streakWrong: number;
  lessonsLearned: number;
  recentAccuracy: number; // last 20 predictions
  improvement: number;  // % improvement over time
}

export interface Lesson {
  id: string;
  category: string;
  ticker?: string;
  sector?: string;
  mistake: string;
  lesson: string;
  severity: number;
  timesApplied: number;
  createdAt: string;
}

// ─── CACHED LESSONS ──────────────────────────────────────────
let _lessonsCache: string | null = null;
let _lessonsCachedAt = 0;
const LESSONS_CACHE_TTL = 5 * 60 * 1000; // 5 min

// ═══════════════════════════════════════════════════════════════
// 1. RECORD PREDICTION — Save every AI prediction
// ═══════════════════════════════════════════════════════════════

export async function recordPrediction(data: PredictionRecord): Promise<string> {
  try {
    const prediction = await db.prediction.create({
      data: {
        source: data.source,
        ticker: data.ticker,
        company: data.company,
        sector: data.sector,
        signal: data.signal,
        confidence: data.confidence,
        predictedPrice: data.predictedPrice,
        targetPrice: data.targetPrice,
        stopLoss: data.stopLoss,
        timeframe: data.timeframe,
        reasoning: data.reasoning,
      },
    });

    console.log(`[AI-LEARN] Prediction recorded: ${data.ticker} ${data.signal} @ ${data.predictedPrice || 'N/A'} (confidence: ${data.confidence}%)`);
    return prediction.id;
  } catch (error) {
    console.error('[AI-LEARN] Error recording prediction:', error);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. BATCH RECORD — Record multiple predictions at once
// ═══════════════════════════════════════════════════════════════

export async function recordPredictions(predictions: PredictionRecord[]): Promise<number> {
  try {
    const result = await db.prediction.createMany({
      data: predictions.map(p => ({
        source: p.source,
        ticker: p.ticker,
        company: p.company,
        sector: p.sector,
        signal: p.signal,
        confidence: p.confidence,
        predictedPrice: p.predictedPrice,
        targetPrice: p.targetPrice,
        stopLoss: p.stopLoss,
        timeframe: p.timeframe,
        reasoning: p.reasoning,
      })),
    });

    console.log(`[AI-LEARN] Batch recorded ${result.count} predictions`);
    return result.count;
  } catch (error) {
    console.error('[AI-LEARN] Error batch recording:', error);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. EVALUATE PREDICTIONS — Compare with actual prices
// ═══════════════════════════════════════════════════════════════

export async function evaluatePredictions(actualPrices: Record<string, number>): Promise<{
  evaluated: number;
  correct: number;
  lessonsExtracted: number;
}> {
  try {
    // Find unevaluated predictions
    const unevaluated = await db.prediction.findMany({
      where: {
        actualPrice: null,
        evaluatedAt: null,
        predictedPrice: { not: null },
        lessonExtracted: false,
      },
      orderBy: { predictedAt: 'asc' },
      take: 50, // Evaluate max 50 at a time
    });

    if (unevaluated.length === 0) {
      return { evaluated: 0, correct: 0, lessonsExtracted: 0 };
    }

    let evaluated = 0;
    let correct = 0;
    let lessonsExtracted = 0;

    for (const pred of unevaluated) {
      const actual = actualPrices[pred.ticker];
      if (!actual || !pred.predictedPrice) continue;

      // Calculate price change direction
      const predictedDirection = pred.signal === 'BUY' || pred.signal === 'BULLISH' ? 'up' :
                                  pred.signal === 'SELL' || pred.signal === 'BEARISH' ? 'down' : 'neutral';
      
      const actualChange = ((actual - pred.predictedPrice) / pred.predictedPrice) * 100;
      const actualDirection = actualChange > 1 ? 'up' : actualChange < -1 ? 'down' : 'neutral';

      // Check if prediction was correct
      const wasCorrect = predictedDirection === actualDirection ||
        (predictedDirection === 'up' && actualChange > 0) ||
        (predictedDirection === 'down' && actualChange < 0);

      // Calculate accuracy score (0-100)
      let accuracy = 50; // baseline
      if (wasCorrect) {
        accuracy = 50 + Math.min(Math.abs(actualChange), 50);
        correct++;
      } else {
        accuracy = Math.max(50 - Math.abs(actualChange), 0);
      }

      // Account for confidence calibration
      if (pred.confidence > 80 && !wasCorrect) {
        accuracy -= 15; // penalize overconfidence
      } else if (pred.confidence < 50 && wasCorrect) {
        accuracy += 10; // reward finding hidden opportunities
      }

      accuracy = Math.max(0, Math.min(100, accuracy));

      await db.prediction.update({
        where: { id: pred.id },
        data: {
          actualPrice: actual,
          evaluatedAt: new Date(),
          accuracy,
          wasCorrect,
        },
      });

      evaluated++;

      // Extract lesson if wrong and significant
      if (!wasCorrect && Math.abs(actualChange) > 2) {
        await extractLesson(pred, actual, actualChange);
        lessonsExtracted++;
      }
    }

    console.log(`[AI-LEARN] Evaluated ${evaluated} predictions: ${correct} correct, ${lessonsExtracted} lessons extracted`);
    return { evaluated, correct, lessonsExtracted };
  } catch (error) {
    console.error('[AI-LEARN] Error evaluating:', error);
    return { evaluated: 0, correct: 0, lessonsExtracted: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. EXTRACT LESSON — AI learns from specific mistakes
// ═══════════════════════════════════════════════════════════════

async function extractLesson(
  pred: { id: string; ticker: string; sector: string; signal: string; confidence: number; reasoning?: string | null; targetPrice?: number | null },
  actualPrice: number,
  actualChange: number
): Promise<void> {
  try {
    // Determine category of mistake
    const category = classifyMistake(pred, actualChange);

    // Generate lesson based on pattern
    const { mistake, lesson } = generateLesson(category, pred, actualChange, actualPrice);

    // Check if similar lesson already exists
    const existing = await db.aILesson.findFirst({
      where: {
        category,
        ticker: pred.ticker,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30 days
      },
    });

    if (existing) {
      // Update existing lesson instead of creating duplicate
      await db.aILesson.update({
        where: { id: existing.id },
        data: {
          severity: Math.min(existing.severity + 1, 5),
          lesson: `${existing.lesson}; ${lesson}`,
          updatedAt: new Date(),
        },
      });
    } else {
      await db.aILesson.create({
        data: {
          category,
          ticker: pred.ticker,
          sector: pred.sector,
          mistake,
          lesson,
          severity: Math.min(Math.ceil(Math.abs(actualChange) / 5), 5),
        },
      });
    }

    // Mark prediction as lesson extracted
    await db.prediction.update({
      where: { id: pred.id },
      data: { lessonExtracted: true },
    });
  } catch (error) {
    console.error('[AI-LEARN] Error extracting lesson:', error);
  }
}

function classifyMistake(pred: { signal: string; confidence: number }, actualChange: number): string {
  if (pred.confidence > 80 && actualChange < -3) return 'overconfidence';
  if (pred.signal === 'BULLISH' && actualChange < -5) return 'wrong_direction';
  if (pred.signal === 'BEARISH' && actualChange > 5) return 'wrong_direction';
  if (Math.abs(actualChange) > 8) return 'volatility';
  return 'timing';
}

function generateLesson(
  category: string,
  pred: { ticker: string; signal: string; confidence: number; reasoning?: string | null; targetPrice?: number | null },
  actualChange: number,
  actualPrice: number
): { mistake: string; lesson: string } {
  const mistakeTemplates: Record<string, string> = {
    overconfidence: `Parashikoi ${pred.signal} me konfidenc ${pred.confidence}% per ${pred.ticker}, por çmimi ndryshoi me ${actualChange.toFixed(1)}% ne drejtim te gabuar`,
    wrong_direction: `Drejtimi i gabuar: parashikoi ${pred.signal} per ${pred.ticker}, por çmimi shkoi ne drejtim te kundert me ${actualChange.toFixed(1)}%`,
    timing: `Momenti i gabuar: ${pred.signal} per ${pred.ticker} ishte i sakte ne drejtim por jo ne kohe (+/- ${Math.abs(actualChange).toFixed(1)}%)`,
    volatility: `Volatiliteti i papritur: ${pred.ticker} lëvizi me ${actualChange.toFixed(1)}%, shume me shume se pritej per ${pred.signal}`,
    sector_bias: `Bias sektorial: parashikim i favorizuar per sektorin e ${pred.ticker} pa marre parasysh faktoret makro`,
    macro_miss: `Humbje makro: ngjarjet e tregut global ndikuan ne ${pred.ticker} me ${actualChange.toFixed(1)}%`,
  };

  const lessonTemplates: Record<string, string> = {
    overconfidence: `Reduconi konfidencen per ${pred.ticker} kur nuk ka katalizator te qarte.confidence reale duhet te jete max 65-70% pa ngjarje specifike`,
    wrong_direction: `Verifikoni tendencen teknike per ${pred.ticker} perpara se te jepni sinjale. Shikoni SMA, RSI, dhe vëllimin. Mos u mbështetni vetëm ne sentimentin e përgjithshëm`,
    timing: `Per ${pred.ticker}, konsideroni timeframe me te gjate. Sinjali ishte i sakte ne drejtim por kohezgjatja gabuar. Prisni konfirmim tekniku`,
    volatility: `Per ${pred.ticker}, vendosni stop-loss me te ngushte dhe reduktojni pozicionin. Kjo aksion tregon volatilitet te larte te papritur`,
    sector_bias: `Mos perkrahni vetem nje sektor. Diversifikoni analizat dhe konsideroni kundershtytjet edhe per sektorin me te forte`,
    macro_miss: `Perpara se te beni parashikime per ${pred.ticker}, kontrolloni kalendarin ekonomik (Fed, CPI, NFP). Ngjarjet makro mund te anulojne faktoret teknike/fundamentale`,
  };

  return {
    mistake: mistakeTemplates[category] || mistakeTemplates.timing,
    lesson: lessonTemplates[category] || lessonTemplates.timing,
  };
}

// ═══════════════════════════════════════════════════════════════
// 5. BUILD LEARNING CONTEXT — Inject lessons into AI prompts
// ═══════════════════════════════════════════════════════════════

export async function buildLearningContext(): Promise<string> {
  // Use cache
  if (_lessonsCache && Date.now() - _lessonsCachedAt < LESSONS_CACHE_TTL) {
    return _lessonsCache;
  }

  try {
    const lessons = await db.aILesson.findMany({
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 15,
    });

    if (lessons.length === 0) {
      return '';
    }

    // Get recent stats
    const stats = await getStats();

    // Build context block
    const lessonTexts = lessons.map(l =>
      `[${l.category.toUpperCase()}] ${l.lesson} (severitet: ${l.severity}/5, aplikuar: ${l.timesApplied} here)`
    ).join('\n');

    const context = `
═══ MËSIME TË MËPARSHME (Lexo këto dhe shmang gabimet e njëjta) ═══
Statistikat e akuracisë: ${stats.avgAccuracy.toFixed(1)}% mesatare, ${stats.streakCorrect > 0 ? `${stats.streakCorrect} fitore rresht` : stats.streakWrong > 0 ? `${stats.streakWrong} humbje rresht` : 'fillim'}

Mësimet kryesore nga gabimet e mëparshme:
${lessonTexts}

RREGULLA PËR PËRMIRËSIM:
- Nëse konfidencë > 80%, sigurohu se ka faktor të fortë konkret (earnings, news)
- Gjithmonë verifiko trendin teknik (SMA, RSI) përpara se të jep sinjal
- Konsidero kalendarin makroekonomik (Fed, CPI, jobs)
- Bëji parashikime konservative kur nuk ke informacion të plotë
- Shmang overconfidence — prefëro accuracy mbi boldness
═══ FUND I MËSIMEVE ═══`;

    _lessonsCache = context;
    _lessonsCachedAt = Date.now();
    return context;
  } catch (error) {
    console.error('[AI-LEARN] Error building context:', error);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. GET STATS — Learning statistics
// ═══════════════════════════════════════════════════════════════

export async function getStats(): Promise<LearningStats> {
  try {
    const total = await db.prediction.count();
    const evaluated = await db.prediction.count({
      where: { evaluatedAt: { not: null } },
    });

    const correctCount = await db.prediction.count({
      where: { wasCorrect: true },
    });

    // Average accuracy
    const avgResult = await db.prediction.aggregate({
      where: { evaluatedAt: { not: null }, accuracy: { not: null } },
      _avg: { accuracy: true },
    });

    // Recent accuracy (last 20)
    const recentPreds = await db.prediction.findMany({
      where: { evaluatedAt: { not: null }, accuracy: { not: null } },
      orderBy: { evaluatedAt: 'desc' },
      take: 20,
      select: { accuracy: true, wasCorrect: true },
    });

    const recentAccuracy = recentPreds.length > 0
      ? recentPreds.reduce((sum, p) => sum + (p.accuracy || 0), 0) / recentPreds.length
      : 0;

    // Streak calculation
    const allEvaluated = await db.prediction.findMany({
      where: { evaluatedAt: { not: null }, wasCorrect: { not: null } },
      orderBy: { evaluatedAt: 'desc' },
      take: 30,
      select: { wasCorrect: true },
    });

    let streakCorrect = 0;
    let streakWrong = 0;
    for (const pred of allEvaluated) {
      if (pred.wasCorrect && streakWrong === 0) streakCorrect++;
      else if (!pred.wasCorrect && streakCorrect === 0) streakWrong++;
      else break;
    }

    // Sector performance
    const sectorPerf = await db.prediction.groupBy({
      by: ['sector'],
      where: { evaluatedAt: { not: null }, accuracy: { not: null } },
      _avg: { accuracy: true },
    });

    const bestSector = sectorPerf.length > 0
      ? sectorPerf.reduce((best, s) => (s._avg.accuracy ?? 0) > (best._avg.accuracy ?? 0) ? s : best).sector
      : null;

    const worstSector = sectorPerf.length > 0
      ? sectorPerf.reduce((worst, s) => (s._avg.accuracy ?? 0) < (worst._avg.accuracy ?? 0) ? s : worst).sector
      : null;

    // Improvement (compare first half vs second half)
    const allAccuracies = await db.prediction.findMany({
      where: { evaluatedAt: { not: null }, accuracy: { not: null } },
      orderBy: { evaluatedAt: 'asc' },
      select: { accuracy: true },
    });

    let improvement = 0;
    if (allAccuracies.length >= 10) {
      const mid = Math.floor(allAccuracies.length / 2);
      const firstHalf = allAccuracies.slice(0, mid).reduce((s, p) => s + (p.accuracy || 0), 0) / mid;
      const secondHalf = allAccuracies.slice(mid).reduce((s, p) => s + (p.accuracy || 0), 0) / (allAccuracies.length - mid);
      improvement = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
    }

    const lessonsCount = await db.aILesson.count();

    return {
      totalPredictions: total,
      evaluatedPredictions: evaluated,
      correctPredictions: correctCount,
      avgAccuracy: avgResult._avg.accuracy || 0,
      bestSector,
      worstSector,
      streakCorrect,
      streakWrong,
      lessonsLearned: lessonsCount,
      recentAccuracy,
      improvement,
    };
  } catch (error) {
    console.error('[AI-LEARN] Error getting stats:', error);
    return {
      totalPredictions: 0,
      evaluatedPredictions: 0,
      correctPredictions: 0,
      avgAccuracy: 0,
      bestSector: null,
      worstSector: null,
      streakCorrect: 0,
      streakWrong: 0,
      lessonsLearned: 0,
      recentAccuracy: 0,
      improvement: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. GET LESSONS — All learned lessons
// ═══════════════════════════════════════════════════════════════

export async function getLessons(limit = 20): Promise<Lesson[]> {
  try {
    const lessons = await db.aILesson.findMany({
      orderBy: [
        { severity: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: limit,
    });

    return lessons.map(l => ({
      id: l.id,
      category: l.category,
      ticker: l.ticker || undefined,
      sector: l.sector || undefined,
      mistake: l.mistake,
      lesson: l.lesson,
      severity: l.severity,
      timesApplied: l.timesApplied,
      createdAt: l.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('[AI-LEARN] Error getting lessons:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. AUTO-IMPROVE — Called periodically to evaluate and learn
// ═══════════════════════════════════════════════════════════════

export async function autoImprove(): Promise<{
  evaluated: number;
  correct: number;
  lessons: number;
}> {
  try {
    // Fetch actual prices for stocks with unevaluated predictions
    const unevaluatedTickers = await db.prediction.findMany({
      where: {
        actualPrice: null,
        predictedPrice: { not: null },
      },
      select: { ticker: true },
      distinct: ['ticker'],
      take: 20,
    });

    if (unevaluatedTickers.length === 0) {
      return { evaluated: 0, correct: 0, lessons: 0 };
    }

    // Fetch prices using Yahoo Finance
    const tickers = unevaluatedTickers.map(t => t.ticker);
    const prices: Record<string, number> = {};

    // Batch fetch (6 at a time)
    for (let i = 0; i < tickers.length; i += 6) {
      const batch = tickers.slice(i, i + 6).join(',');
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${batch}?range=1d&interval=1d`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          const result = data.chart?.result?.[0];
          if (result?.meta?.regularMarketPrice) {
            prices[result.meta.symbol] = result.meta.regularMarketPrice;
          }
        }
      } catch {
        // Skip failed batches
      }
    }

    const result = await evaluatePredictions(prices);
    return { evaluated: result.evaluated, correct: result.correct, lessons: result.lessonsExtracted };
  } catch (error) {
    console.error('[AI-LEARN] Auto-improve error:', error);
    return { evaluated: 0, correct: 0, lessons: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
// 9. INCREMENT LESSON APPLICATION COUNT
// ═══════════════════════════════════════════════════════════════

export async function markLessonApplied(lessonId: string): Promise<void> {
  try {
    await db.aILesson.update({
      where: { id: lessonId },
      data: { timesApplied: { increment: 1 } },
    });
    // Invalidate cache
    _lessonsCache = null;
    _lessonsCachedAt = 0;
  } catch (error) {
    console.error('[AI-LEARN] Error marking lesson applied:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// 10. RECORD FROM AI RESPONSE — Extract predictions from AI output
// ═══════════════════════════════════════════════════════════════

export async function recordFromAIResponse(
  source: string,
  predictions: Array<{
    ticker: string;
    company?: string;
    sector?: string;
    signal?: string;
    confidence?: number;
    currentPrice?: number;
    targetPrice?: number;
    reasoning?: string;
  }>
): Promise<number> {
  const records: PredictionRecord[] = predictions.map(p => ({
    ticker: p.ticker,
    company: p.company || p.ticker,
    sector: p.sector || 'Unknown',
    signal: p.signal || 'NEUTRAL',
    confidence: p.confidence || 50,
    predictedPrice: p.currentPrice,
    targetPrice: p.targetPrice,
    source,
    reasoning: p.reasoning,
  }));

  if (records.length === 0) return 0;
  if (records.length === 1) {
    const id = await recordPrediction(records[0]);
    return id ? 1 : 0;
  }
  return await recordPredictions(records);
}
