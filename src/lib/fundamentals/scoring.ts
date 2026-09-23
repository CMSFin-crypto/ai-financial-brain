// ============================================================
// TASK 26 — SCORING I FUNDAMENTEVE
// ============================================================
// Statuset për çdo tregues (strong / neutral / weak / unknown),
// etiketat e seksioneve (Growth: Positive, Profitability: Strong,
// Valuation: Expensive, Risk: Medium, ...) dhe etiketa e përgjithshme
// e Fundamental Context (Positive / Neutral / Negative).
//
// ⚠️ FAZA 1: këto etiketa janë VETËM informuese — nuk hyjnë në
// Technical Score, READY, BUY ose WATCH. Testi rigoroz
// (Technical-only vs Technical + Fundamental) vendos pas.
// ============================================================

import type { FundamentalMetric, FundamentalSection, MetricStatus, SectionKey } from './normalize';

// ─── Pragjet për çdo tregues ───
// [strongMin, weakMax]: vlera ≥ strongMin → strong; ≤ weakMax → weak;
// mes tyre → neutral. Për treguesit "inverted" (borxhi, çmimi i
// vlerësimit) pragu strongMin është kufiri i POSHTËM i mirë.
interface Threshold { strongMin: number; weakMax: number; inverted: boolean }

const THRESHOLDS: Record<string, Threshold> = {
  // Growth (në përqind — vlera vjen si decimal 0.184 = 18.4% → ×100)
  revenueGrowth:     { strongMin: 15, weakMax: 0, inverted: false },
  epsGrowth:         { strongMin: 20, weakMax: 0, inverted: false },
  // Profitability (përqindje)
  grossMargin:       { strongMin: 50, weakMax: 30, inverted: false },
  operatingMargin:   { strongMin: 25, weakMax: 12, inverted: false },
  netMargin:         { strongMin: 18, weakMax: 8,  inverted: false },
  returnOnEquity:    { strongMin: 20, weakMax: 10, inverted: false },
  // Cash flow (FCF margin %; negativ = weak)
  fcfMargin:         { strongMin: 10, weakMax: 0,  inverted: false },
  // Bilanci (inverted: më i ulët = më mirë)
  debtToEquity:      { strongMin: 60, weakMax: 150, inverted: true },
  // Valuation (inverted: më i lirë = më mirë)
  peRatio:           { strongMin: 18, weakMax: 30, inverted: true },
  psRatio:           { strongMin: 3,  weakMax: 8,  inverted: true },
  evToEbitda:        { strongMin: 14, weakMax: 25, inverted: true },
  pegRatio:          { strongMin: 1.2, weakMax: 2.5, inverted: true },
  // Earnings & estimates
  earningsSurprise:  { strongMin: 3, weakMax: -3, inverted: false },  // përqindje
  estimateRevision:  { strongMin: 1, weakMax: -1, inverted: false },  // % — ndryshimi i estimate-it CY brenda 30 ditësh
  // Ownership
  institutionalOwnership: { strongMin: 60, weakMax: 30, inverted: false }, // përqindje
};

/** Për treguesit që vijnë si decimal (0.184), shumëzo me 100 para pragjeve. */
const PERCENT_KEYS = new Set([
  'revenueGrowth', 'epsGrowth', 'grossMargin', 'operatingMargin', 'netMargin',
  'returnOnEquity', 'fcfMargin', 'earningsSurprise', 'institutionalOwnership',
]);

/** Statusi i një treguesi sipas vlerës — bërthama e "Status: Strong/Neutral/Weak". */
export function metricStatus(key: string, value: number | undefined | null): MetricStatus {
  if (value === undefined || value === null || !isFinite(value)) return 'unknown';
  const th = THRESHOLDS[key];
  if (!th) return 'unknown';
  const v = PERCENT_KEYS.has(key) ? value * 100 : value;
  if (th.inverted) {
    // P.sh. D/E: ≤60 → strong; ≥150 → weak
    if (v <= th.strongMin) return 'strong';
    if (v >= th.weakMax) return 'weak';
    return 'neutral';
  }
  if (v >= th.strongMin) return 'strong';
  if (v <= th.weakMax) return 'weak';
  return 'neutral';
}

// ─── Etiketat e seksioneve ───

const STATUS_SCORE: Record<MetricStatus, number> = { strong: 1, neutral: 0, weak: -1, unknown: 0 };

/** Mesatarja e normalizuar (-1..+1) e statuseve; 'unknown' përjashtohet. */
function avgStatus(metrics: FundamentalMetric[]): number | null {
  const known = metrics.filter(m => m.status !== 'unknown');
  if (known.length === 0) return null;
  return known.reduce((s, m) => s + STATUS_SCORE[m.status], 0) / known.length;
}

/**
 * Etiketa e një seksioni sipas spec-it të userit:
 *   Growth: Positive/Neutral/Negative · Profitability & Cash flow: Strong/Neutral/Weak
 *   Valuation: Cheap/Reasonable/Expensive/Very Expensive
 *   Earnings & Estimates: Positive/Neutral/Negative · Ownership: Strong/Moderate/Low
 */
export function sectionLabel(key: SectionKey, metrics: FundamentalMetric[]): string {
  const avg = avgStatus(metrics);
  if (avg === null) return 'Unknown';
  switch (key) {
    case 'growth':
      return avg >= 0.4 ? 'Positive' : avg <= -0.4 ? 'Negative' : 'Neutral';
    case 'profitability':
      return avg >= 0.4 ? 'Strong' : avg <= -0.4 ? 'Weak' : 'Neutral';
    case 'cashFlow':
      return avg >= 0.4 ? 'Strong' : avg <= -0.4 ? 'Weak' : 'Neutral';
    case 'valuation':
      // Statuset e valuation janë inverted (strong = i lirë, weak = i shtrenjtë):
      // avg i LARTË → i lirë (Cheap) · avg i ULËT → i shtrenjtë (Expensive).
      if (avg >= 0.5) return 'Cheap';
      if (avg <= -0.6) return 'Very Expensive';
      if (avg <= -0.2) return 'Expensive';
      return 'Reasonable';
    case 'earnings':
      return avg >= 0.4 ? 'Positive' : avg <= -0.4 ? 'Negative' : 'Neutral';
    case 'ownership':
      return avg >= 0.4 ? 'Strong' : avg <= -0.4 ? 'Low' : 'Moderate';
    default:
      return 'Neutral';
  }
}

// ─── Etiketa e përgjithshme e kontekstit ───

export interface ContextLabelResult {
  label: 'Positive' | 'Neutral' | 'Negative' | 'Insufficient data';
  score: number; // -1 .. +1
}

/** Pesha e seksioneve në kontekstin e përgjithshëm (shuma = 1; risk trajtohet veç). */
const SECTION_WEIGHTS: Partial<Record<SectionKey, number>> = {
  growth: 0.28,
  profitability: 0.22,
  cashFlow: 0.15,
  earnings: 0.15,
  valuation: 0.10,
  ownership: 0.10,
};

/** Peshimi i seksioneve + ndëshkimi për risk flags. */
const RISK_PENALTY = { perFlag: 0.12, max: 0.5 };

/**
 * Fundamental Context i përgjithshëm — p.sh. "Positive".
 * Vetëm informativ në Fazën 1: NUK prek Technical Score / READY / BUY / WATCH.
 */
export function contextLabel(sections: FundamentalSection[], riskFlagCount: number): ContextLabelResult {
  const scores = new Map<SectionKey, number | null>();
  for (const s of sections) {
    if (s.key === 'risk') continue;
    scores.set(s.key, avgStatus(s.metrics));
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, w] of Object.entries(SECTION_WEIGHTS) as [SectionKey, number][]) {
    const sc = scores.get(key);
    if (sc === null || sc === undefined) continue; // seksion pa të dhëna → jashtë peshimit
    weighted += sc * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return { label: 'Insufficient data', score: 0 };

  let normalized = weighted / totalWeight;

  // Nëse shumica e seksioneve s'kanë të dhëna, mos u beso etiketës
  const sectionsWithData = [...scores.values()].filter(v => v !== null).length;
  const totalSections = Object.keys(SECTION_WEIGHTS).length;
  if (sectionsWithData < Math.ceil(totalSections / 2)) {
    return { label: 'Insufficient data', score: normalized };
  }

  // Ndëshkimi për risk flags
  const penalty = Math.min(RISK_PENALTY.max, riskFlagCount * RISK_PENALTY.perFlag);
  normalized -= penalty;

  if (normalized >= 0.25) return { label: 'Positive', score: normalized };
  if (normalized <= -0.25) return { label: 'Negative', score: normalized };
  return { label: 'Neutral', score: normalized };
}
