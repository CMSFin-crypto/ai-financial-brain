// Next.js instrumentation — register() ekzekutohet një herë në nisjen e serverit.
// Arm planifikuesin e Social Arb brenda procesit të serverit:
// cikli periodik 2-orësh duhet të jetojë në procesin e whitelisted-uar
// nga platforma (.zscripts/dev.pid), jo si skript i jashtëm.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { armScheduledScan } = await import('@/lib/social-arb/scheduler');
    armScheduledScan();
  }
}
