// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — skaneri periodik lokal
//
// Procesi periodik që kërkon përdoruesi: merr termat trending,
// i klasifikon, i ruan matjet dhe përditëson kandidatët.
// Rri i ndezur në prapavijë dhe godet /api/social-arb/scan çdo 2 orë
// (GDELT kërkon distancë 6s mes kërkesave — motori e menaxhon vetë).
//
// Nisja:  nohup node scripts/social-arb-cron.mjs > /dev/null 2>&1 &
// Ndalja: pkill -f social-arb-cron.mjs
// ═══════════════════════════════════════════════════════════════

const BASE = process.env.SOCIAL_ARB_BASE_URL || 'http://localhost:3000';
const INTERVAL_MS = 2 * 60 * 60 * 1000; // çdo 2 orë

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/social-arb/scan`, { method: 'POST' });
    const j = await res.json();
    if (j.ok) {
      console.log(
        `[${new Date().toISOString()}] ok — ${j.termsScanned} termе, ${j.termsClassified} marka, ` +
        `${j.activeCount} aktivë, +${j.archived} rreshta CSV (${((Date.now() - started) / 1000).toFixed(0)}s)`,
      );
      if (j.promoted?.length) console.log(`  ngjitur në RESEARCH: ${j.promoted.join(', ')}`);
      if (j.removed?.length) console.log(`  hequr: ${j.removed.join(', ')}`);
    } else {
      console.error(`[${new Date().toISOString()}] dështoi:`, j.error);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] gabim rrjeti:`, e.message);
  }
}

console.log(`Social Arb cron: çdo ${INTERVAL_MS / 3600000} orë → ${BASE}/api/social-arb/scan`);
tick();
setInterval(tick, INTERVAL_MS);
