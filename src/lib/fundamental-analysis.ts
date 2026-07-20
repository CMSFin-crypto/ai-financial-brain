// ============================================================
// Fundamental Analysis Scorer
// Scores fundamental data from -100 to +100
// Uses YahooFundamentals from alpha-vantage.ts
// ============================================================

import type { YahooFundamentals } from './alpha-vantage';

export interface FundamentalScore {
  score: number;           // -100 to +100
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  name: string;
  description: string;
}

export interface FundamentalResult {
  symbol: string;
  totalScore: number;      // -100 to +100 weighted combination
  scores: {
    valuation: FundamentalScore;
    growth: FundamentalScore;
    profitability: FundamentalScore;
    analystSentiment: FundamentalScore;
    debtHealth: FundamentalScore;
    momentum: FundamentalScore;
  };
  summary: string;
  raw: YahooFundamentals;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return clamp(outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax));
}

/** Score valuation: P/E, Forward P/E, PEG, P/B */
function scoreValuation(f: YahooFundamentals): FundamentalScore {
  let score = 0;
  const factors: string[] = [];

  // P/E ratio scoring
  if (f.trailingPE > 0) {
    if (f.trailingPE < 10) { score += 40; factors.push(`P/E ${f.trailingPE.toFixed(1)} — shumë i lirë`); }
    else if (f.trailingPE < 15) { score += 30; factors.push(`P/E ${f.trailingPE.toFixed(1)} — i arsyeshëm`); }
    else if (f.trailingPE < 25) { score += 10; factors.push(`P/E ${f.trailingPE.toFixed(1)} — normal`); }
    else if (f.trailingPE < 40) { score -= 15; factors.push(`P/E ${f.trailingPE.toFixed(1)} — i shtrenjtë`); }
    else { score -= 35; factors.push(`P/E ${f.trailingPE.toFixed(1)} — shumë i shtrenjtë`); }
  }

  // Forward P/E (should be lower than trailing if growth expected)
  if (f.forwardPE > 0 && f.trailingPE > 0) {
    const fwdDiscount = (f.trailingPE - f.forwardPE) / f.trailingPE;
    if (fwdDiscount > 0.2) { score += 20; factors.push(`Fwd P/E ${f.forwardPE.toFixed(1)} — rritje e pritur e EPS-së`); }
    else if (fwdDiscount > 0) { score += 10; }
    else { score -= 10; factors.push(`Fwd P/E ${f.forwardPE.toFixed(1)} — rritje e ngadaltë e EPS-së`); }
  }

  // PEG ratio
  if (f.pegRatio > 0) {
    if (f.pegRatio < 0.5) { score += 25; factors.push(`PEG ${f.pegRatio.toFixed(2)} — vlerësim shumë i ulët`); }
    else if (f.pegRatio < 1.0) { score += 15; factors.push(`PEG ${f.pegRatio.toFixed(2)} — vlerësim i arsyeshëm`); }
    else if (f.pegRatio < 2.0) { score += 0; }
    else { score -= 20; factors.push(`PEG ${f.pegRatio.toFixed(2)} — i shtrenjtë për rritjen`); }
  }

  // Price to Book
  if (f.priceToBook > 0) {
    if (f.priceToBook < 1) { score += 15; factors.push(`P/B ${f.priceToBook.toFixed(2)} — nën vlerën e librit`); }
    else if (f.priceToBook < 3) { score += 5; }
    else if (f.priceToBook > 8) { score -= 15; factors.push(`P/B ${f.priceToBook.toFixed(2)} — premium i lartë`); }
  }

  score = clamp(score, -100, 100);
  const signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL';
  const impact: 'HIGH' | 'MEDIUM' | 'LOW' = Math.abs(score) > 40 ? 'HIGH' : Math.abs(score) > 15 ? 'MEDIUM' : 'LOW';

  return {
    score,
    signal,
    impact,
    name: 'Vlerësimi (Valuation)',
    description: factors.length > 0 ? factors.join('. ') : 'Të dhëna të pamjaftueshme për vlerësim',
  };
}

/** Score growth: Revenue Growth, EPS Growth */
function scoreGrowth(f: YahooFundamentals): FundamentalScore {
  let score = 0;
  const factors: string[] = [];

  // Revenue growth (annual)
  const revGrowth = f.revenueGrowth * 100; // convert decimal to percent
  if (revGrowth > 0) {
    if (revGrowth > 30) { score += 35; factors.push(`Rritja e të ardhurave ${revGrowth.toFixed(1)}% — shumë e lartë`); }
    else if (revGrowth > 15) { score += 25; factors.push(`Rritja e të ardhurave ${revGrowth.toFixed(1)}% — e fortë`); }
    else if (revGrowth > 5) { score += 15; factors.push(`Rritja e të ardhurave ${revGrowth.toFixed(1)}% — pozitive`); }
    else { score += 5; factors.push(`Rritja e të ardhurave ${revGrowth.toFixed(1)}% — e ulët`); }
  } else if (revGrowth < 0) {
    score -= 25;
    factors.push(`Rritja e të ardhurave ${revGrowth.toFixed(1)}% — negativ`);
  }

  // Earnings growth (annual)
  const epsGrowth = f.earningsGrowth * 100;
  if (epsGrowth > 0) {
    if (epsGrowth > 30) { score += 35; factors.push(`Rritja e fitimeve ${epsGrowth.toFixed(1)}% — shumë e lartë`); }
    else if (epsGrowth > 15) { score += 25; factors.push(`Rritja e fitimeve ${epsGrowth.toFixed(1)}% — e fortë`); }
    else if (epsGrowth > 5) { score += 15; }
    else { score += 5; }
  } else if (epsGrowth < 0) {
    score -= 25;
    factors.push(`Rritja e fitimeve ${epsGrowth.toFixed(1)}% — negativ`);
  }

  // Quarterly growth bonus (more recent signal)
  const qRev = f.revenueQuarterlyGrowth * 100;
  const qEps = f.earningsQuarterlyGrowth * 100;
  if (qRev > 10) { score += 10; factors.push(`Rritja tremujore e të ardhurave ${qRev.toFixed(1)}%`); }
  if (qEps > 10) { score += 10; factors.push(`Rritja tremujore e fitimeve ${qEps.toFixed(1)}%`); }
  if (qRev < -5) { score -= 10; }
  if (qEps < -5) { score -= 10; }

  score = clamp(score, -100, 100);
  const signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL';
  const impact: 'HIGH' | 'MEDIUM' | 'LOW' = Math.abs(score) > 40 ? 'HIGH' : Math.abs(score) > 15 ? 'MEDIUM' : 'LOW';

  return {
    score,
    signal,
    impact,
    name: 'Rritja (Growth)',
    description: factors.length > 0 ? factors.join('. ') : 'Të dhëna të pamjaftueshme për rritjen',
  };
}

/** Score profitability: Margins, ROE, FCF */
function scoreProfitability(f: YahooFundamentals): FundamentalScore {
  let score = 0;
  const factors: string[] = [];

  // Gross margins
  const gm = f.grossMargins * 100;
  if (gm > 60) { score += 20; factors.push(`Marzhi bruto ${gm.toFixed(1)}% — shumë i lartë`); }
  else if (gm > 40) { score += 12; factors.push(`Marzhi bruto ${gm.toFixed(1)}%`); }
  else if (gm > 20) { score += 5; }
  else if (gm > 0) { score -= 5; factors.push(`Marzhi bruto ${gm.toFixed(1)}% — i ulët`); }

  // Operating margins
  const om = f.operatingMargins * 100;
  if (om > 25) { score += 20; factors.push(`Marzhi operativ ${om.toFixed(1)}% — shumë i lartë`); }
  else if (om > 15) { score += 12; factors.push(`Marzhi operativ ${om.toFixed(1)}%`); }
  else if (om > 5) { score += 5; }
  else if (om > 0) { score -= 5; }
  else { score -= 15; factors.push(`Marzhi operativ negativ ${om.toFixed(1)}%`); }

  // Profit margins
  const pm = f.profitMargins * 100;
  if (pm > 15) { score += 15; }
  else if (pm > 5) { score += 5; }
  else if (pm <= 0) { score -= 15; factors.push(`Marzhi i fitimit negativ`); }

  // ROE
  const roe = f.returnOnEquity * 100;
  if (roe > 25) { score += 20; factors.push(`ROE ${roe.toFixed(1)}% — shkëlqyer`); }
  else if (roe > 15) { score += 12; factors.push(`ROE ${roe.toFixed(1)}% — i mirë`); }
  else if (roe > 5) { score += 5; }
  else if (roe <= 0) { score -= 15; factors.push(`ROE negativ ${roe.toFixed(1)}%`); }

  // FCF (as positive signal if > 0)
  if (f.freeCashflow > 0 && f.totalRevenue > 0) {
    const fcfMargin = (f.freeCashflow / f.totalRevenue) * 100;
    if (fcfMargin > 10) { score += 15; factors.push(`FCF margin ${fcfMargin.toFixed(1)}% — i fortë`); }
    else if (fcfMargin > 3) { score += 8; }
  } else if (f.freeCashflow < 0) {
    score -= 10;
    factors.push('FCF negativ');
  }

  score = clamp(score, -100, 100);
  const signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL';
  const impact: 'HIGH' | 'MEDIUM' | 'LOW' = Math.abs(score) > 40 ? 'HIGH' : Math.abs(score) > 15 ? 'MEDIUM' : 'LOW';

  return {
    score,
    signal,
    impact,
    name: 'Fitueshmëria (Profitability)',
    description: factors.length > 0 ? factors.join('. ') : 'Të dhëna të pamjaftueshme për fitueshmëri',
  };
}

/** Score analyst sentiment: Target price, recommendation */
function scoreAnalystSentiment(f: YahooFundamentals): FundamentalScore {
  let score = 0;
  const factors: string[] = [];

  // Analyst target upside
  if (f.targetMeanPrice > 0 && f.currentPrice > 0) {
    const upside = ((f.targetMeanPrice - f.currentPrice) / f.currentPrice) * 100;
    if (upside > 30) { score += 40; factors.push(`Upside ${upside.toFixed(1)}% — shumë potencial`); }
    else if (upside > 15) { score += 25; factors.push(`Upside ${upside.toFixed(1)}% — potencial i mirë`); }
    else if (upside > 5) { score += 10; factors.push(`Upside ${upside.toFixed(1)}%`); }
    else if (upside > -5) { score += 0; }
    else { score -= 25; factors.push(`Upside ${upside.toFixed(1)}% — mbi vlerësimin`); }

    // Consensus range
    if (f.targetLowPrice > 0 && f.targetHighPrice > 0) {
      const range = ((f.targetHighPrice - f.targetLowPrice) / f.currentPrice) * 100;
      if (range > 60) { score -= 5; factors.push('Paqartësi e lartë në targetet e analistëve'); }
    }
  }

  // Recommendation key
  const rec = (f.recommendationKey || '').toLowerCase();
  if (rec === 'strong_buy') { score += 30; factors.push('Konsensusi: Blerje e Fortë'); }
  else if (rec === 'buy') { score += 20; factors.push('Konsensusi: Blerje'); }
  else if (rec === 'hold') { score += 0; }
  else if (rec === 'sell') { score -= 20; factors.push('Konsensusi: Shitje'); }
  else if (rec === 'strong_sell') { score -= 30; factors.push('Konsensusi: Shitje e Fortë'); }

  // Number of analysts (more = more reliable)
  if (f.numberOfAnalystOpinions >= 20) { factors.push(`${f.numberOfAnalystOpinions} analistë`); }
  else if (f.numberOfAnalystOpinions > 0) { factors.push(`${f.numberOfAnalystOpinions} analistë — kujdes`); }

  score = clamp(score, -100, 100);
  const signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL';
  const impact: 'HIGH' | 'MEDIUM' | 'LOW' = Math.abs(score) > 40 ? 'HIGH' : Math.abs(score) > 15 ? 'MEDIUM' : 'LOW';

  return {
    score,
    signal,
    impact,
    name: 'Sentimenti i Analistëve',
    description: factors.length > 0 ? factors.join('. ') : 'Pa të dhëna nga analistët',
  };
}

/** Score debt health: Debt/Equity, Debt vs Cash */
function scoreDebtHealth(f: YahooFundamentals): FundamentalScore {
  let score = 0;
  const factors: string[] = [];

  // Debt to Equity
  if (f.debtToEquity > 0) {
    if (f.debtToEquity < 20) { score += 20; factors.push(`D/E ${f.debtToEquity.toFixed(0)} — shumë i ulët`); }
    else if (f.debtToEquity < 50) { score += 10; factors.push(`D/E ${f.debtToEquity.toFixed(0)} — i shëndetshëm`); }
    else if (f.debtToEquity < 100) { score += 0; factors.push(`D/E ${f.debtToEquity.toFixed(0)} — moderat`); }
    else if (f.debtToEquity < 200) { score -= 15; factors.push(`D/E ${f.debtToEquity.toFixed(0)} — i lartë`); }
    else { score -= 30; factors.push(`D/E ${f.debtToEquity.toFixed(0)} — shumë i lartë`); }
  }

  // Cash vs Debt
  if (f.totalCash > 0 && f.totalDebt > 0) {
    const cashToDebt = f.totalCash / f.totalDebt;
    if (cashToDebt > 1) { score += 20; factors.push('Kash më shumë se borxhi — bilanc i fortë'); }
    else if (cashToDebt > 0.5) { score += 10; }
    else if (cashToDebt < 0.2) { score -= 15; factors.push('Kash i ulët ndaj borxhit'); }
  } else if (f.totalDebt > 0 && f.totalCash === 0) {
    score -= 10;
  }

  score = clamp(score, -100, 100);
  const signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL';
  const impact: 'HIGH' | 'MEDIUM' | 'LOW' = Math.abs(score) > 30 ? 'HIGH' : Math.abs(score) > 10 ? 'MEDIUM' : 'LOW';

  return {
    score,
    signal,
    impact,
    name: 'Shëndeti i Borxhit',
    description: factors.length > 0 ? factors.join('. ') : 'Pa të dhëna të borxhit',
  };
}

/** Score earnings momentum: Forward EPS, recent surprises */
function scoreEarningsMomentum(f: YahooFundamentals): FundamentalScore {
  let score = 0;
  const factors: string[] = [];

  // Forward EPS exists
  if (f.epsForward > 0) {
    factors.push(`EPS i ardhshëm $${f.epsForward.toFixed(2)}`);
    score += 10;
  }

  // Earnings surprise (quarterly)
  const qSurprise = f.earningsQuarterlyGrowth * 100;
  if (qSurprise > 5) { score += 25; factors.push(`Surprizë pozitive ${qSurprise.toFixed(1)}%`); }
  else if (qSurprise > 0) { score += 12; }
  else if (qSurprise < -5) { score -= 25; factors.push(`Surprizë negative ${qSurprise.toFixed(1)}%`); }
  else if (qSurprise < 0) { score -= 12; }

  // Revenue surprise
  const rSurprise = f.revenueQuarterlyGrowth * 100;
  if (rSurprise > 10) { score += 15; factors.push(`Të ardhura mbi pritjet ${rSurprise.toFixed(1)}%`); }
  else if (rSurprise > 0) { score += 5; }
  else if (rSurprise < -5) { score -= 15; }

  score = clamp(score, -100, 100);
  const signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL';
  const impact: 'HIGH' | 'MEDIUM' | 'LOW' = Math.abs(score) > 30 ? 'HIGH' : Math.abs(score) > 10 ? 'MEDIUM' : 'LOW';

  return {
    score,
    signal,
    impact,
    name: 'Momentumi i Fitimeve',
    description: factors.length > 0 ? factors.join('. ') : 'Pa të dhëna',
  };
}

/** Main function: Score all fundamentals and return combined result */
export function analyzeFundamentals(symbol: string, fund: YahooFundamentals): FundamentalResult {
  const scores = {
    valuation: scoreValuation(fund),
    growth: scoreGrowth(fund),
    profitability: scoreProfitability(fund),
    analystSentiment: scoreAnalystSentiment(fund),
    debtHealth: scoreDebtHealth(fund),
    momentum: scoreEarningsMomentum(fund),
  };

  // Weighted combination
  const weights = {
    valuation: 0.15,
    growth: 0.25,
    profitability: 0.15,
    analystSentiment: 0.20,
    debtHealth: 0.10,
    momentum: 0.15,
  };

  let totalScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const s = scores[key as keyof typeof scores]?.score ?? 0;
    totalScore += s * weight;
  }
  totalScore = clamp(Math.round(totalScore * 100) / 100, -100, 100);

  // Build summary
  const positives: string[] = [];
  const negatives: string[] = [];
  for (const s of Object.values(scores)) {
    if (s.score > 15) positives.push(s.name);
    if (s.score < -15) negatives.push(s.name);
  }

  let summary = '';
  if (totalScore > 30) {
    summary = `Fundamentet janë pozitive. ${positives.length > 0 ? 'Pikë të forta: ' + positives.join(', ') + '.' : ''}`;
    if (negatives.length > 0) summary += ` Kujdes: ${negatives.join(', ')}.`;
  } else if (totalScore < -30) {
    summary = `Fundamentet janë negative. ${negatives.length > 0 ? 'Probleme: ' + negatives.join(', ') + '.' : ''}`;
    if (positives.length > 0) summary += ` Pikë pozitive: ${positives.join(', ')}.`;
  } else {
    summary = 'Fundamentet janë të përziera. Asnjë sinjal i qartë fundamental.';
  }

  return { symbol, totalScore, scores, summary, raw: fund };
}