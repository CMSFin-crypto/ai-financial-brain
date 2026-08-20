import { db } from '../src/lib/db';

const HORIZON_REMAP: Record<number, number> = { 1: 1, 3: 3, 5: 3, 7: 7, 20: 7 };

async function main() {
  const preds = await db.prediction.findMany({
    where: {
      finalDecision: 'BUY',
      evaluationStatus: 'PENDING',
      rawScore: { gte: 25 },
      calibratedConfidence: { gte: 0.58 },
      transitionRisk: { lte: 0.65 },
    },
    orderBy: { rawScore: 'desc' },
  });
  console.log('BUY predictions passing filters:', preds.length);
  for (const p of preds.slice(0, 15)) {
    const displayH = HORIZON_REMAP[p.horizonDays] ?? p.horizonDays;
    console.log(`  ${p.symbol} → DB:${p.horizonDays}D display:${displayH}D | score:${p.rawScore.toFixed(0)} conf:${(p.calibratedConfidence*100).toFixed(0)}% regime:${p.regime}`);
  }
  await db.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
