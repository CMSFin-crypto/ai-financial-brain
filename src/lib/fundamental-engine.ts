// ============================================================
// Fundamental Analysis Engine
// Scores YahooFundamentals data from -100 to +100
// All descriptions in Albanian
// ============================================================

import type { YahooFundamentals } from '@/lib/alpha-vantage';

export interface FundamentalScore {
  score: number;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  factors: {
    valuation: { score: number; name: string; description: string };
    growth: { score: number; name: string; description: string };
    profitability: { score: number; name: string; description: string };
    financialHealth: { score: number; name: string; description: string };
    analystConsensus: { score: number; name: string; description: string };
  };
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  const result = outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  return clamp(result, Math.min(outMin, outMax), Math.max(outMin, outMax));
}

// ─── Scoring Functions ──────────────────────────────────

function scoreValuation(fund: YahooFundamentals): { score: number; name: string; description: string } {
  let peScore = 0;
  let pegScore = 0;
  let pbScore = 0;
  let fwdDiscountScore = 0;
  let upsideScore = 0;
  const parts: string[] = [];

  // PE ratio scoring
  const pe = fund.trailingPE;
  if (pe > 0) {
    if (pe < 10) {
      peScore = mapRange(pe, 0, 10, 80, 50);
      parts.push(`PE ${pe.toFixed(1)} shumë i ulët — vlerësim i fortë pozitiv`);
    } else if (pe < 20) {
      peScore = mapRange(pe, 10, 20, 50, 20);
      parts.push(`PE ${pe.toFixed(1)} nën mesataren — i nën-vlerësuar`);
    } else if (pe < 30) {
      peScore = mapRange(pe, 20, 30, 20, -10);
      parts.push(`PE ${pe.toFixed(1)} i arsyeshëm`);
    } else if (pe < 40) {
      peScore = mapRange(pe, 30, 40, -10, -40);
      parts.push(`PE ${pe.toFixed(1)} i lartë — i mbër-vlerësuar`);
    } else {
      peScore = clamp(-40 - (pe - 40) * 1.5, -100, -40);
      parts.push(`PE ${pe.toFixed(1)} shumë i lartë — rrezik i madh`);
    }
  }

  // PEG ratio scoring
  const peg = fund.pegRatio;
  if (peg > 0) {
    if (peg < 0.5) {
      pegScore = mapRange(peg, 0, 0.5, 90, 60);
      parts.push(`PEG ${peg.toFixed(2)} shkëlqyer — rritje me çmim të ulët`);
    } else if (peg < 1) {
      pegScore = mapRange(peg, 0.5, 1, 60, 30);
      parts.push(`PEG ${peg.toFixed(2)} i mirë — vlerë e arsyeshme për rritjen`);
    } else if (peg < 2) {
      pegScore = mapRange(peg, 1, 2, 30, -20);
      parts.push(`PEG ${peg.toFixed(2)} i arsyeshëm`);
    } else {
      pegScore = clamp(-20 - (peg - 2) * 20, -100, -20);
      parts.push(`PEG ${peg.toFixed(2)} i lartë — i mbër-vlerësuar në lidhje me rritjen`);
    }
  }

  // Price-to-Book scoring
  const pb = fund.priceToBook;
  if (pb > 0) {
    if (pb < 1) {
      pbScore = mapRange(pb, 0, 1, 80, 40);
      parts.push(`P/B ${pb.toFixed(2)} nën vlerën e librit — i nën-vlerësuar`);
    } else if (pb < 3) {
      pbScore = mapRange(pb, 1, 3, 40, -10);
      parts.push(`P/B ${pb.toFixed(2)} i arsyeshëm`);
    } else if (pb < 5) {
      pbScore = mapRange(pb, 3, 5, -10, -50);
      parts.push(`P/B ${pb.toFixed(2)} i lartë`);
    } else {
      pbScore = clamp(-50 - (pb - 5) * 10, -100, -50);
      parts.push(`P/B ${pb.toFixed(2)} shumë i lartë`);
    }
  }

  // Forward PE discount vs trailing PE
  const fwdPE = fund.forwardPE;
  if (pe > 0 && fwdPE > 0 && fwdPE < pe) {
    const discount = (pe - fwdPE) / pe;
    fwdDiscountScore = clamp(discount * 200, 0, 40);
    parts.push(`Forward PE ${fwdPE.toFixed(1)} ulët se trailing PE — presje pozitive për fitime`);
  } else if (pe > 0 && fwdPE > 0 && fwdPE > pe) {
    const premium = (fwdPE - pe) / pe;
    fwdDiscountScore = clamp(-premium * 200, -40, 0);
    parts.push(`Forward PE ${fwdPE.toFixed(1)} mbi trailing PE — presje negative për fitime`);
  }

  // Upside from analyst target
  const target = fund.targetMeanPrice;
  const price = fund.currentPrice;
  if (target > 0 && price > 0) {
    const upside = ((target - price) / price) * 100;
    upsideScore = clamp(upside * 3, -60, 60);
    if (upside > 0) {
      parts.push(`Upside ${upside.toFixed(1)}% nga qëllimi mesatar i analistëve ($${target.toFixed(2)})`);
    } else {
      parts.push(`Downside ${Math.abs(upside).toFixed(1)}% nga qëllimi mesatar i analistëve`);
    }
  }

  // Weighted average of sub-scores
  const totalScore = clamp(
    peScore * 0.25 + pegScore * 0.20 + pbScore * 0.15 + fwdDiscountScore * 0.15 + upsideScore * 0.25,
    -100, 100
  );

  const description = parts.length > 0
    ? parts.join('. ') + '.'
    : 'Të dhëna të pamjaftueshme për vlerësim.';

  return {
    score: totalScore,
    name: 'Vlerësimi',
    description,
  };
}

function scoreGrowth(fund: YahooFundamentals): { score: number; name: string; description: string } {
  const parts: string[] = [];
  let revScore = 0;
  let epsScore = 0;
  let accelScore = 0;

  // Revenue growth
  const revGrowth = fund.revenueGrowth; // decimal, e.g. 0.095 = 9.5%
  const revPct = revGrowth * 100;
  if (revPct > 20) {
    revScore = mapRange(revPct, 20, 60, 60, 100);
    parts.push(`Rritja e të ardhurave ${revPct.toFixed(1)}% — e shkëlqyer`);
  } else if (revPct > 10) {
    revScore = mapRange(revPct, 10, 20, 30, 60);
    parts.push(`Rritja e të ardhurave ${revPct.toFixed(1)}% — e mirë`);
  } else if (revPct > 0) {
    revScore = mapRange(revPct, 0, 10, -10, 30);
    parts.push(`Rritja e të ardhurave ${revPct.toFixed(1)}% — e dobët`);
  } else {
    revScore = clamp(revPct * 3, -100, -10);
    parts.push(`Të ardhurat në ulje me ${Math.abs(revPct).toFixed(1)}%`);
  }

  // Earnings growth
  const epsGrowth = fund.earningsGrowth;
  const epsPct = epsGrowth * 100;
  if (epsPct > 20) {
    epsScore = mapRange(epsPct, 20, 60, 60, 100);
    parts.push(`Rritja e fitimeve ${epsPct.toFixed(1)}% — e shkëlqyer`);
  } else if (epsPct > 10) {
    epsScore = mapRange(epsPct, 10, 20, 30, 60);
    parts.push(`Rritja e fitimeve ${epsPct.toFixed(1)}% — e mirë`);
  } else if (epsPct > 0) {
    epsScore = mapRange(epsPct, 0, 10, -10, 30);
    parts.push(`Rritja e fitimeve ${epsPct.toFixed(1)}% — e dobët`);
  } else {
    epsScore = clamp(epsPct * 3, -100, -10);
    parts.push(`Fitimet në ulje me ${Math.abs(epsPct).toFixed(1)}%`);
  }

  // Quarterly acceleration
  const revQuarterly = fund.revenueQuarterlyGrowth * 100;
  const epsQuarterly = fund.earningsQuarterlyGrowth * 100;
  if (revQuarterly > revPct && revPct > 0) {
    accelScore = 15;
    parts.push(`Rritja tremujore (${revQuarterly.toFixed(1)}%) mbi atë vjetore — përshpejim pozitiv`);
  } else if (revQuarterly < revPct && revPct > 0) {
    accelScore = -10;
    parts.push(`Rritja tremujore (${revQuarterly.toFixed(1)}%) nën atë vjetore — ngadalësim`);
  }

  const totalScore = clamp(
    revScore * 0.35 + epsScore * 0.45 + accelScore * 0.20,
    -100, 100
  );

  const description = parts.length > 0
    ? parts.join('. ') + '.'
    : 'Të dhëna të pamjaftueshme për rritjen.';

  return {
    score: totalScore,
    name: 'Rritja',
    description,
  };
}

function scoreProfitability(fund: YahooFundamentals): { score: number; name: string; description: string } {
  const parts: string[] = [];
  let grossScore = 0;
  let opScore = 0;
  let roeScore = 0;

  // Gross margins
  const gross = fund.grossMargins * 100;
  if (gross > 50) {
    grossScore = mapRange(gross, 50, 90, 60, 100);
    parts.push(`Marzha bruto ${gross.toFixed(1)}% — e shkëlqyer`);
  } else if (gross > 30) {
    grossScore = mapRange(gross, 30, 50, 20, 60);
    parts.push(`Marzha bruto ${gross.toFixed(1)}% — e mirë`);
  } else if (gross > 0) {
    grossScore = mapRange(gross, 0, 30, -40, 20);
    parts.push(`Marzha bruto ${gross.toFixed(1)}% — e dobët`);
  } else if (gross < 0) {
    grossScore = -80;
    parts.push('Marzha bruto negative — humbje operative');
  }

  // Operating margins
  const op = fund.operatingMargins * 100;
  if (op > 25) {
    opScore = mapRange(op, 25, 50, 60, 100);
    parts.push(`Marzha operative ${op.toFixed(1)}% — e shkëlqyer`);
  } else if (op > 15) {
    opScore = mapRange(op, 15, 25, 20, 60);
    parts.push(`Marzha operative ${op.toFixed(1)}% — e mirë`);
  } else if (op > 0) {
    opScore = mapRange(op, 0, 15, -40, 20);
    parts.push(`Marzha operative ${op.toFixed(1)}% — e dobët`);
  } else {
    opScore = -80;
    parts.push('Marzha operative negative');
  }

  // Return on Equity
  const roe = fund.returnOnEquity * 100;
  if (roe > 25) {
    roeScore = mapRange(roe, 25, 50, 60, 100);
    parts.push(`ROE ${roe.toFixed(1)}% — shkëlqyer, kthim i lartë mbi kapitalin`);
  } else if (roe > 15) {
    roeScore = mapRange(roe, 15, 25, 20, 60);
    parts.push(`ROE ${roe.toFixed(1)}% — i mirë`);
  } else if (roe > 0) {
    roeScore = mapRange(roe, 0, 15, -40, 20);
    parts.push(`ROE ${roe.toFixed(1)}% — i dobët`);
  } else {
    roeScore = -80;
    parts.push('ROE negative — kompania po humb kapital');
  }

  const totalScore = clamp(
    grossScore * 0.30 + opScore * 0.35 + roeScore * 0.35,
    -100, 100
  );

  const description = parts.length > 0
    ? parts.join('. ') + '.'
    : 'Të dhëna të pamjaftueshme për rentabilitetin.';

  return {
    score: totalScore,
    name: 'Rentabiliteti',
    description,
  };
}

function scoreFinancialHealth(fund: YahooFundamentals): { score: number; name: string; description: string } {
  const parts: string[] = [];
  let deScore = 0;
  let daScore = 0;

  // Debt/Equity
  const de = fund.debtToEquity;
  if (de < 30) {
    deScore = mapRange(de, 0, 30, 80, 50);
    parts.push(`D/E ${de.toFixed(1)} — shëndet i fortë financiar, borxh i ulët`);
  } else if (de < 80) {
    deScore = mapRange(de, 30, 80, 50, 0);
    parts.push(`D/E ${de.toFixed(1)} — borxh i moderuar`);
  } else if (de < 150) {
    deScore = mapRange(de, 80, 150, 0, -50);
    parts.push(`D/E ${de.toFixed(1)} — borxh i lartë, rrezik në rritje`);
  } else {
    deScore = clamp(-50 - (de - 150) * 0.3, -100, -50);
    parts.push(`D/E ${de.toFixed(1)} — shumë i lartë, rrezik i madh`);
  }

  // Debt/Assets (derived from totalDebt, totalRevenue as proxy)
  // Since we don't have totalAssets, we approximate using totalDebt vs totalRevenue
  const totalDebt = fund.totalDebt;
  const totalRevenue = fund.totalRevenue;
  if (totalDebt > 0 && totalRevenue > 0) {
    const debtToRevenue = totalDebt / totalRevenue;
    if (debtToRevenue < 0.5) {
      daScore = 40;
      parts.push(`Raporti borxh/ardhura ${debtToRevenue.toFixed(2)} — i ulët`);
    } else if (debtToRevenue < 2) {
      daScore = mapRange(debtToRevenue, 0.5, 2, 40, -20);
      parts.push(`Raporti borxh/ardhura ${debtToRevenue.toFixed(2)} — i moderuar`);
    } else {
      daScore = clamp(-20 - (debtToRevenue - 2) * 10, -100, -20);
      parts.push(`Raporti borxh/ardhura ${debtToRevenue.toFixed(2)} — i lartë`);
    }
  }

  // Cash consideration
  const totalCash = fund.totalCash;
  if (totalCash > 0 && totalDebt > 0) {
    const netDebt = totalDebt - totalCash;
    if (netDebt < 0) {
      daScore = clamp(daScore + 20, -100, 100);
      parts.push('Kasa mbi borxhin — pozicion neto parash');
    }
  }

  const totalScore = clamp(deScore * 0.60 + daScore * 0.40, -100, 100);

  const description = parts.length > 0
    ? parts.join('. ') + '.'
    : 'Të dhëna të pamjaftueshme për shëndetin financiar.';

  return {
    score: totalScore,
    name: 'Shëndeti Financiar',
    description,
  };
}

function scoreAnalystConsensus(fund: YahooFundamentals): { score: number; name: string; description: string } {
  const parts: string[] = [];
  let recScore = 0;
  let confidenceBoost = 0;

  // Recommendation key
  const rec = fund.recommendationKey.toLowerCase().replace(/[_\s-]/g, '');

  if (rec === 'strongbuy') {
    recScore = 90;
    parts.push('Konsensusi i analistëve: BLERJE E FORTË');
  } else if (rec === 'buy') {
    recScore = 65;
    parts.push('Konsensusi i analistëve: BLERJE');
  } else if (rec === 'hold') {
    recScore = 0;
    parts.push('Konsensusi i analistëve: MBAN');
  } else if (rec === 'sell') {
    recScore = -65;
    parts.push('Konsensusi i analistëve: SHITJE');
  } else if (rec === 'strongsell') {
    recScore = -90;
    parts.push('Konsensusi i analistëve: SHITJE E FORTË');
  } else {
    // No recommendation available
    recScore = 0;
    parts.push('Asnjë rekomandim i disponueshëm nga analistët');
  }

  // Number of analysts — more = more confidence (but cap it)
  const numAnalysts = fund.numberOfAnalystOpinions;
  if (numAnalysts >= 20) {
    confidenceBoost = 10;
    parts.push(`${numAnalysts} analistë — besim i lartë në konsensus`);
  } else if (numAnalysts >= 10) {
    confidenceBoost = 5;
    parts.push(`${numAnalysts} analistë — besim i moderuar`);
  } else if (numAnalysts > 0) {
    confidenceBoost = 0;
    parts.push(`Vetëm ${numAnalysts} analistë — besim i ulët`);
  }

  const totalScore = clamp(recScore + confidenceBoost, -100, 100);

  const description = parts.length > 0
    ? parts.join('. ') + '.'
    : 'Të dhëna të pamjaftueshme për konsensusin e analistëve.';

  return {
    score: totalScore,
    name: 'Konsensusi i Analistëve',
    description,
  };
}

// ─── Main Function ──────────────────────────────────────

export function analyzeFundamentals(symbol: string, fund: YahooFundamentals): FundamentalScore {
  const valuation = scoreValuation(fund);
  const growth = scoreGrowth(fund);
  const profitability = scoreProfitability(fund);
  const financialHealth = scoreFinancialHealth(fund);
  const analystConsensus = scoreAnalystConsensus(fund);

  // Weighted combination
  const totalScore = clamp(
    valuation.score * 0.25 +
    growth.score * 0.25 +
    profitability.score * 0.20 +
    financialHealth.score * 0.15 +
    analystConsensus.score * 0.15,
    -100, 100
  );

  let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  if (totalScore > 15) {
    signal = 'BULLISH';
  } else if (totalScore < -15) {
    signal = 'BEARISH';
  } else {
    signal = 'NEUTRAL';
  }

  return {
    score: Math.round(totalScore * 10) / 10,
    signal,
    factors: {
      valuation,
      growth,
      profitability,
      financialHealth,
      analystConsensus,
    },
    timestamp: new Date().toISOString(),
  };
}