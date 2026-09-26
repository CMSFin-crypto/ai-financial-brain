// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — planifikuesi i brendshëm i serverit
//
// Zëvendëson scripts/social-arb-cron.mjs: sandbox-i mbyt çdo proces
// të jashtëm pas përfundimit të komandës, kështu që cikli 2-orësh
// duhet të jetojë BRENDA procesit të serverit (i whitelisted përmes
// .zscripts/dev.pid). Armohet një herë për proces, nga
// src/instrumentation.ts në nisjen e serverit.
//
// Godet API-në e vet (loopback) në vend që ta importojë motorin
// direkt: Next.js ia ndan module-state ndërmjet instrumentimit dhe
// rrugëve API — kështu flamuri «scanning» mbetet i përbashkët me
// butonin «Skano tani» dhe shmohen skanime të dyfishta.
//
// Në Vercel nuk armohet (process.env.VERCEL) — aty skanimet i nis
// cron-i i vercel.json përmes GET /api/social-arb/scan.
// ═══════════════════════════════════════════════════════════════

const INTERVAL_MS = 2 * 60 * 60 * 1000; // çdo 2 orë
const FIRST_TICK_DELAY_MS = 60 * 1000; // lër serverin të ngrohet 60s

declare global {
  // eslint-disable-next-line no-var
  var __socialArbSchedulerArmed: boolean | undefined;
}

async function tick(): Promise<void> {
  const base = process.env.SOCIAL_ARB_BASE_URL || 'http://localhost:3000';
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers['authorization'] = `Bearer ${process.env.CRON_SECRET}`;
  try {
    const res = await fetch(`${base}/api/social-arb/scan`, { method: 'POST', headers });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      console.log('[social-arb scheduler] një skanim po ekzekutohet tashmë — e kapërcej');
      return;
    }
    if (!res.ok) {
      console.error(`[social-arb scheduler] API ${res.status}:`, JSON.stringify(body));
      return;
    }
    console.log(
      `[social-arb scheduler] ${new Date().toISOString()} →`,
      JSON.stringify(body),
    );
  } catch (e) {
    console.error('[social-arb scheduler] gabim rrjeti:', (e as Error).message);
  }
}

export function armScheduledScan(): void {
  // Në Vercel skanimet i orkestron cron-i i platformës (vercel.json).
  if (process.env.VERCEL) return;

  // Singleton për proces: instrumentation mund të thirret dy herë në dev.
  if (globalThis.__socialArbSchedulerArmed) return;
  globalThis.__socialArbSchedulerArmed = true;

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), INTERVAL_MS);
  }, FIRST_TICK_DELAY_MS);

  console.log('[social-arb scheduler] i armuar — skanim i parë pas 60s, pastaj çdo 2 orë');
}
