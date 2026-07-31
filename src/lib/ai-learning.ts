// ═══════════════════════════════════════════════════════════════
// AI LEARNING ENGINE — Legacy compatibility layer
// Delegates to new modules: evaluation-engine, learning-engine, model-weights
// ═══════════════════════════════════════════════════════════════

import prisma from './prisma';

// ─── Types ───────────────────────────────────────────────────
export interface PredictionRecord {
  ticker: string;
  company: string;
  sector: string;
  signal: string;
  confidence: number;
  predictedPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  timeframe?: string;
  reasoning?: string;
  source: string;
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
  recentAccuracy: number;
  improvement: number;
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
const LESSONS_CACHE_TTL = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════
// 1. RECORD PREDICTION — Save every AI prediction (new schema)
// ═══════════════════════════════════════════════════════════════

export async function recordPrediction(data: PredictionRecord): Promise<string> {
  try {
    const horizonDays = data.timeframe === 'short' ? 1 : data.timeframe === 'medium' ? 5 : 20;
    const predictedDir = data.signal === 'BUY' || data.signal === 'BULLISH' ? 'UP' :
                         data.signal === 'SELL' || data.signal === 'BEARISH' ? 'DOWN' : 'SIDEWAYS';

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + horizonDays);

    const prediction = await prisma.prediction.create({
      data: {
        symbol: data.ticker,
        sector: data.sector,
        rawScore: data.signal === 'BUY' || data.signal === 'BULLISH' ? 50 : data.signal === 'SELL' || data.signal === 'BEARISH' ? -50 : 0,
        calibratedConfidence: data.confidence,
        finalDecision: data.signal === 'BUY' || data.signal === 'BULLISH' ? 'BUY' : data.signal === 'SELL' || data.signal === 'BEARISH' ? 'SELL' : 'HOLD',
        horizonDays,
        entryPrice: data.predictedPrice || 0,
        dueAt,
        modelVersion: 'ai-learning',
      },
    });

    console.log(`[AI-LEARN] Prediction recorded: ${data.ticker} ${data.signal} (confidence: ${data.confidence}%)`);
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
  let count = 0;
  for (const p of predictions) {
    const id = await recordPrediction(p);
    if (id) count++;
  }
  console.log(`[AI-LEARN] Batch recorded ${count}/${predictions.length} predictions`);
  return count;
}

// ═══════════════════════════════════════════════════════════════
// 3. EVALUATE PREDICTIONS — Now delegates to evaluation-engine
// ═══════════════════════════════════════════════════════════════

export async function evaluatePredictions(_actualPrices: Record<string, number>): Promise<{
  evaluated: number;
  correct: number;
  lessonsExtracted: number;
}> {
  // Delegate to the new evaluation engine
  const { evaluateDuePredictions } = await import('./evaluation-engine');
  const result = await evaluateDuePredictions();
  return {
    evaluated: result.evaluated,
    correct: result.correct,
    lessonsExtracted: result.details.filter(d => !d.wasCorrect).length,
  };
}

// ═══════════════════════════════════════════════════════════════
// 4. BUILD LEARNING CONTEXT — Inject lessons into AI prompts
// ═══════════════════════════════════════════════════════════════

export async function buildLearningContext(): Promise<string> {
  if (_lessonsCache && Date.now() - _lessonsCachedAt < LESSONS_CACHE_TTL) {
    return _lessonsCache;
  }

  try {
    const lessons = await prisma.aILesson.findMany({
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 15,
    });

    if (lessons.length === 0) return '';

    const stats = await getStats();

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
// 5. GET STATS — Learning statistics (new schema compatible)
// ═══════════════════════════════════════════════════════════════

export async function getStats(): Promise<LearningStats> {
  try {
    const total = await prisma.prediction.count();
    const evaluated = await prisma.prediction.count({
      where: { wasCorrect: { not: null } },
    });
    const correctCount = await prisma.prediction.count({
      where: { wasCorrect: true },
    });

    const avgAccuracy = evaluated > 0 ? (correctCount / evaluated) * 100 : 0;

    // Streak
    const recent = await prisma.prediction.findMany({
      where: { wasCorrect: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { wasCorrect: true },
    });

    let streakCorrect = 0;
    let streakWrong = 0;
    for (const pred of recent) {
      if (pred.wasCorrect && streakWrong === 0) streakCorrect++;
      else if (!pred.wasCorrect && streakCorrect === 0) streakWrong++;
      else break;
    }

    const recent20 = recent.slice(0, 20);
    const recentAccuracy = recent20.length > 0
      ? (recent20.filter(p => p.wasCorrect).length / recent20.length) * 100
      : 0;

    const lessonsCount = await prisma.aILesson.count();

    return {
      totalPredictions: total,
      evaluatedPredictions: evaluated,
      correctPredictions: correctCount,
      avgAccuracy,
      bestSector: null,
      worstSector: null,
      streakCorrect,
      streakWrong,
      lessonsLearned: lessonsCount,
      recentAccuracy,
      improvement: 0,
    };
  } catch (error) {
    console.error('[AI-LEARN] Error getting stats:', error);
    return {
      totalPredictions: 0, evaluatedPredictions: 0, correctPredictions: 0,
      avgAccuracy: 0, bestSector: null, worstSector: null,
      streakCorrect: 0, streakWrong: 0, lessonsLearned: 0,
      recentAccuracy: 0, improvement: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. GET LESSONS — All learned lessons
// ═══════════════════════════════════════════════════════════════

export async function getLessons(limit = 20): Promise<Lesson[]> {
  try {
    const lessons = await prisma.aILesson.findMany({
      orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
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
// 7. AUTO-IMPROVE — Called periodically to evaluate and learn
// ═══════════════════════════════════════════════════════════════

export async function autoImprove(): Promise<{
  evaluated: number;
  correct: number;
  lessons: number;
}> {
  const result = await evaluatePredictions({});
  return { evaluated: result.evaluated, correct: result.correct, lessons: result.lessonsExtracted };
}

// ═══════════════════════════════════════════════════════════════
// 8. MARK LESSON APPLIED
// ═══════════════════════════════════════════════════════════════

export async function markLessonApplied(lessonId: string): Promise<void> {
  try {
    await prisma.aILesson.update({
      where: { id: lessonId },
      data: { timesApplied: { increment: 1 } },
    });
    _lessonsCache = null;
    _lessonsCachedAt = 0;
  } catch (error) {
    console.error('[AI-LEARN] Error marking lesson applied:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// 9. RECORD FROM AI RESPONSE — Extract predictions from AI output
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
