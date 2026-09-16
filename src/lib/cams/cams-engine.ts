// ═══════════════════════════════════════════════════════════════
// CAMS — Catalyst, Acceleration, Momentum & Structure
// ═══════════════════════════════════════════════════════════════
// Strategji që NUK pretendon të "dijë" paraprakisht cilat aksione
// do të rriten 40–60%. Identifikon KOMBINIMIN e sinjaleve që
// shpesh paraprin një lëvizje të fortë:
//   C — Katalizator fundamental (earnings beat, 8K, drift PEAD)
//   A — Acceleration (tregu po e konfirmon katalizatorin)
//   S — Structure (setup teknik për hyrje të përcaktuar)
//   R — Revision (prirja e vlerësimeve të analistëve)
//   M — Market/Sector Regime
//   P — Penalty (risk: earnings afër, dilution, overextension)
//
// Formula (pikët 0–100 për çdo sub-score):
//   CAMS = 0.35·C + 0.25·A + 0.20·S + 0.10·R + 0.10·M − P
//
// Tiers:
//   80–100 → A_KANDIDAT   (hyrje vetëm me trigger teknik)
//   70–79  → WATCHLIST    (prit pullback ose breakout të pastër)
//   60–69  → MONITOR      (mungon një konfirmim)
//   < 60   → NO_TRADE
// ═══════════════════════════════════════════════════════════════

// ── Tipet e input-it (price features nga OHLCV) ──

export interface CamsGapEvent {
  /** Ditë biznesi më parë */
  daysAgo: number;
  /** Gap % i ditës: (open − prevClose)/prevClose × 100 */
  gapPct: number;
  /** Volumi i ditës së gap / mesatarja 20d para asaj dite */
  rvolOnGap: number;
  /** Close-i i ditës së gap (referencë për PEAD — gap filled?) */
  closeOnGap: number;
  /** Data e gap (YYYY-MM-DD) */
  date: string;
}

export interface CamsPriceFeatures {
  symbol: string;
  price: number;
  ema10: number;
  ema20: number;
  ema50: number;
  ema200: number;
  /** Pjerrtësia e EMA20/EMA50 në 10 ditë (%, pozitive = rritëse) */
  ema20Slope: number;
  ema50Slope: number;
  rsi14: number;
  atr14: number;
  atrPct: number;
  adx14: number;
  /** Volumi relativ: mesatarja 3d / mesatarja 20d */
  rvol: number;
  /** Pozicioni i close-it në range-in ditor (0=fundi, 1=maja) */
  closeLocation: number;
  ret5d: number;
  ret20d: number;
  /** Rendimenti 20d i sektorit */
  sectorRet20d: number;
  /** Percentili i rendimentit 20d brenda sektorit (0–100) */
  sectorRankPct: number;
  /** High-i 20-ditor PARA ditës së sotme */
  high20: number;
  /** Ditët e pullback-ut aktual (0 = jo në pullback) */
  pullbackDays: number;
  /** Ditët e konsolidimit të ngushtë (range < 1.5 ATR) */
  consolidationDays: number;
  /** High-i maksimal gjatë konsolidimit */
  consolidationHigh: number;
  swingLow: number;
  /** Gap-u më i madh pozitiv në 45 ditët e fundit (proxy katalizatori) */
  gapUp: CamsGapEvent | null;
  /** Gap-u më i madh negativ në 10 ditët e fundit (rrezik) */
  gapDown: CamsGapEvent | null;
}

export interface CamsCatalystFeatures {
  /** EPS surprise % nga Alpha Vantage (vetëm për top kandidatët; null = pa të dhëna) */
  epsSurprisePct: number | null;
  /** Revenue surprise % — placeholder për V2 (s'ka burim falas të besueshëm) */
  revenueSurprisePct: number | null;
  /** Sentimenti i 8-K materialeve të fundit: none | positive | negative */
  material8KSentiment: string;
  /** Score i analistëve −100..+100 (null = pa të dhëna) */
  analystRevisionScore: number | null;
  /** Ditë deri në earnings-in e ardhshëm (null = i panjohur) */
  daysToEarnings: number | null;
  /** Sa ditë më parë u raportua earnings-i i fundit (null = i panjohur) */
  daysSinceEarnings: number | null;
}

export interface CamsRegimeFeatures {
  spyAbove50: boolean;
  spyAbove200: boolean;
  qqqAbove50: boolean;
  qqqAbove200: boolean;
  sectorAbove50: boolean;
  sectorVsSpy20d: number;
}

export type CamsTier = 'A_KANDIDAT' | 'WATCHLIST' | 'MONITOR' | 'NO_TRADE';
export type CamsSetup = 'PEAD_CONTINUATION' | 'PULLBACK' | 'BREAKOUT' | 'NONE';

export interface CamsResult {
  symbol: string;
  catalystScore: number;
  accelerationScore: number;
  structureScore: number;
  revisionScore: number;
  regimeScore: number;
  penalty: number;
  camsScore: number;
  tier: CamsTier;
  setup: CamsSetup;
  entry: number;
  stop: number;
  target1R: number;
  target2R: number;
  target3R: number;
  riskPct: number;
  positionSize: number;
  positionValue: number;
  riskDollars: number;
  riskBudgetPct: number;
  extensionFiltered: boolean;
  /** (close − EMA20) / ATR14 — mbi 2.0 = overextended */
  extensionAtr: number;
  reasons: string[];
  warnings: string[];
  invalidation: string;
  catalystEvidence: string[];
}

// ── 1. CATALYST SCORE (0–100) ─────────────────────────────────
// Pjesët (maksimumi 100):
//   EPS surprise të dhëna reale ....... deri +30
//   Reagimi i tregut (gap + volum) ... deri +30
//   8-K materiale pozitive ........... +20
//   PEAD drift (gap po mbahet) ........ deri +20
// Negativet: EPS miss → −25; 8K negative → cap 30.
export function computeCatalyst(p: CamsPriceFeatures, c: CamsCatalystFeatures): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;

  // A. EPS surprise (vetëm kur ka të dhëna Alpha Vantage)
  if (c.epsSurprisePct != null) {
    if (c.epsSurprisePct >= 5) {
      score += Math.min(30, c.epsSurprisePct * 1.5);
      evidence.push(`EPS beat +${c.epsSurprisePct.toFixed(1)}% (aktual mbi konsensus)`);
    } else if (c.epsSurprisePct > 0) {
      score += 10;
      evidence.push(`EPS beat +${c.epsSurprisePct.toFixed(1)}% (i vogël)`);
    } else if (c.epsSurprisePct <= -5) {
      score -= 25;
      evidence.push(`EPS miss ${c.epsSurprisePct.toFixed(1)}% — kujdes`);
    } else {
      evidence.push(`EPS ${c.epsSurprisePct.toFixed(1)}% (thjesht mbi konsensus)`);
    }
  }

  // B. Reagimi i tregut ndaj katalizatorit (gap-up me volum — proxy i verifikueshëm)
  if (p.gapUp && p.gapUp.daysAgo <= 45 && p.gapUp.rvolOnGap >= 1.5) {
    const gapPts = Math.min(30, Math.max(0, p.gapUp.gapPct) * 5);
    score += gapPts;
    evidence.push(
      `Reagim tregu ${p.gapUp.date}: gap +${p.gapUp.gapPct.toFixed(1)}% me volum ${p.gapUp.rvolOnGap.toFixed(1)}x mesatarja`
    );
    // D. PEAD drift — a po mbahet lëvizja pas gap?
    if (p.price > p.gapUp.closeOnGap && p.price > p.ema20) {
      score += 20;
      evidence.push('Drift pozitiv pas katalizatorit — çmimi mbi close-in e gap dhe EMA20 (PEAD)');
    } else if (p.price > p.gapUp.closeOnGap * 0.98) {
      score += 10;
      evidence.push('Gap po mbahet kryesisht (brenda 2% të close-it të gap)');
    } else {
      evidence.push('Gap-u është mbushur pjesërisht — drift i dobët');
    }
  } else if (c.daysSinceEarnings != null && c.daysSinceEarnings <= 30) {
    // Earnings së fundmi por pa gap të madh të detektueshëm — zhvillim i qetë
    if (p.price > p.ema20 && p.ret20d > 0) {
      score += 12;
      evidence.push(`Earnings ${c.daysSinceEarnings}d më parë — aksioni po zhvillohet pozitivisht mbi EMA20`);
    }
  } else {
    evidence.push('Pa katalizator të detektueshëm të fundit');
  }

  // C. 8-K materiale
  if (c.material8KSentiment === 'positive') {
    score += 20;
    evidence.push('Filing 8-K materiale pozitive në 30 ditët e fundit');
  } else if (c.material8KSentiment === 'negative') {
    score = Math.min(score, 30);
    evidence.push('8-K materiale NEGATIVE — katalizatori kufizohet');
  }

  return { score: Math.round(Math.max(0, Math.min(100, score))), evidence };
}

// ── 2. ACCELERATION SCORE (0–100) ─────────────────────────────
// Tregu po e konfirmon katalizatorin:
//   RVol ≥1.8x → +24 | close në 25% të sipërm → +16 | mbi EMA20/50/200 → +20
//   EMA20>EMA50 me pjerrtësi → +16 | top 15% e sektorit (20d) → +16
//   5d pozitiv jo i zgjatur → +8
export function computeAcceleration(p: CamsPriceFeatures): { score: number; parts: string[] } {
  const parts: string[] = [];
  let score = 0;

  if (p.rvol >= 1.8) { score += 24; parts.push(`RelVolum ${p.rvol.toFixed(1)}x`); }
  else if (p.rvol >= 1.4) { score += 14; parts.push(`RelVolum ${p.rvol.toFixed(1)}x (mesatar)`); }

  if (p.closeLocation >= 0.75) { score += 16; parts.push('Close në 25% të sipërm të range-it'); }

  const aboveCount = (p.price > p.ema20 ? 1 : 0) + (p.price > p.ema50 ? 1 : 0) + (p.price > p.ema200 ? 1 : 0);
  if (aboveCount === 3) { score += 20; parts.push('Mbi EMA 20/50/200'); }
  else if (aboveCount === 2) { score += 8; parts.push('Mbi 2 nga 3 EMA-të kryesore'); }

  if (p.ema20 > p.ema50 && p.ema20Slope > 0 && p.ema50Slope > 0) {
    score += 16; parts.push('EMA20 mbi EMA50, të dyja me pjerrtësi pozitive');
  }

  if (p.sectorRankPct >= 85) { score += 16; parts.push(`Top ${Math.round(100 - p.sectorRankPct)}% e sektorit (20d)`); }
  else if (p.sectorRankPct >= 70) { score += 8; parts.push('Në 30% të sipërme të sektorit (20d)'); }

  if (p.ret5d > 0 && p.ret5d < 8) { score += 8; parts.push(`5d +${p.ret5d.toFixed(1)}% (pa ekstension)`); }

  return { score: Math.round(Math.max(0, Math.min(100, score))), parts };
}

// ── 3. STRUCTURE SCORE (0–100) ────────────────────────────────
// Zgjedh hyrjen — jo vetëm sepse aksioni është "i gjelbër":
//   Breakout 20d me volum → +30 | pullback 2–5d në EMA10/20 → +30
//   Konsolidim i ngushtë 3–10d pas katalizatorit → +20
//   RSI 55–72 → +10 | ADX > 20 → +10
export function computeStructure(p: CamsPriceFeatures): { score: number; parts: string[] } {
  const parts: string[] = [];
  let score = 0;

  const breakoutToday = p.price > p.high20 && p.rvol >= 1.3;
  const nearHigh = p.price >= p.high20 * 0.98;
  if (breakoutToday) { score += 30; parts.push('Breakout mbi 20d high me volum'); }
  else if (nearHigh && p.rvol >= 1.3) { score += 18; parts.push('Afer 20d high me volum në ngjitje'); }

  if (p.pullbackDays >= 2 && p.pullbackDays <= 5 && p.price > p.ema20 && p.price < p.ema10 * 1.02) {
    score += 30; parts.push(`Pullback ${p.pullbackDays}d drejt EMA10/20, trendi i mbajtur`);
  } else if (p.pullbackDays >= 2 && p.pullbackDays <= 5 && p.price > p.ema50) {
    score += 15; parts.push(`Pullback ${p.pullbackDays}d por më i thellë (mbi EMA50)`);
  }

  if (p.consolidationDays >= 3 && p.consolidationDays <= 10) {
    score += 20; parts.push(`Konsolidim i ngushtë ${p.consolidationDays}d`);
  }

  if (p.rsi14 >= 55 && p.rsi14 <= 72) { score += 10; parts.push(`RSI ${p.rsi14.toFixed(0)} (zona e shëndetshme)`); }

  if (p.adx14 > 20) { score += 10; parts.push(`ADX ${p.adx14.toFixed(0)} — trend funksional`); }

  return { score: Math.round(Math.max(0, Math.min(100, score))), parts };
}

// ── 4. REVISION SCORE (0–100) ─────────────────────────────────
// Nga analyst-revision-engine (−100..+100 → normalizuar në 0..100).
// Pa të dhëna → 50 (neutral — nuk ndikon pozitiv as negativ).
export function computeRevision(c: CamsCatalystFeatures): { score: number; note: string } {
  if (c.analystRevisionScore == null) {
    return { score: 50, note: 'Pa të dhëna revisionsh (neutral)' };
  }
  const normalized = Math.round((c.analystRevisionScore + 100) / 2);
  const note =
    c.analystRevisionScore >= 50 ? 'Estimat po rriten fort (beats të përsëritura)' :
    c.analystRevisionScore >= 15 ? 'Estimat po rriten' :
    c.analystRevisionScore <= -50 ? 'Estimat po bien fort' :
    c.analystRevisionScore <= -15 ? 'Estimat po bien' : 'Estimat neutrale';
  return { score: normalized, note };
}

// ── 5. REGIME SCORE (0–100) ────────────────────────────────────
export function computeRegime(m: CamsRegimeFeatures): { score: number; note: string } {
  let score = 0;
  if (m.spyAbove50) score += 15;
  if (m.spyAbove200) score += 15;
  if (m.qqqAbove50) score += 15;
  if (m.qqqAbove200) score += 15;
  if (m.sectorAbove50) score += 20;
  if (m.sectorVsSpy20d > 2) score += 20;
  else if (m.sectorVsSpy20d > -2) score += 10;

  const regimeOk = m.spyAbove50 && m.spyAbove200 && m.qqqAbove50 && m.qqqAbove200;
  const note = regimeOk
    ? `Regjim OK${m.sectorAbove50 ? ' + sektori mbi SMA50' : ' (por sektori nën SMA50)'}`
    : 'Regjimi i tregut JO OK — kujdes ekstra';
  return { score, note };
}

// ── 6. PENALTY (pikë që zbres nga CAMS) ───────────────────────
export function computePenalty(
  p: CamsPriceFeatures,
  c: CamsCatalystFeatures,
  avgDolVol20d: number
): { penalty: number; warnings: string[]; extensionAtr: number; extensionFiltered: boolean } {
  const warnings: string[] = [];
  let penalty = 0;

  // Extension filter: (close − EMA20)/ATR14 > 2.0 → mos e ndiq menjëherë
  const extensionAtr = p.atr14 > 0 ? (p.price - p.ema20) / p.atr14 : 0;
  const extensionFiltered = extensionAtr > 2.0;
  if (extensionAtr > 3.0) { penalty += 30; warnings.push(`Overextended: ${extensionAtr.toFixed(1)} ATR mbi EMA20 — prit konsolidim/pullback`); }
  else if (extensionAtr > 2.0) { penalty += 20; warnings.push(`E zgjatur: ${extensionAtr.toFixed(1)} ATR mbi EMA20 — prit konfirmim`); }

  // Earnings brenda 24 orësh — mos hap hyrje të re (rregulli i universit)
  if (c.daysToEarnings != null) {
    if (c.daysToEarnings <= 1) { penalty += 25; warnings.push(`Earnings pas ${c.daysToEarnings} ditësh — mos hap pozicion të re`); }
    else if (c.daysToEarnings <= 3) { penalty += 12; warnings.push(`Earnings pas ${c.daysToEarnings} ditësh — rrezik binar`); }
  }

  // Likuiditeti i dobët (kalon prefilter-in $20M, por kufiri i ulët)
  if (avgDolVol20d < 50_000_000) { penalty += 5; warnings.push(`Dollar-volum $${(avgDolVol20d / 1e6).toFixed(0)}M/ditë — në kufirin e ulët`); }

  // Volatilitet ekstreme (PSIG-like)
  if (p.atrPct > 5.0) { penalty += 10; warnings.push(`ATR ${p.atrPct.toFixed(1)}% — volatilitet ekstreme, rreziko max 0.25%`); }

  // Gap-down i sapo me volum — katalizator negativ i mundshëm
  if (p.gapDown && p.gapDown.daysAgo <= 5 && p.gapDown.gapPct <= -3 && p.gapDown.rvolOnGap >= 1.5) {
    penalty += 10; warnings.push(`Gap-down ${p.gapDown.gapPct.toFixed(1)}% para ${p.gapDown.daysAgo} ditësh me volum`);
  }

  return { penalty, warnings, extensionAtr, extensionFiltered };
}

// ── Setup-i dhe plani i tregtimit ──────────────────────────────
function detectSetup(p: CamsPriceFeatures, hasCatalyst: boolean): CamsSetup {
  if (hasCatalyst && p.consolidationDays >= 3 && p.consolidationDays <= 10) return 'PEAD_CONTINUATION';
  if (p.pullbackDays >= 2 && p.pullbackDays <= 5 && p.price > p.ema20) return 'PULLBACK';
  if ((p.price >= p.high20 * 0.98) && p.rvol >= 1.3) return 'BREAKOUT';
  return 'NONE';
}

/**
 * Llogarit CAMS të plotë për një kandidat.
 * avgDolVol20d duhet për penalty-n e likuiditetit (opsional — default pa penalitet).
 */
export function computeCams(
  p: CamsPriceFeatures,
  c: CamsCatalystFeatures,
  m: CamsRegimeFeatures,
  avgDolVol20d: number = 60_000_000,
  accountEquity: number = 25_000
): CamsResult {
  const cat = computeCatalyst(p, c);
  const acc = computeAcceleration(p);
  const str = computeStructure(p);
  const rev = computeRevision(c);
  const reg = computeRegime(m);
  const pen = computePenalty(p, c, avgDolVol20d);

  const raw =
    0.35 * cat.score +
    0.25 * acc.score +
    0.20 * str.score +
    0.10 * rev.score +
    0.10 * reg.score -
    pen.penalty;
  const camsScore = Math.round(Math.max(0, Math.min(100, raw)));

  const tier: CamsTier =
    camsScore >= 80 ? 'A_KANDIDAT' :
    camsScore >= 70 ? 'WATCHLIST' :
    camsScore >= 60 ? 'MONITOR' : 'NO_TRADE';

  const setup = detectSetup(p, cat.score >= 40);

  // Entry sipas setup-it
  let entry = p.price;
  if (setup === 'PEAD_CONTINUATION' && p.consolidationHigh > 0) {
    entry = Math.max(p.price, p.consolidationHigh * 1.002); // buy-stop mbi high-in e konsolidimit
  } else if (setup === 'BREAKOUT') {
    entry = Math.max(p.price, p.high20 * 1.002);
  }

  // Stop: më i ngushti nga (swingLow − 0.2 ATR) dhe (entry − 1.5 ATR)
  const stop1 = p.swingLow - 0.2 * p.atr14;
  const stop2 = entry - 1.5 * p.atr14;
  let stop = Math.max(stop1, stop2);
  if (stop >= entry) stop = stop2;

  const risk = entry - stop;
  const target1R = entry + risk;
  const target2R = entry + 2 * risk;
  const target3R = entry + 3 * risk;
  const riskPct = entry > 0 ? (risk / entry) * 100 : 0;

  // Position sizing: 0.5% default; 0.25% kur është volatile/e zgjatur (rregulli PSIG)
  const highRisk = p.atrPct > 4.5 || pen.extensionFiltered;
  const riskBudgetPct = highRisk ? 0.25 : 0.5;
  const riskDollars = accountEquity * (riskBudgetPct / 100);
  const positionSize = risk > 0 ? Math.floor(riskDollars / risk) : 0;
  const positionValue = positionSize * entry;

  const reasons: string[] = [];
  reasons.push(...cat.evidence);
  reasons.push(...acc.parts);
  reasons.push(...str.parts);
  reasons.push(reg.note);
  reasons.push(rev.note);

  const invalidation =
    'Close nën EMA20 me volum të lartë, ose ulja e guidance/narrativës së katalizatorit';

  return {
    symbol: p.symbol,
    catalystScore: cat.score,
    accelerationScore: acc.score,
    structureScore: str.score,
    revisionScore: rev.score,
    regimeScore: reg.score,
    penalty: pen.penalty,
    camsScore,
    tier,
    setup,
    entry: Math.round(entry * 100) / 100,
    stop: Math.round(stop * 100) / 100,
    target1R: Math.round(target1R * 100) / 100,
    target2R: Math.round(target2R * 100) / 100,
    target3R: Math.round(target3R * 100) / 100,
    riskPct: Math.round(riskPct * 100) / 100,
    positionSize,
    positionValue: Math.round(positionValue),
    riskDollars: Math.round(riskDollars),
    riskBudgetPct,
    extensionFiltered: pen.extensionFiltered,
    extensionAtr: Math.round(pen.extensionAtr * 100) / 100,
    reasons,
    warnings: pen.warnings,
    invalidation,
    catalystEvidence: cat.evidence,
  };
}
