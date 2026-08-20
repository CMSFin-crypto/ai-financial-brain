// ============================================================
// PEAD ENGINE — Post-Earnings Announcement Drift
//
// One of the most documented market anomalies: prices continue
// drifting in the direction of the earnings surprise for 1-4 weeks
// after the announcement, not just on the report day.
//
// Features:
// - Earnings surprise detection (actual vs estimate)
// - Gap analysis (overnight gap after earnings)
// - Post-earnings volume profile
// - Gap-fill detection (has the gap been filled?)
// - Composite PEAD score (-100 to +100)
//
// Data sources: Alpha Vantage EARNINGS endpoint (free tier)
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from './alpha-vantage';

// ─── Types ────────────────────────────────────────────────────

export interface EarningsReport {
  fiscalDateEnding: string;    // "2025-06-30"
  reportedDate: string;        // "2025-08-15"
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;     // reportedEPS - estimatedEPS
  surprisePct: number | null;  // (surprise / |estimatedEPS|) * 100
}

export interface PEADInput {
  symbol: string;
  earningsReports: EarningsReport[];   // sorted newest first
  priceHistory: HistoricalDataPoint[]; // daily OHLCV, sorted ascending
  currentPrice: number;
}

export interface PEADScore {
  symbol: string;
  /** Overall PEAD signal strength: -100 to +100 */
  peadScore: number;
  /** Categorical signal */
  signal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' | 'NO_DATA';
  /** Days since last earnings report */
  daysSinceEarnings: number | null;
  /** Last earnings surprise % */
  lastSurprisePct: number | null;
  /** Gap size on earnings day (open vs prev close) % */
  gapPct: number | null;
  /** Has the earnings gap been filled? */
  gapFilled: boolean | null;
  /** Post-earnings volume ratio (avg vol 3d after / avg vol 20d before) */
  volumeRatio: number | null;
  /** Drift since earnings (current price vs earnings close) % */
  driftSinceEarnings: number | null;
  /** Is PEAD still active (within drift window)? */
  driftActive: boolean;
  /** Human-readable reasons */
  reasons: string[];
  /** Risk flags */
  riskFlags: string[];
}

// ─── Earnings Fetching (Alpha Vantage) ────────────────────────

const earningsCache = new Map<string, { data: EarningsReport[]; fetchedAt: number }>();
const EARNINGS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Fetch earnings from Alpha Vantage EARNINGS endpoint.
 * Free tier: 25 calls/day — so we cache aggressively.
 */
export async function fetchEarnings(symbol: string): Promise<EarningsReport[]> {
  const cached = earningsCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < EARNINGS_CACHE_TTL) {
    return cached.data;
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
  if (!apiKey) {
    console.log(`[PEAD] No API key — returning empty earnings for ${symbol}`);
    return [];
  }

  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    
    const json = await res.json();
    const quarterly = json?.quarterlyEarnings;
    if (!Array.isArray(quarterly)) return [];

    const reports: EarningsReport[] = quarterly
      .map((r: Record<string, any>) => {
        const reported = parseFloat(r.reportedEPS);
        const estimated = parseFloat(r.estimatedEPS);
        const surprise = !isNaN(reported) && !isNaN(estimated) ? reported - estimated : null;
        const surprisePct = surprise !== null && estimated !== 0
          ? (surprise / Math.abs(estimated)) * 100 : null;

        return {
          fiscalDateEnding: r.fiscalDateEnding,
          reportedDate: r.reportedDate,
          reportedEPS: isNaN(reported) ? null : reported,
          estimatedEPS: isNaN(estimated) ? null : estimated,
          surprise,
          surprisePct,
        };
      })
      .filter((r: EarningsReport) => r.reportedEPS !== null);

    earningsCache.set(symbol, { data: reports, fetchedAt: Date.now() });
    return reports;
  } catch (err: any) {
    console.log(`[PEAD] Failed to fetch earnings for ${symbol}: ${err.message}`);
    return [];
  }
}

// ─── Core PEAD Computation ─────────────────────────────────────

/**
 * Compute PEAD score for a single stock.
 * 
 * PEAD Logic:
 * 1. Find most recent earnings report
 * 2. Calculate earnings surprise
 * 3. Measure gap on earnings day
 * 4. Check post-earnings volume spike
 * 5. Determine if gap has been filled
 * 6. Calculate drift since earnings
 * 7. Composite score based on all factors
 */
export function computePEADScore(input: PEADInput): PEADScore {
  const { symbol, earningsReports, priceHistory, currentPrice } = input;

  // Default: no data
  if (!earningsReports || earningsReports.length === 0 || !priceHistory || priceHistory.length < 30) {
    return {
      symbol,
      peadScore: 0,
      signal: 'NO_DATA',
      daysSinceEarnings: null,
      lastSurprisePct: null,
      gapPct: null,
      gapFilled: null,
      volumeRatio: null,
      driftSinceEarnings: null,
      driftActive: false,
      reasons: [],
      riskFlags: [],
    };
  }

  const latest = earningsReports[0];
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  // Days since earnings
  const reportedDate = new Date(latest.reportedDate);
  const daysSinceEarnings = Math.floor((Date.now() - reportedDate.getTime()) / (1000 * 60 * 60 * 24));

  // PEAD is most effective within 1-20 trading days after earnings
  // After 30 days, drift effect diminishes significantly
  const driftActive = daysSinceEarnings >= 0 && daysSinceEarnings <= 30;

  if (daysSinceEarnings > 30) {
    return {
      symbol,
      peadScore: 0,
      signal: 'NO_DATA',
      daysSinceEarnings,
      lastSurprisePct: latest.surprisePct,
      gapPct: null,
      gapFilled: null,
      volumeRatio: null,
      driftSinceEarnings: null,
      driftActive: false,
      reasons: [`Earnings ${daysSinceEarnings}d ago — drift window closed`],
      riskFlags: [],
    };
  }

  // Find the earnings date in price history
  const earningsDateStr = latest.reportedDate.slice(0, 10);
  const earningsIdx = priceHistory.findIndex(d => d.date === earningsDateStr);
  
  // If exact date not found, try next trading day
  let eIdx = earningsIdx;
  if (eIdx === -1) {
    for (let i = 0; i < priceHistory.length; i++) {
      if (new Date(priceHistory[i].date) >= reportedDate) {
        eIdx = i;
        break;
      }
    }
  }

  if (eIdx === -1 || eIdx === 0) {
    // Can't find earnings date in price data
    return {
      symbol,
      peadScore: latest.surprise && latest.surprise > 0 ? 15 : latest.surprise && latest.surprise < 0 ? -15 : 0,
      signal: latest.surprise && latest.surprise > 0 ? 'BUY' : latest.surprise && latest.surprise < 0 ? 'SELL' : 'NO_DATA',
      daysSinceEarnings,
      lastSurprisePct: latest.surprisePct,
      gapPct: null,
      gapFilled: null,
      volumeRatio: null,
      driftSinceEarnings: null,
      driftActive,
      reasons: latest.surprisePct ? [`Earnings surprise: ${latest.surprisePct > 0 ? '+' : ''}${latest.surprisePct.toFixed(1)}%`] : [],
      riskFlags: ['No price data on earnings date'],
    };
  }

  // ── 1. Earnings Surprise Score (-30 to +30) ──
  let surpriseScore = 0;
  const surprise = latest.surprise ?? 0;
  const surprisePct = latest.surprisePct ?? 0;

  if (surprise > 0) {
    surpriseScore = Math.min(30, surprisePct * 3); // Cap at +30
    reasons.push(`Earnings beat by ${surprisePct.toFixed(1)}%`);
  } else if (surprise < 0) {
    surpriseScore = Math.max(-30, surprisePct * 3); // Floor at -30
    reasons.push(`Earnings missed by ${Math.abs(surprisePct).toFixed(1)}%`);
  }

  // ── 2. Gap Analysis (-20 to +20) ──
  let gapPct: number | null = null;
  let gapFilled: boolean | null = null;
  let gapScore = 0;

  const prevClose = priceHistory[eIdx - 1].close;
  const earningsOpen = priceHistory[eIdx].open;
  gapPct = prevClose > 0 ? ((earningsOpen - prevClose) / prevClose) * 100 : 0;

  // Check if gap is in same direction as surprise (confirms PEAD)
  if (surprise > 0 && gapPct > 0) {
    gapScore = Math.min(20, gapPct * 5);
    reasons.push(`Positive gap ${gapPct.toFixed(1)}% confirms beat`);
  } else if (surprise < 0 && gapPct < 0) {
    gapScore = Math.max(-20, gapPct * 5);
    reasons.push(`Negative gap ${gapPct.toFixed(1)}% confirms miss`);
  } else if (Math.abs(gapPct) > 3) {
    // Large gap but opposite direction = mixed signal
    gapScore = 0;
    riskFlags.push(`Gap direction contradicts surprise`);
  }

  // Check if gap has been filled
  if (Math.abs(gapPct) > 1) {
    const gapLevel = prevClose; // Gap fills when price returns to prev close
    const postEarnings = priceHistory.slice(eIdx);
    const minLow = Math.min(...postEarnings.map(d => d.low));
    const maxHigh = Math.max(...postEarnings.map(d => d.high));

    if (gapPct > 0) {
      gapFilled = minLow <= prevClose;
    } else {
      gapFilled = maxHigh >= prevClose;
    }

    if (gapFilled && daysSinceEarnings <= 3) {
      // Gap filled quickly = weak PEAD signal
      riskFlags.push('Gap filled within 3 days — weak drift');
      gapScore *= 0.3; // Reduce gap score significantly
    } else if (!gapFilled && daysSinceEarnings <= 10) {
      reasons.push('Gap holding — strong drift signal');
      gapScore *= 1.3; // Boost: unfilled gap = persistent drift
    }
  } else {
    gapFilled = null; // Gap too small to measure
  }

  // ── 3. Post-Earnings Volume Ratio (-15 to +15) ──
  let volumeRatio: number | null = null;
  let volumeScore = 0;

  // Average volume 20 days before earnings
  const preEarningsSlice = priceHistory.slice(Math.max(0, eIdx - 20), eIdx);
  if (preEarningsSlice.length >= 10) {
    const avgVolBefore = preEarningsSlice.reduce((s, d) => s + d.volume, 0) / preEarningsSlice.length;

    // Average volume 1-3 days after earnings
    const postEarningsSlice = priceHistory.slice(eIdx, Math.min(priceHistory.length, eIdx + 4));
    const avgVolAfter = postEarningsSlice.length > 0
      ? postEarningsSlice.reduce((s, d) => s + d.volume, 0) / postEarningsSlice.length
      : avgVolBefore;

    volumeRatio = avgVolBefore > 0 ? avgVolAfter / avgVolBefore : 1;

    // High volume confirms the move
    if (volumeRatio > 2.0 && surprise > 0) {
      volumeScore = 15;
      reasons.push('Volume spike 2x+ confirms buying pressure');
    } else if (volumeRatio > 1.5 && surprise > 0) {
      volumeScore = 10;
    } else if (volumeRatio > 2.0 && surprise < 0) {
      volumeScore = -15;
      reasons.push('Heavy volume on sell-off');
    } else if (volumeRatio > 1.5 && surprise < 0) {
      volumeScore = -10;
    } else if (volumeRatio < 0.7) {
      // Low volume = weak conviction
      volumeScore = 0;
      riskFlags.push('Low post-earnings volume — weak conviction');
    }
  }

  // ── 4. Drift Since Earnings (-20 to +20) ──
  let driftSinceEarnings: number | null = null;
  let driftScore = 0;

  const earningsClose = priceHistory[eIdx].close;
  driftSinceEarnings = earningsClose > 0 ? ((currentPrice - earningsClose) / earningsClose) * 100 : 0;

  // Drift should be in same direction as surprise
  if (surprise > 0 && driftSinceEarnings > 0) {
    // Positive drift confirms PEAD — but too much drift may mean it's priced in
    if (driftSinceEarnings > 10) {
      driftScore = 5; // Already moved a lot — less edge
      riskFlags.push(`Already drifted +${driftSinceEarnings.toFixed(1)}% — may be priced in`);
    } else if (driftSinceEarnings > 5) {
      driftScore = 12;
      reasons.push(`Strong drift +${driftSinceEarnings.toFixed(1)}% post-earnings`);
    } else {
      driftScore = 20;
      reasons.push(`Healthy drift +${driftSinceEarnings.toFixed(1)}% — room to run`);
    }
  } else if (surprise < 0 && driftSinceEarnings < 0) {
    if (driftSinceEarnings < -10) {
      driftScore = -5;
      riskFlags.push(`Already dropped ${driftSinceEarnings.toFixed(1)}% — oversold?`);
    } else if (driftSinceEarnings < -5) {
      driftScore = -12;
    } else {
      driftScore = -20;
    }
  } else if (surprise > 0 && driftSinceEarnings < 0) {
    // Positive surprise but price dropped = failed PEAD
    driftScore = -15;
    riskFlags.push('Positive surprise but price declining — failed PEAD');
  } else if (surprise < 0 && driftSinceEarnings > 0) {
    // Negative surprise but price rising = potential short squeeze
    driftScore = 10;
    riskFlags.push('Missed earnings but price rising — watch for reversal');
  }

  // ── 5. Time Decay Factor ──
  // PEAD effect is strongest in first 5 days, decays after
  let timeDecay = 1.0;
  if (daysSinceEarnings <= 3) timeDecay = 1.0;
  else if (daysSinceEarnings <= 7) timeDecay = 0.85;
  else if (daysSinceEarnings <= 14) timeDecay = 0.65;
  else if (daysSinceEarnings <= 21) timeDecay = 0.45;
  else timeDecay = 0.25;

  // ── Composite Score ──
  const rawScore = surpriseScore + gapScore + volumeScore + driftScore;
  const peadScore = Math.round(Math.max(-100, Math.min(100, rawScore * timeDecay)));

  // Signal classification
  let signal: PEADScore['signal'] = 'NO_DATA';
  if (peadScore >= 40) signal = 'STRONG_BUY';
  else if (peadScore >= 15) signal = 'BUY';
  else if (peadScore >= -15) signal = 'NEUTRAL';
  else if (peadScore >= -40) signal = 'SELL';
  else signal = 'STRONG_SELL';

  return {
    symbol,
    peadScore,
    signal,
    daysSinceEarnings,
    lastSurprisePct: latest.surprisePct,
    gapPct,
    gapFilled,
    volumeRatio,
    driftSinceEarnings,
    driftActive,
    reasons,
    riskFlags,
  };
}

// ─── Batch PEAD for multiple symbols ───────────────────────────

export interface PEADBatchResult {
  results: Map<string, PEADScore>;
  fetchErrors: string[];
}

/**
 * Compute PEAD scores for multiple symbols in parallel.
 * Fetches earnings + price data, then scores each.
 */
export async function computePEADBatch(
  symbols: string[],
  options?: { priceHistoryCache?: Map<string, HistoricalDataPoint[]> },
): Promise<PEADBatchResult> {
  const results = new Map<string, PEADScore>();
  const fetchErrors: string[] = [];

  // Fetch all earnings in parallel
  const earningsMap = new Map<string, EarningsReport[]>();
  const earningsPromises = symbols.map(async (sym) => {
    try {
      const reports = await fetchEarnings(sym);
      if (reports.length > 0) earningsMap.set(sym, reports);
    } catch (err: any) {
      fetchErrors.push(`Earnings fetch failed for ${sym}: ${err.message}`);
    }
  });
  await Promise.allSettled(earningsPromises);

  // Fetch price data for symbols with earnings
  const symbolsWithEarnings = symbols.filter(s => earningsMap.has(s));
  const pricePromises = symbolsWithEarnings.map(async (sym) => {
    if (options?.priceHistoryCache?.has(sym)) return; // already have
    try {
      const data = await fetchHistoricalData(sym, '3mo', { forceRefresh: false });
      if (data && data.length >= 30) {
        options?.priceHistoryCache?.set(sym, data);
      }
    } catch (err: any) {
      fetchErrors.push(`Price fetch failed for ${sym}: ${err.message}`);
    }
  });
  await Promise.allSettled(pricePromises);

  // Compute scores
  for (const sym of symbols) {
    const reports = earningsMap.get(sym) || [];
    const prices = options?.priceHistoryCache?.get(sym);

    const pead = computePEADScore({
      symbol: sym,
      earningsReports: reports,
      priceHistory: prices || [],
      currentPrice: prices?.[prices.length - 1]?.close || 0,
    });
    results.set(sym, pead);
  }

  return { results, fetchErrors };
}

// ─── PEAD as a Feature (for prediction pipeline) ───────────────

export interface PEADFeature {
  pead_score: number;
  pead_signal: string;
  pead_days_since: number;
  pead_surprise_pct: number;
  pead_gap_pct: number;
  pead_gap_filled: number; // 1 or 0
  pead_volume_ratio: number;
  pead_drift_pct: number;
  pead_active: number; // 1 or 0
}

/** Convert PEADScore to a flat feature object for ML pipeline */
export function peadToFeatures(pead: PEADScore): PEADFeature {
  return {
    pead_score: pead.peadScore,
    pead_signal: pead.signal === 'NO_DATA' ? 0
      : pead.signal === 'STRONG_BUY' ? 2
      : pead.signal === 'BUY' ? 1
      : pead.signal === 'SELL' ? -1
      : pead.signal === 'STRONG_SELL' ? -2 : 0,
    pead_days_since: pead.daysSinceEarnings ?? -1,
    pead_surprise_pct: pead.lastSurprisePct ?? 0,
    pead_gap_pct: pead.gapPct ?? 0,
    pead_gap_filled: pead.gapFilled ? 1 : 0,
    pead_volume_ratio: pead.volumeRatio ?? 1,
    pead_drift_pct: pead.driftSinceEarnings ?? 0,
    pead_active: pead.driftActive ? 1 : 0,
  };
}
