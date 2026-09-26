// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — backend Upstash Redis (REST)
//
// Pse: në Vercel (serverless) FS-i është i përkohshëm — çdo skanim
// do të niste nga zero. Upstash Redis ofron qëndrueshmëri përmes
// REST API (falas për këtë volum: ~2 komanda/skanim + lexime UI).
//
// Aktivizohet VETËM me env:
//   UPSTASH_REDIS_REST_URL   (p.sh. https://social-arb-xxxx.upstash.io)
//   UPSTASH_REDIS_REST_TOKEN
// Pa këto, store-i mbetet në skedar JSON (sandbox/lokal).
//
// Ky modul s'importon asgjë nga store.ts — i mban primitivat e pastër
// që store.ts t'i degëzojë (shmitet cikli i importimit).
// ═══════════════════════════════════════════════════════════════

export const STORE_KEY = 'social-arb:store';      // JSON i plotë i store-it
export const CSV_KEY = 'social-arb:csv';          // HASH: fusha=YYYY-MM, vlera=teksti CSV
export const LOCK_KEY = 'social-arb:scan-lock';   // lock ndër-procesesh për skanimin

export function upstashEnabled(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** Ekzekuton një komandë Redis përmes REST-it të Upstash. */
export async function redis<T = unknown>(cmd: string[]): Promise<T | null> {
  const base = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const j = (await res.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error(`Upstash: ${j.error}`);
  return (j.result ?? null) as T | null;
}

/** GET i një çelësi string (null nëse s'ekziston). */
export async function upstashGet(key: string): Promise<string | null> {
  return redis<string>(['GET', key]);
}

/** SET i një çelësi string. */
export async function upstashSet(key: string, value: string): Promise<void> {
  await redis(['SET', key, value]);
}

/** HGETALL → Map<fushë, vlera>. */
export async function upstashHashGetAll(key: string): Promise<Record<string, string>> {
  const raw = await redis<Record<string, string> | null>(['HGETALL', key]);
  // Upstash kthen objekt {fushë: vlera} për HGETALL
  return raw && typeof raw === 'object' ? raw : {};
}

/** HSET i një fushe brenda një hash-i. */
export async function upstashHashSet(key: string, field: string, value: string): Promise<void> {
  await redis(['HSET', key, field, value]);
}

/**
 * Lock ndër-procesesh me TTL: SET NX EX.
 * Kthen një funksion release, ose null nëse lock-i është i zënë.
 * Raste përdorimi: sandbox-i dhe Vercel-i të dy skanojnë në të njëjtën
 * kohë ndaj të njëjtit Redis — skanimet janë idempotente, por s'ka
//  nevojë të paguhet dy herë puna dhe GDELT-i të mbingarkohet me 429.
 */
export async function upstashLock(key: string, ttlSeconds: number): Promise<(() => Promise<void>) | null> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const got = await redis<string>(['SET', key, token, 'NX', 'EX', String(Math.max(1, Math.floor(ttlSeconds)))]);
  if (got !== 'OK') return null;
  return async () => {
    // Liron vetëm nëse është ende lock-i ynë (GET + DEL i thjeshtë — mjafton këtu,
    // garancia e fortë do të kërkonte skript Lua; TTL-i është rrjeti i sigurisë).
    const cur = await upstashGet(key);
    if (cur === token) await redis(['DEL', key]);
  };
}
