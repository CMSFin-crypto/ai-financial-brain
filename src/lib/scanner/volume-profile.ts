// ═══════════════════════════════════════════════════════════════
// VOLUME PROFILE CALCULATOR — IBKR Pullback Gate
// ═══════════════════════════════════════════════════════════════
// Builds a horizontal volume histogram from OHLCV bars.
// Identifies POC, VAH/VAL (70% Value Area), HVN/LVN nodes.
//
// Entry rule: Long READY only if:
//   1. Trend up + pullback to EMA20
//   2. Price near POC or HVN below (support liquidity)
//   3. No strong HVN/VAH immediately above (resistance)
//   4. Pullback volume fading → bounce

export type OhlcvBar = {
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type VolumeNode = {
  price: number;
  volume: number;
};

export type VolumeProfile = {
  poc: number;
  vah: number;
  val: number;
  hvns: VolumeNode[];
  nearestHvnBelow: number | null;
  nearestHvnAbove: number | null;
  distToPocPct: number;
  distToHvnBelowPct: number | null;
  distToHvnAbovePct: number | null;
  supportBelow: boolean;
  resistanceAbove: boolean;
  roomUpPct: number;
  location: "BELOW_VA" | "IN_VA" | "ABOVE_VA";
  vpScore: number;
};

const VALUE_AREA = 0.7;    // 70% of total volume centered on POC
const HVN_MULT = 1.5;      // HVN = bins with volume ≥ 1.5× average
const NEAR_PCT = 1.2;      // within 1.2% = "near" support/resistance
const ROOM_UP_MIN = 2.0;   // need ≥2% room to next resistance above

function binSizeFor(price: number): number {
  if (price >= 200) return 0.5;
  if (price >= 50) return 0.25;
  if (price >= 10) return 0.1;
  return 0.05;
}

function round(n: number, d = 4): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

export function buildVolumeProfile(bars: OhlcvBar[], lastPrice: number): VolumeProfile | null {
  if (!bars.length || lastPrice <= 0) return null;

  const hi = Math.max(...bars.map((b) => b.high));
  const lo = Math.min(...bars.map((b) => b.low));
  if (hi <= lo) return null;

  const step = binSizeFor(lastPrice);
  const nBins = Math.max(12, Math.min(80, Math.round((hi - lo) / step) + 1));
  const width = (hi - lo) / nBins;
  const bins = Array.from({ length: nBins }, (_, i) => ({
    price: lo + (i + 0.5) * width,
    volume: 0,
  }));

  // Distribute each bar's volume across the price bins it touched
  for (const b of bars) {
    if (b.volume <= 0 || b.high <= b.low) continue;
    const range = b.high - b.low;
    const from = Math.max(0, Math.floor((b.low - lo) / width));
    const to = Math.min(nBins - 1, Math.floor((b.high - lo) / width));
    for (let i = from; i <= to; i++) {
      const binLo = lo + i * width;
      const binHi = binLo + width;
      const overlap = Math.min(b.high, binHi) - Math.max(b.low, binLo);
      if (overlap > 0) bins[i].volume += b.volume * (overlap / range);
    }
  }

  const total = bins.reduce((s, x) => s + x.volume, 0);
  if (total <= 0) return null;

  // Find POC (bin with highest volume)
  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].volume > bins[pocIdx].volume) pocIdx = i;
  }

  // Expand from POC until 70% of volume captured → VAH/VAL
  const target = total * VALUE_AREA;
  const used = new Set<number>([pocIdx]);
  let acc = bins[pocIdx].volume;
  let lowI = pocIdx;
  let highI = pocIdx;

  while (acc < target) {
    const up = highI + 1 < bins.length ? bins[highI + 1].volume : -1;
    const down = lowI - 1 >= 0 ? bins[lowI - 1].volume : -1;
    if (up < 0 && down < 0) break;
    if (up > down || (up === down && up >= 0)) {
      highI += 1;
      acc += bins[highI].volume;
      used.add(highI);
    } else {
      lowI -= 1;
      acc += bins[lowI].volume;
      used.add(lowI);
    }
  }

  // HVN = bins with volume ≥ 1.5× average
  const avg = total / bins.length;
  const hvns = bins
    .filter((b) => b.volume >= avg * HVN_MULT)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 6);

  // Find nearest HVN below and above current price
  const below = hvns.filter((h) => h.price <= lastPrice).sort((a, b) => b.price - a.price)[0] ?? null;
  const above = hvns.filter((h) => h.price > lastPrice).sort((a, b) => a.price - b.price)[0] ?? null;

  const poc = bins[pocIdx].price;
  const vah = bins[highI].price;
  const val = bins[lowI].price;
  const dist = (a: number, b: number) => ((a - b) / lastPrice) * 100;

  // Fallback to POC/VAH/VAL if no HVN found
  const nearestHvnBelow = below?.price ?? (poc <= lastPrice ? poc : val <= lastPrice ? val : null);
  const nearestHvnAbove = above?.price ?? (poc > lastPrice ? poc : vah > lastPrice ? vah : null);

  const distToPocPct = dist(lastPrice, poc);
  const distToHvnBelowPct = nearestHvnBelow == null ? null : dist(lastPrice, nearestHvnBelow);
  const distToHvnAbovePct = nearestHvnAbove == null ? null : dist(nearestHvnAbove, lastPrice);

  const supportBelow =
    nearestHvnBelow != null && Math.abs(distToHvnBelowPct ?? 99) <= NEAR_PCT;
  const resistanceAbove =
    nearestHvnAbove != null && (distToHvnAbovePct ?? 99) <= NEAR_PCT;

  const location: VolumeProfile["location"] =
    lastPrice > vah ? "ABOVE_VA" : lastPrice < val ? "BELOW_VA" : "IN_VA";

  const roomUpPct = distToHvnAbovePct ?? 8;
  let vpScore = 0;
  if (supportBelow) vpScore += 35;
  if (location === "ABOVE_VA" || location === "IN_VA") vpScore += 20;
  if (roomUpPct >= ROOM_UP_MIN) vpScore += 25;
  if (!resistanceAbove) vpScore += 20;

  return {
    poc: round(poc),
    vah: round(vah),
    val: round(val),
    hvns,
    nearestHvnBelow: nearestHvnBelow == null ? null : round(nearestHvnBelow),
    nearestHvnAbove: nearestHvnAbove == null ? null : round(nearestHvnAbove),
    distToPocPct: round(distToPocPct, 3),
    distToHvnBelowPct: distToHvnBelowPct == null ? null : round(distToHvnBelowPct, 3),
    distToHvnAbovePct: distToHvnAbovePct == null ? null : round(distToHvnAbovePct, 3),
    supportBelow,
    resistanceAbove,
    roomUpPct: round(roomUpPct, 3),
    location,
    vpScore,
  };
}
