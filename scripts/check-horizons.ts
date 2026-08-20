import { db } from '../src/lib/db';

async function main() {
  const rows = await db.prediction.findMany({
    select: { horizonDays: true },
    distinct: ['horizonDays'],
    orderBy: { horizonDays: 'asc' },
  });
  console.log('Distinct horizons:', JSON.stringify(rows));

  // Also count per horizon
  const counts = await db.prediction.groupBy({
    by: ['horizonDays'],
    _count: true,
  });
  console.log('Counts per horizon:', JSON.stringify(counts));

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
