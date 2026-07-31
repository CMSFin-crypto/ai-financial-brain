// ============================================================
// Ranking Adjustments — penalties for freshness, novelty, and
// sector concentration. Applied during top-picks selection
// to ensure diverse, non-stale picks.
// ============================================================

// ─── Freshness Penalty ────────────────────────────────────────
// If quote data is stale (>5 min), penalize. Vercel serverless
// can have cold starts that make data old.

export function freshnessPenalty(ageSec: number): number {
  if (ageSec > 300) return 30;   // > 5 min: heavy penalty
  if (ageSec > 180) return 18;   // > 3 min
  if (ageSec > 90)  return 8;    // > 1.5 min
  return 0;
}

// ─── Novelty Penalty ──────────────────────────────────────────
// If the same symbol appeared in recent picks, penalize.
// Prevents "stuck" lists showing the same names every scan.

export function noveltyPenalty(repeatCount: number): number {
  if (repeatCount >= 3) return 35;
  if (repeatCount === 2) return 22;
  if (repeatCount === 1) return 12;
  return 0;
}

// ─── Concentration Penalty ─────────────────────────────────────
// Limits how many picks can come from the same sector.
// Returns 999 (effectively blocks) when cap is reached.

export function concentrationPenalty(
  sectorCountAlreadySelected: number,
  sectorCap = 2,
): number {
  if (sectorCountAlreadySelected >= sectorCap) return 999;  // hard block
  if (sectorCountAlreadySelected === sectorCap - 1) return 6; // soft penalty
  return 0;
}
