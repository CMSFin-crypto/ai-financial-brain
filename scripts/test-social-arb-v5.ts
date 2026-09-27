// Test i pavarur i fix-eve Social Arb v5:
//   1) Lock-i Upstash: acquire → release → acquire përsëri (rregresioni i
//      `void release()` që linte lock-un deri me TTL 900s në Vercel)
//   2) Skadimi i TTL-së (rrjeta e sigurisë)
//   3) Rregulla burimi: runScan DUHET ta presë release-in; TTL duhet 120s
//   4) Rendi i hapave në doScan: çmimet PARA GDELT-t (anti-livelock)
// Ekzekutim: bun scripts/test-social-arb-v5.ts
//
// Mock-i i Upstash REST-it zbaton nënskedarin e vërtetë të protokollit që
// përdor src/lib/social-arb/upstash.ts: POST me trup = ["SET",k,v,"NX","EX",t] /
// ["GET",k] / ["DEL",k] → { result: ... }.

import http from 'node:http';
import { acquireScanLock } from '../src/lib/social-arb/store';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── mock Upstash REST ────────────────────────────────────────────
type Entry = { value: string; expiresAt: number | null };
const store = new Map<string, Entry>();

function handleCommand(cmd: string[]): unknown {
  const now = Date.now();
  const op = cmd[0]?.toUpperCase();
  if (op === 'SET') {
    const [_, key, value, nx, ex, ttl] = cmd;
    const cur = store.get(key);
    const live = cur && (cur.expiresAt === null || cur.expiresAt > now);
    if ((nx ?? '').toUpperCase() === 'NX' && live) return null; // i zënë
    const ttlS = (ex ?? '').toUpperCase() === 'EX' ? Number(ttl) : null;
    store.set(key, { value, expiresAt: ttlS && Number.isFinite(ttlS) ? now + ttlS * 1000 : null });
    return 'OK';
  }
  if (op === 'GET') {
    const cur = store.get(cmd[1]);
    if (!cur) return null;
    if (cur.expiresAt !== null && cur.expiresAt <= now) { store.delete(cmd[1]); return null; }
    return cur.value;
  }
  if (op === 'DEL') {
    const had = store.delete(cmd[1]);
    return had ? 1 : 0;
  }
  throw new Error(`Mock: komanda e pazakontë ${op}`);
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c: Buffer) => { body += c.toString(); });
  req.on('end', () => {
    try {
      const cmd = JSON.parse(body) as string[];
      const result = handleCommand(cmd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  });
});

async function main() {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}/`;
  process.env.UPSTASH_REDIS_REST_URL = url;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';

  console.log('\n── 1) acquire → release → acquire përsëri (rregresioni i lock-it të ndenjur) ──');
  {
    const r1 = await acquireScanLock(120);
    check('acquire i parë fiton lock-un', r1 !== null);
    check('lock-i në mock u ruajt', store.get('social-arb:scan-lock') !== undefined);

    const r2 = await acquireScanLock(120);
    check('acquire i dytë ndërkohë REFUZOHET (409 si në prodhim)', r2 === null);

    await r1!(); // release — dikur `void release()`, tani pritet në runScan
    await sleep(50);
    check('release FSHI key-n në Redis (GET → null)', store.get('social-arb:scan-lock') === undefined);

    const r3 = await acquireScanLock(120);
    check('acquire pas release-it SUKSES — s\u2019ka më pritje 15 min', r3 !== null);
    await r3!();
  }

  console.log('\n── 2) TTL si rrjetë e sigurisë (skadim automatik) ──');
  {
    const r1 = await acquireScanLock(1); // 1s
    check('acquire me TTL 1s fiton', r1 !== null);
    const r2 = await acquireScanLock(1);
    check('acquire i dytë ndërkohë refuzohet', r2 === null);
    await sleep(1100); // pa e liruar — simulojmë funksion të ngrirë në Vercel
    const r3 = await acquireScanLock(1);
    check('pas skadimit të TTL-së lock-i HAPET vetë (max 120s bllokim)', r3 !== null);
    await r3!();
  }

  console.log('\n── 3) rregulla burimi — rregresion i fiksuaritymarrë nga prodhimi ──');
  {
    const engineSrc = readFileSync(join(import.meta.dir, '../src/lib/social-arb/engine.ts'), 'utf8');
    const storeSrc = readFileSync(join(import.meta.dir, '../src/lib/social-arb/store.ts'), 'utf8');
    check('runScan NUK përmban më deklaratën `void release();`', !engineSrc.includes('void release();'));
    check('runScan e PRIT release-in (Promise.race me hije 5s)', engineSrc.includes('await Promise.race([release()'));
    check('runScan përdor TTL 120s', engineSrc.includes('acquireScanLock(120)'));
    check('store.ts default TTL = 120s', storeSrc.includes('ttlSeconds = 120'));
  }

  console.log('\n── 4) rendi i hapave — çmimet PARA GDELT-t (anti-livelock) ──');
  {
    const engineSrc = readFileSync(join(import.meta.dir, '../src/lib/social-arb/engine.ts'), 'utf8');
    const priceIdx = engineSrc.indexOf('let spySeries');
    const gdeltIdx = engineSrc.indexOf('const gdeltBudget');
    check('blloku i çmimeve shfaqet PARA bllokut GDELT në doScan', priceIdx > -1 && gdeltIdx > -1 && priceIdx < gdeltIdx);
    check('mesazhi i buxhetit flet vetëm për GDELT (çmimet s\u2019kapërcohen më)', engineSrc.includes('disa pyetje GDELT u kapërcyen'));
    const oldMsg = engineSrc.includes('GDELT/çmime u kapërcyen');
    check('mesazhi i vjetër «GDELT/çmime» u hoq', !oldMsg);
  }

  server.close();
  console.log(`\n═══ REZULTATI: ${pass} kaluan · ${fail} dështuan ═══`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Testi dështoi:', e); process.exit(1); });
