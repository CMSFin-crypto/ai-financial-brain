// Diagnostikë e mbulimit të të dhënave fundamentale point-in-time
// Ekzekuto: npx tsx scripts/diag-fund-coverage.ts
import { buildFundamentalTimelines, fundamentalContextAsOf, evaluateFundamentalFilter } from '../src/lib/fundamentals/backtest-integration';

const SYMBOLS = process.argv[2] ? process.argv[2].split(',') : ['AAPL', 'MSFT', 'NVDA', 'XOM', 'COST', 'IQV'];
const DATES = ['2020-06-15', '2022-06-15', '2024-06-17', '2025-06-16', '2026-06-15'];

async function main() {
  console.log(`Fetch EDGAR companyfacts për: ${SYMBOLS.join(', ')}\n`);
  const { timelines, symbolsWithData } = await buildFundamentalTimelines(SYMBOLS, { deadlineMs: 90_000 });
  console.log(`Me timeline: ${symbolsWithData}/${SYMBOLS.length}\n`);

  for (const sym of SYMBOLS) {
    const tl = timelines[sym];
    if (!tl) { console.log(`${sym}: PA timeline (N/A)`); continue; }
    console.log(`${sym}: ${tl.length} snapshot-e, i pari i përdorshëm nga ${tl[0].usableFrom}`);
    for (const date of DATES) {
      const ctx = fundamentalContextAsOf(tl, date);
      if (!ctx) { console.log(`  ${date}: pa kontekst`); continue; }
      const std = evaluateFundamentalFilter(ctx, 'standard');
      const str = evaluateFundamentalFilter(ctx, 'strict');
      const p = (v?: number, pct = true) => v === undefined ? 'N/A' : pct ? (v * 100).toFixed(1) + '%' : v.toFixed(1);
      console.log(`  ${date}: rev ${p(ctx.revenueGrowth)} · eps ${p(ctx.epsGrowth)} · FCF ${ctx.freeCashFlow === undefined ? 'N/A' : (ctx.freeCashFlow / 1e9).toFixed(1) + 'B'} · D/E ${ctx.debtToEquity === undefined ? 'N/A' : ctx.debtToEquity.toFixed(0) + '%'} → std:${std.pass ? 'PASS' : 'FAIL(' + std.reason + ')'} strict:${str.pass ? 'PASS' : 'FAIL(' + str.reason + ')'}`);
    }
    console.log('');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
