import { db } from '../src/lib/db';

const TEST_STOCKS = [
  { symbol: 'NVDA', sector: 'TECHNOLOGY', company: 'NVIDIA Corp' },
  { symbol: 'AAPL', sector: 'TECHNOLOGY', company: 'Apple Inc' },
  { symbol: 'MSFT', sector: 'TECHNOLOGY', company: 'Microsoft Corp' },
  { symbol: 'AMZN', sector: 'CONSUMER CYCLICAL', company: 'Amazon.com Inc' },
  { symbol: 'TSLA', sector: 'CONSUMER CYCLICAL', company: 'Tesla Inc' },
  { symbol: 'META', sector: 'COMMUNICATION SERVICES', company: 'Meta Platforms' },
  { symbol: 'GOOGL', sector: 'COMMUNICATION SERVICES', company: 'Alphabet Inc' },
  { symbol: 'AMD', sector: 'TECHNOLOGY', company: 'Advanced Micro Devices' },
  { symbol: 'JPM', sector: 'FINANCIALS', company: 'JPMorgan Chase' },
  { symbol: 'V', sector: 'FINANCIALS', company: 'Visa Inc' },
  { symbol: 'UNH', sector: 'HEALTHCARE', company: 'UnitedHealth Group' },
  { symbol: 'XOM', sector: 'ENERGY', company: 'Exxon Mobil' },
];

const HORIZONS = [1, 5, 20];

async function main() {
  // Clean existing
  console.log('Cleaning old test predictions...');
  await db.predictionFactor.deleteMany({ where: { prediction: { modelVersion: 'test-seed' } } });
  await db.prediction.deleteMany({ where: { modelVersion: 'test-seed' } });

  let created = 0;

  for (const stock of TEST_STOCKS) {
    for (const h of HORIZONS) {
      const rawScore = 30 + Math.random() * 55; // 30-85
      const confidence = 0.58 + Math.random() * 0.35; // 0.58-0.93
      const decision = rawScore >= 50 ? 'BUY' : (rawScore >= 35 ? 'HOLD' : 'NO_TRADE');

      const pred = await db.prediction.create({
        data: {
          symbol: stock.symbol,
          sector: stock.sector,
          horizonDays: h,
          modelVersion: 'test-seed',
          entryPrice: 100 + Math.random() * 400,
          rawScore,
          calibratedConfidence: confidence,
          finalDecision: decision,
          evaluationStatus: 'PENDING',
          regime: ['BULL_LOW_VOL', 'RANGE_NEUTRAL', 'RELIEF_RALLY'][Math.floor(Math.random() * 3)],
          regimeConfidence: 0.5 + Math.random() * 0.4,
          transitionRisk: Math.random() * 0.5,
          dueAt: new Date(Date.now() + h * 24 * 60 * 60 * 1000),
          factors: {
            create: [
              { factorName: 'rsi', factorType: 'technical', score: 0.4 + Math.random() * 0.5, weight: 0.2, signal: rawScore > 50 ? 'BULLISH' : 'NEUTRAL', description: 'RSI showing bullish momentum' },
              { factorName: 'macdHistogram', factorType: 'technical', score: 0.3 + Math.random() * 0.6, weight: 0.15, signal: rawScore > 50 ? 'BULLISH' : 'NEUTRAL', description: 'MACD histogram positive and rising' },
              { factorName: 'sectorMomentum', factorType: 'fundamental', score: 0.5 + Math.random() * 0.4, weight: 0.15, signal: rawScore > 50 ? 'BULLISH' : 'NEUTRAL', description: 'Sector showing strong momentum' },
            ],
          },
        },
      });
      created++;
      console.log(`  ${stock.symbol} ${h}D → ${decision} (score: ${rawScore.toFixed(0)}, conf: ${(confidence * 100).toFixed(0)}%)`);
    }
  }

  console.log(`\nDone! Created ${created} predictions.`);
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
