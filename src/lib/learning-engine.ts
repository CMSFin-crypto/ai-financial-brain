// ============================================================
// Learning Engine — Feedback Loop (DB-backed)
// Delegates to evaluation-engine for DB operations
// ============================================================

import { evaluateDuePredictions } from './evaluation-engine';
import { seedDefaultWeights } from './model-weights';
import prisma from './prisma';

/**
 * Check due predictions and update outcomes.
 * This is the main entry point called by API routes and cron.
 */
export async function checkPredictionOutcomes() {
  // Ensure weights are seeded
  await seedDefaultWeights().catch(() => {});

  return evaluateDuePredictions();
}

/**
 * Get overall AI stats from DB.
 */
export async function getLearningStats() {
  try {
    let stats = await prisma.aIStats.findFirst();
    if (!stats) {
      stats = await prisma.aIStats.create({ data: {} });
    }

    const totalPreds = await prisma.prediction.count();
    const evaluatedPreds = await prisma.prediction.count({
      where: { wasCorrect: { not: null } },
    });
    const pendingPreds = await prisma.prediction.count({
      where: { wasCorrect: null },
    });

    return {
      totalPredictions: totalPreds,
      evaluatedPredictions: evaluatedPreds,
      pendingPreds,
      correctPredictions: stats.correctPredictions,
      avgAccuracy: stats.avgAccuracy,
      accuracy1d: stats.accuracy1d,
      accuracy5d: stats.accuracy5d,
      accuracy20d: stats.accuracy20d,
      streakCorrect: stats.streakCorrect,
      streakWrong: stats.streakWrong,
      lessonsLearned: await prisma.aILesson.count(),
    };
  } catch (err) {
    console.error('[LEARNING] getLearningStats failed:', err);
    return {
      totalPredictions: 0,
      evaluatedPredictions: 0,
      pendingPreds: 0,
      correctPredictions: 0,
      avgAccuracy: 0,
      accuracy1d: 0,
      accuracy5d: 0,
      accuracy20d: 0,
      streakCorrect: 0,
      streakWrong: 0,
      lessonsLearned: 0,
    };
  }
}

/**
 * Get recent lessons from DB.
 */
export async function getRecentLessons(limit: number = 20) {
  try {
    return await prisma.aILesson.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (err) {
    console.error('[LEARNING] getRecentLessons failed:', err);
    return [];
  }
}

/**
 * Get recent predictions with evaluation status.
 */
export async function getRecentPredictions(limit: number = 30) {
  try {
    return await prisma.prediction.findMany({
      orderBy: { predictedAt: 'desc' },
      take: limit,
      select: {
        symbol: true, finalDecision: true, calibratedConfidence: true,
        rawScore: true, horizonDays: true,
        entryPrice: true, actualPrice: true, actualReturn: true,
        benchmarkReturn: true, excessReturn: true, wasCorrect: true,
        evaluationStatus: true, regime: true, regimeConfidence: true,
        predictedAt: true, dueAt: true, evaluatedAt: true,
      },
    });
  } catch (err) {
    console.error('[LEARNING] getRecentPredictions failed:', err);
    return [];
  }
}
