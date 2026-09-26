// ═══════════════════════════════════════════════════════════════
// SEED — migrim një herë e mirë i të dhënave lokale në Upstash Redis.
//
// Kopjon:
//   data/social-arb.json                      → social-arb:store
//   data/social-arb-backtest/social-arb-*.csv → HASH social-arb:csv (fusha=mujori)
//
// Përdorim (nga rrënja e projektit, me kredencialet e Upstash):
//   UPSTASH_REDIS_REST_URL=https://... UPSTASH_REDIS_REST_TOKEN=... \
//     bun scripts/seed-upstash.mjs
//
// Flamuri --force rivë shkruan edhe nëse çelësat ekzistojnë.
// I sigurt për t'u rikthyer: pa --force, s'prek asgjë ekzistuese.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

const force = process.argv.includes('--force');
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!URL_ || !TOKEN) {
  console.error('Duhen UPSTASH_REDIS_REST_URL dhe UPSTASH_REDIS_REST_TOKEN si env.');
  process.exit(1);
}

async function redis(cmd) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`Upstash: ${j.error}`);
  return j.result ?? null;
}

async function main() {
  // 1) store-i JSON
  const storeFile = path.join(process.cwd(), 'data', 'social-arb.json');
  if (!fs.existsSync(storeFile)) {
    console.error(`S'u gjet ${storeFile} — asgjë për të migruar.`);
    process.exit(1);
  }
  const existing = await redis(['GET', 'social-arb:store']);
  if (existing && !force) {
    console.log('social-arb:store ekziston tashmë — kapërce (ose përdor --force).');
  } else {
    const store = fs.readFileSync(storeFile, 'utf8');
    JSON.parse(store); // valido para se të shkruash
    await redis(['SET', 'social-arb:store', store]);
    const parsed = JSON.parse(store);
    console.log(`social-arb:store → ${Object.keys(parsed.candidates).length} kandidatë, ${parsed.measurements.length} matje ✅`);
  }

  // 2) arkivi CSV mujor
  const dir = path.join(process.cwd(), 'data', 'social-arb-backtest');
  if (!fs.existsSync(dir)) {
    console.log('Ska arkiv CSV për të migruar.');
    return;
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'));
  for (const f of files) {
    const month = f.replace('social-arb-', '').replace('.csv', '');
    const has = await redis(['HEXISTS', 'social-arb:csv', month]);
    if (has && !force) {
      console.log(`social-arb:csv [${month}] ekziston — kapërce.`);
      continue;
    }
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    await redis(['HSET', 'social-arb:csv', month, text]);
    const rows = text.split('\n').filter(l => l.trim() && !l.startsWith('observed_at')).length;
    console.log(`social-arb:csv [${month}] → ${rows} rreshta ✅`);
  }
  console.log('Migrimi përfundoi.');
}

main().catch(e => { console.error('Gabim:', e.message); process.exit(1); });
