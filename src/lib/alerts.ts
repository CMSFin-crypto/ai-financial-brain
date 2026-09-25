// ============================================================
// Telegram Alerts for the Kontrol panel
//
// Sends notifications when the model drifts into CRITICAL
// state, plus an optional daily digest after each evaluation
// cron run.
//
// Env vars (both optional — alerts stay disabled if missing):
//   TELEGRAM_BOT_TOKEN  — from @BotFather
//   TELEGRAM_CHAT_ID    — your chat id (from @userinfobot)
//   KONTROL_ALERT_DIGEST=daily  — enables the non-critical
//                                  daily summary message
// ============================================================

import { computeDriftReview, type DriftWarning } from './drift-review';

export function alertsConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramAlert(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function fmtPct(v: number | null | undefined): string {
  return v != null ? `${Math.round(v * 10) / 10}%` : '—';
}

/**
 * Computes the drift review and sends the appropriate alert.
 * NEVER throws — returns a status object for logging.
 */
export async function sendKontrolAlerts(): Promise<{ sent: boolean; level: 'none' | 'critical' | 'digest' | 'disabled'; detail: string }> {
  if (!alertsConfigured()) {
    return { sent: false, level: 'disabled', detail: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set' };
  }

  let review;
  try {
    review = await computeDriftReview();
  } catch {
    return { sent: false, level: 'none', detail: 'drift review failed' };
  }

  const criticals: DriftWarning[] = review.warnings.filter((w) => w.level === 'CRITICAL');
  const warnings: DriftWarning[] = review.warnings.filter((w) => w.level === 'WARNING');
  const acc = review.overall.overallAccuracy;
  const evaluated = review.overall.totalEvaluated;

  // ─── CRITICAL path: alert immediately ───────────────────
  if (criticals.length > 0 && evaluated > 0) {
    const lines: string[] = [
      '🔴 <b>KONTROL ALERT — DRIFT CRITICAL</b>',
      '',
      `Saktësia totale: <b>${fmtPct(acc)}</b> (${evaluated} vlerësime)`,
      `Brier: <b>${review.calibration.brierScore != null ? review.calibration.brierScore.toFixed(3) : '—'}</b>`,
      '',
    ];
    for (const c of criticals.slice(0, 5)) {
      lines.push(`• [${c.category}] ${c.message}`);
    }
    if (warnings.length > 0) {
      lines.push('', `<i>+ ${warnings.length} WARNING të tjera</i>`);
    }
    lines.push('', '🔗 Hape /drift-review për detaje');
    const sent = await sendTelegramAlert(lines.join('\n'));
    return { sent, level: 'critical', detail: `${criticals.length} critical warnings` };
  }

  // ─── Digest path: optional daily summary ────────────────
  if (process.env.KONTROL_ALERT_DIGEST === 'daily' && evaluated > 0) {
    const horizons = review.horizons
      .map((h) => `${h.horizonDays}D: <b>${fmtPct(h.accuracy)}</b> (${h.trend})`)
      .join(' · ');
    const lines: string[] = [
      '📊 <b>KONTROL — Përmbledhje ditore</b>',
      '',
      `Saktësia: <b>${fmtPct(acc)}</b> · Brier: ${review.calibration.brierScore != null ? review.calibration.brierScore.toFixed(3) : '—'}`,
      horizons ? `Afatet: ${horizons}` : '',
      warnings.length > 0 ? `⚠️ ${warnings.length} WARNING aktive` : '✅ Pa WARNING aktive',
      `Në pritje vlerësimi: ${review.overall.totalPending}`,
      '',
      '🔗 /drift-review · /model-metrics · /edge-leaderboard',
    ];
    const sent = await sendTelegramAlert(lines.filter(Boolean).join('\n'));
    return { sent, level: 'digest', detail: `accuracy ${fmtPct(acc)}` };
  }

  return { sent: false, level: 'none', detail: 'nothing to alert' };
}
