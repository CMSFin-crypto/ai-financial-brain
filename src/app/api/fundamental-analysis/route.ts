import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStock, type StockProfile } from '@/lib/market-data';
import { getRealPrice, injectPricesIntoPrompt, getRealFundamentals, type YahooFundamentals } from '@/lib/alpha-vantage';

interface FundamentalAnalysisRequest {
  ticker: string;
  company?: string;
}

const SYSTEM_PROMPT = `You are an expert fundamental analyst. Perform a deep fundamental analysis of the given stock.

You MUST respond ONLY with a valid JSON object (no markdown, no code blocks):

{
  "ticker": "AAPL",
  "company": "Apple Inc.",
  "sector": "Technology",
  "industry": "Consumer Electronics",
  "overallRating": "STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL",
  "score": 85,
  "valuation": {
    "marketCap": "3.0T",
    "peRatio": 31.5,
    "forwardPE": 28.2,
    "pegRatio": 1.8,
    "priceToSales": 7.8,
    "priceToBook": 45.2,
    "evToEBITDA": 25.1,
    "dividendYield": "0.55%",
    "rating": "FAIRLY_VALUED|OVERVALUED|UNDERVALUED",
    "summary": "Brief valuation assessment"
  },
  "profitability": {
    "grossMargin": "44.1%",
    "operatingMargin": "29.8%",
    "netMargin": "25.3%",
    "returnOnEquity": "147.9%",
    "returnOnAssets": "28.4%",
    "returnOnInvestment": "36.5%",
    "rating": "EXCELLENT|GOOD|AVERAGE|POOR",
    "summary": "Brief profitability assessment"
  },
  "growth": {
    "revenueGrowth": "8.1%",
    "earningsGrowth": "12.5%",
    "revenueGrowth3Y": "10.2%",
    "earningsGrowth3Y": "15.8%",
    "quarterlyRevenueGrowth": "6.2%",
    "quarterlyEarningsGrowth": "10.8%",
    "rating": "STRONG|MODERATE|WEAK",
    "summary": "Brief growth assessment"
  },
  "financialHealth": {
    "currentRatio": 1.05,
    "quickRatio": 0.99,
    "debtToEquity": 1.72,
    "debtToAssets": 0.35,
    "freeCashFlow": "110.5B",
    "rating": "STRONG|MODERATE|WEAK",
    "summary": "Brief financial health assessment"
  },
  "earnings": {
    "eps": "6.42",
    "epsGrowth": "12.5%",
    "forwardEps": "7.15",
    "nextEarningsDate": "2026-07-22",
    "surprises": [
      {"quarter": "Q1 2026", "expected": "2.10", "actual": "2.18", "surprise": "+3.8%"}
    ],
    "rating": "STRONG|MODERATE|WEAK",
    "summary": "Brief earnings assessment"
  },
  "competitiveAdvantage": {
    "moat": "WIDE|NARROW|NONE",
    "brandStrength": 9,
    "marketPosition": "Dominant leader in consumer electronics with strong ecosystem lock-in",
    "keyStrengths": ["Brand loyalty", "Ecosystem", "Innovation", "Cash reserves"],
    "keyWeaknesses": ["Premium pricing limits TAM", "China dependency", "Regulatory pressure"]
  },
  "analystConsensus": {
    "rating": "BUY",
    "targetPrice": "220.00",
    "lowTarget": "195.00",
    "highTarget": "250.00",
    "buyRatings": 28,
    "holdRatings": 8,
    "sellRatings": 2,
    "averageRating": 4.2
  },
  "summary": "2-3 sentence overall fundamental analysis summary",
  "verdict": "Is this stock fundamentally sound? What's the investment thesis?",
  "risks": ["Key risk 1", "Key risk 2", "Key risk 3"]
}

CRITICAL DATA RULES (non-negotiable):
1. The numeric values in the JSON example above are PLACEHOLDERS for structure only — NEVER copy them into your answer.
2. For every metric listed in the "REAL FUNDAMENTAL DATA" section of the user message, you MUST use those EXACT numbers. Do NOT substitute your own remembered values.
3. nextEarningsDate MUST be a FUTURE date (after today). Use the date from the real data section when provided.
4. marketCap, peRatio, forwardPE, targetPrice and all price-derived metrics MUST be consistent with the current real price provided.
5. Fields NOT covered by the real data section (P/S, ROA, ROI, dividend yield, 3-year averages, surprises) — estimate from your knowledge, but keep them consistent with the real data provided.`;

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// ═══════════════════════════════════════════

// Stock profiles now imported from centralized market-data module

function generateDemoFundamentalAnalysis(ticker: string, company?: string, livePriceNum?: number | null) {
  const t = ticker.toUpperCase();
  const raw = getStock(t);
  const p = raw ? {
    company: raw.company, sector: raw.sector, industry: raw.industry,
    price: raw.price, shares: raw.shares,
    pe: raw.pe, fwdPE: raw.fwdPE, peg: raw.peg, ps: raw.ps, pb: raw.pb, evEbitda: raw.evEbitda, divYield: raw.divYield,
    grossMargin: raw.grossMargin, opMargin: raw.opMargin, netMargin: raw.netMargin,
    roe: raw.roe, roa: raw.roa, roi: ((parseFloat(raw.roa) || 0) * 1.3).toFixed(1) + '%',
    revGrowth: raw.revGrowth, epsGrowth: raw.epsGrowth, revGrowth3Y: raw.revGrowth3Y, epsGrowth3Y: raw.epsGrowth3Y,
    qRevGrowth: raw.qRevGrowth, qEpsGrowth: raw.qEpsGrowth,
    currentRatio: raw.currentRatio, quickRatio: raw.quickRatio, debtEq: raw.debtEq, debtAssets: raw.debtAssets,
    fcf: raw.fcf, eps: raw.eps, fwdEps: raw.fwdEps,
    moat: raw.moat, brandStrength: raw.brandStrength,
    rating: raw.rating, targetPrice: raw.targetPrice, lowTarget: raw.lowTarget, highTarget: raw.highTarget,
    buyCount: raw.buyCount, holdCount: raw.holdCount, sellCount: raw.sellCount,
    strengths: raw.strengths, weaknesses: raw.weaknesses,
    position: raw.position,
  } : {
    company: company || t + ' Corp', sector: 'Technology', industry: 'General',
    price: 0, shares: 1000,
    pe: 22, fwdPE: 19, peg: 1.5, ps: 5, pb: 8, evEbitda: 15, divYield: '1.2%',
    grossMargin: '35%', opMargin: '22%', netMargin: '15%', roe: '25%', roa: '10%', roi: '18%',
    revGrowth: '10%', epsGrowth: '12%', revGrowth3Y: '11%', epsGrowth3Y: '14%',
    qRevGrowth: '9%', qEpsGrowth: '11%',
    currentRatio: 1.5, quickRatio: 1.2, debtEq: 0.5, debtAssets: 0.2,
    fcf: '5.0B', eps: '6.82', fwdEps: '7.89',
    moat: 'NARROW' as const, brandStrength: 6,
    rating: 'HOLD' as const, targetPrice: '175.00', lowTarget: '140.00', highTarget: '200.00',
    buyCount: 15, holdCount: 12, sellCount: 5,
    strengths: ['Pozicion në treg', 'Produkte konkurruese'],
    weaknesses: ['Konkurrencë', 'Rritje mesatare'],
    position: 'Aktiv me pozicion të mirë por konkurrencë aktive',
  };

  // CRITICAL: Use live price if available, otherwise use market-data price
  // Guard: prevent $0 price
  const rawPrice = (livePriceNum && livePriceNum > 0) ? livePriceNum : p.price;
  const effectivePrice = rawPrice > 0 ? rawPrice : 100;

  const valuationRating = p.pe > 50 ? 'OVERVALUED' : p.pe > 30 ? 'FAIRLY_VALUED' : 'UNDERVALUED';
  const profitRating = parseFloat(p.grossMargin) > 50 ? 'EXCELLENT' : parseFloat(p.grossMargin) > 30 ? 'GOOD' : 'AVERAGE';
  const growthRating = parseFloat(p.revGrowth) > 20 ? 'STRONG' : parseFloat(p.revGrowth) > 5 ? 'MODERATE' : 'WEAK';
  const healthRating = p.debtEq < 0.5 ? 'STRONG' : p.debtEq < 1 ? 'MODERATE' : 'WEAK';
  const earnRating = parseFloat(p.epsGrowth) > 15 ? 'STRONG' : parseFloat(p.epsGrowth) > 5 ? 'MODERATE' : 'WEAK';

  const score = p.rating === 'STRONG_BUY' ? 85 + Math.floor(Math.random() * 10) :
    p.rating === 'BUY' ? 72 + Math.floor(Math.random() * 10) :
    p.rating === 'HOLD' ? 50 + Math.floor(Math.random() * 12) :
    30 + Math.floor(Math.random() * 10);

  // shares është në MILIONA aksione (p.sh. AAPL 15280 = 15.28 miliardë) — prandaj × 1e6
  const marketCap = effectivePrice * p.shares * 1e6;
  const marketCapStr = marketCap > 1e12 ? `$${(marketCap / 1e12).toFixed(1)}T` :
    marketCap > 1e9 ? `$${(marketCap / 1e9).toFixed(0)}B` : `$${(marketCap / 1e6).toFixed(0)}M`;

  return {
    ticker: t,
    company: p.company,
    sector: p.sector,
    industry: p.industry,
    overallRating: p.rating,
    score,
    isDemo: true,
    valuation: {
      marketCap: marketCapStr,
      peRatio: p.pe,
      forwardPE: p.fwdPE,
      pegRatio: p.peg,
      priceToSales: p.ps,
      priceToBook: p.pb,
      evToEBITDA: p.evEbitda,
      dividendYield: p.divYield,
      rating: valuationRating,
      summary: valuationRating === 'OVERVALUED'
        ? `P/E ${p.pe} duket i lartë në krahasim me mesataren e sektorit. Nëse rritja nuk mbështet vlerësimin, mund të ketë kompresim.`
        : valuationRating === 'UNDERVALUED'
          ? `P/E ${p.pe} nën mesataren e sektorit, duke treguar vlerësim tërheqës relativisht. Mund të jetë mundësi blerjeje.`
          : `P/E ${p.pe} në linjë me mesataren e sektorit. Vlerësimi duket i arsyeshëm bazuar në rritjen aktuale.`,
    },
    profitability: {
      grossMargin: p.grossMargin,
      operatingMargin: p.opMargin,
      netMargin: p.netMargin,
      returnOnEquity: p.roe,
      returnOnAssets: p.roa,
      returnOnInvestment: p.roi,
      rating: profitRating,
      summary: profitRating === 'EXCELLENT'
        ? `Marzha brilante me ${p.grossMargin} bruto dhe ${p.opMargin} operative. Rezultatet superiore në të gjitha matësit e rentabilitetit.`
        : `Marzha ${p.grossMargin} bruto me ${p.opMargin} operative. Performancë ${profitRating.toLowerCase()} nëse krahasohet me sektorin.`,
    },
    growth: {
      revenueGrowth: p.revGrowth,
      earningsGrowth: p.epsGrowth,
      revenueGrowth3Y: p.revGrowth3Y,
      earningsGrowth3Y: p.epsGrowth3Y,
      quarterlyRevenueGrowth: p.qRevGrowth,
      quarterlyEarningsGrowth: p.qEpsGrowth,
      rating: growthRating,
      summary: growthRating === 'STRONG'
        ? `Rritje e shpejtë me ${p.revGrowth} në të ardhura dhe ${p.epsGrowth} në fitime. Trendi 3-vjeçar konfirmon momentum të fortë.`
        : `Rritje ${growthRating.toLowerCase()} me ${p.revGrowth} në të ardhura. Konsistent por jo eksploziv.`,
    },
    financialHealth: {
      currentRatio: p.currentRatio,
      quickRatio: p.quickRatio,
      debtToEquity: p.debtEq,
      debtToAssets: p.debtAssets,
      freeCashFlow: `$${p.fcf}`,
      rating: healthRating,
      summary: healthRating === 'STRONG'
        ? `Bilanc i fortë me raport borxh/ekuitet ${p.debtEq} dhe free cash flow $${p.fcf}. Pozicion financiar i shëndetshëm.`
        : healthRating === 'WEAK'
          ? `Raport borxh/ekuitet ${p.debtEq} relativisht i lartë. Kujdes i nevojshëm për shkak të detyrimeve.`
          : `Bilanc i moderuar me ${p.debtEq} borxh/ekuitet. Cash flow i mjaftueshëm për operacionet.`,
    },
    earnings: {
      eps: p.eps,
      epsGrowth: p.epsGrowth,
      forwardEps: p.fwdEps,
      nextEarningsDate: '2026-07-22',
      surprises: [
        { quarter: 'Q1 2026', expected: p.eps, actual: (parseFloat(p.eps) * 1.04).toFixed(2), surprise: '+4.0%' },
        { quarter: 'Q4 2025', expected: p.eps, actual: (parseFloat(p.eps) * 1.02).toFixed(2), surprise: '+2.5%' },
      ],
      rating: earnRating,
      summary: earnRating === 'STRONG'
        ? `EPS $${p.eps} me rritje ${p.epsGrowth} dhe surpriza pozitive në 2 tremujorët e fundit. Trendi fitimor pozitiv.`
        : `EPS $${p.eps} me rritje ${p.epsGrowth}. Konsistent por pa surpriza të mëdha.`,
    },
    competitiveAdvantage: {
      moat: p.moat,
      brandStrength: p.brandStrength,
      marketPosition: p.position,
      keyStrengths: p.strengths,
      keyWeaknesses: p.weaknesses,
    },
    analystConsensus: {
      rating: p.rating,
      targetPrice: p.targetPrice,
      lowTarget: p.lowTarget,
      highTarget: p.highTarget,
      buyRatings: p.buyCount,
      holdRatings: p.holdCount,
      sellRatings: p.sellCount,
      averageRating: +(4.2 - (p.rating === 'HOLD' ? 0.5 : 0)).toFixed(1),
    },
    summary: `${p.company} tregon vlerësim ${valuationRating.toLowerCase()} me ${p.revGrowth} rritje të ardhurash dhe marzhë operative ${p.opMargin}. ${p.moat === 'WIDE' ? 'Avantazhi konkurrues i gjerë mbështet pozicionin afatgjatë.' : 'Avantazhi konkurrues i kufizuar kërkon vëmendje të veçantë.'} Konsensusi i analistëve është ${p.rating} me target $${p.targetPrice}.`,
    verdict: p.rating === 'STRONG_BUY' || p.rating === 'BUY'
      ? `${p.company} duket thellësisht e shëndetshme nga pikëpamja fundamentale. Rritja ${p.revGrowth}, marzha operative brilante, dhe ${p.moat.toLowerCase()} moat krijojnë tezë investimi të fortë. Mundësia e blerjes afatgjatë.`
      : `${p.company} tregon figurë fundamentale ${p.rating.toLowerCase()}. Vlerësimi është ${valuationRating.toLowerCase()} me rritje të moderuar. Prisni një moment më të mirë ose kërkojnë konfirmim teknik.`,
    risks: [
      p.pe > 30 ? `Vlerësim premium me P/E ${p.pe}` : 'Rritje e ngadalshme mund të limitojë performancën',
      'Rreziqe gjeopolitike që mund të prejnë zinxhirët e furnizimit',
      p.debtEq > 1 ? `Borxhi relativisht i lartë me raport ${p.debtEq}` : 'Ndryshime rregullatore në sektor',
    ],
  };
}

export const maxDuration = 60;

// ═══════════════════════════════════════════
// REAL DATA HELPERS — injektim në prompt + mbivendosje e përgjigjes
// (Pa këta, AI kthen vlera nga kujtesa e vjetër e modelit: P/E të gabuar,
//  datë fitimesh që ka kaluar, targete analistësh të vjetruara.)
// ═══════════════════════════════════════════

function formatBigMoney(n: number): string {
  return n >= 1e12 ? `$${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(0)}M`;
}

// Yahoo kthen D/E në përqindje (172 = 1.72); JSON-lokali e mban si raport (0.8) — normalizoje
function deRatio(f: YahooFundamentals): number {
  if (f.debtToEquity <= 0) return 0;
  return f.source.startsWith('yahoo') ? f.debtToEquity / 100 : f.debtToEquity;
}

/** Shkallëzo raportet e varura nga çmimi (P/E, P/B, EV/EBITDA...) me çmimin live.
 *  Të dhënat nga snapshot-i lokal kanë çmimin e dikurshëm — p.sh. AAPL: P/E 37.2 @ $307,
 *  por çmimi live është $336 → P/E real i tani = 37.2 × 336/307 = 40.7.
 *  Targetet e analistëve NUK shkallëzohen (janë mendime, jo funksione të çmimit). */
function adjustFundamentalsToLivePrice(f: YahooFundamentals, livePrice: number | null): YahooFundamentals {
  if (!livePrice || livePrice <= 0 || f.currentPrice <= 0) return f;
  const scale = livePrice / f.currentPrice;
  if (Math.abs(scale - 1) < 0.01) return f; // brenda 1% — s'ka nevojë
  return {
    ...f,
    currentPrice: livePrice,
    trailingPE: f.trailingPE > 0 ? f.trailingPE * scale : f.trailingPE,
    forwardPE: f.forwardPE > 0 ? f.forwardPE * scale : f.forwardPE,
    pegRatio: f.pegRatio > 0 ? f.pegRatio * scale : f.pegRatio,
    priceToBook: f.priceToBook > 0 ? f.priceToBook * scale : f.priceToBook,
    enterpriseToEbitda: f.enterpriseToEbitda > 0 ? f.enterpriseToEbitda * scale : f.enterpriseToEbitda,
    marketCap: f.marketCap && f.marketCap > 0 ? f.marketCap * scale : f.marketCap,
  };
}

/** Shton bllokun e të dhënave reale në prompt që AI mos të gjejë nga kujtesa e vjetër */
function buildFundamentalsContext(userMessage: string, f: YahooFundamentals): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const lines: string[] = [];
  if (f.currentPrice > 0) lines.push(`- Current price: $${f.currentPrice.toFixed(2)}`);
  if (f.trailingPE > 0) lines.push(`- Trailing P/E: ${f.trailingPE.toFixed(1)}`);
  if (f.forwardPE > 0) lines.push(`- Forward P/E: ${f.forwardPE.toFixed(1)}`);
  if (f.pegRatio > 0) lines.push(`- PEG: ${f.pegRatio.toFixed(2)}`);
  if (f.priceToBook > 0) lines.push(`- P/B: ${f.priceToBook.toFixed(1)}`);
  if (f.enterpriseToEbitda > 0) lines.push(`- EV/EBITDA: ${f.enterpriseToEbitda.toFixed(1)}`);
  if (f.grossMargins > 0) lines.push(`- Gross margin: ${pct(f.grossMargins)}`);
  if (f.operatingMargins > 0) lines.push(`- Operating margin: ${pct(f.operatingMargins)}`);
  if (f.profitMargins > 0) lines.push(`- Net margin: ${pct(f.profitMargins)}`);
  if (f.revenueGrowth > 0) lines.push(`- Revenue growth: ${pct(f.revenueGrowth)}`);
  if (f.earningsGrowth > 0) lines.push(`- Earnings growth: ${pct(f.earningsGrowth)}`);
  if (f.revenueQuarterlyGrowth > 0) lines.push(`- Quarterly revenue growth: ${pct(f.revenueQuarterlyGrowth)}`);
  if (f.earningsQuarterlyGrowth > 0) lines.push(`- Quarterly earnings growth: ${pct(f.earningsQuarterlyGrowth)}`);
  if (f.returnOnEquity > 0) lines.push(`- ROE: ${pct(f.returnOnEquity)}`);
  const de = deRatio(f);
  if (de > 0) lines.push(`- Debt/Equity: ${de.toFixed(2)}`);
  if (f.freeCashflow > 0) lines.push(`- Free cash flow: ${formatBigMoney(f.freeCashflow)}`);
  if (f.epsForward > 0) lines.push(`- Forward EPS: $${f.epsForward.toFixed(2)}`);
  if (f.currentPrice > 0 && f.trailingPE > 0) lines.push(`- Trailing EPS: $${(f.currentPrice / f.trailingPE).toFixed(2)}`);
  if (f.nextEarningsDate) lines.push(`- Next earnings date: ${f.nextEarningsDate}`);
  if (f.targetMeanPrice > 0) {
    lines.push(`- Analyst mean target: $${f.targetMeanPrice.toFixed(2)}` +
      (f.targetLowPrice > 0 ? ` (low $${f.targetLowPrice.toFixed(2)}` : '') +
      (f.targetHighPrice > 0 ? ` / high $${f.targetHighPrice.toFixed(2)})` : ''));
  }
  if (f.recommendationKey) {
    lines.push(`- Analyst consensus rating: ${f.recommendationKey}` + (f.numberOfAnalystOpinions > 0 ? ` (${f.numberOfAnalystOpinions} analysts)` : ''));
  }

  if (lines.length === 0) return userMessage;

  return userMessage + `\n\n═══ REAL FUNDAMENTAL DATA (live market data, source: ${f.source}) ═══\n` +
    `CRITICAL: These are the CURRENT, VERIFIED values for this ticker. Use them EXACTLY for the corresponding JSON fields.\n` +
    `Do NOT use remembered or outdated values for any metric listed here.\n\n` +
    lines.join('\n') +
    `\n\nFor metrics NOT listed above, estimate from your knowledge but keep them consistent with these real numbers.`;
}

/** Mbivendos fushat e AI-s me të dhëna reale — kjo është rrjeta e sigurisë përfundimtare kundër halucinacioneve */
function applyRealFundamentals(
  analysis: Record<string, unknown> | null | undefined,
  f: YahooFundamentals,
  livePriceNum: number | null,
): void {
  if (!analysis || typeof analysis !== 'object') return;

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const r1 = (v: number) => +v.toFixed(1);
  const price = livePriceNum && livePriceNum > 0 ? livePriceNum : (f.currentPrice > 0 ? f.currentPrice : 0);
  const tickerForShares = String(analysis.ticker || '').toUpperCase();
  const raw = getStock(tickerForShares);

  // ── Valuation ──
  const v = analysis.valuation as Record<string, unknown> | undefined;
  if (v && typeof v === 'object') {
    if (f.trailingPE > 0) v.peRatio = r1(f.trailingPE);
    if (f.forwardPE > 0) v.forwardPE = r1(f.forwardPE);
    if (f.pegRatio > 0) v.pegRatio = +f.pegRatio.toFixed(2);
    if (f.priceToBook > 0) v.priceToBook = r1(f.priceToBook);
    if (f.enterpriseToEbitda > 0) v.evToEbitda = r1(f.enterpriseToEbitda);
    // P/S: (1) nga të ardhura reale kur ka, (2) tjetër P/E × NetMargin (matematikisht e saktë)
    if (price > 0 && f.totalRevenue > 0 && raw?.shares) {
      v.priceToSales = r1((price * raw.shares * 1e6) / f.totalRevenue);
    } else if (f.trailingPE > 0 && f.profitMargins > 0) {
      v.priceToSales = r1(f.trailingPE * f.profitMargins);
    }
    // Market Cap: (1) çmim live × shares, (2) snapshot lokal i shkallëzuar me çmimin live
    if (price > 0 && raw?.shares) {
      const mcap = price * raw.shares * 1e6;
      v.marketCap = mcap > 1e12 ? `$${(mcap / 1e12).toFixed(1)}T` : mcap > 1e9 ? `$${(mcap / 1e9).toFixed(0)}B` : `$${(mcap / 1e6).toFixed(0)}M`;
    } else if (f.marketCap && f.marketCap > 0) {
      v.marketCap = formatBigMoney(f.marketCap);
    }
  }

  // ── Profitability ──
  const p = analysis.profitability as Record<string, unknown> | undefined;
  if (p && typeof p === 'object') {
    if (f.grossMargins > 0) p.grossMargin = pct(f.grossMargins);
    if (f.operatingMargins > 0) p.operatingMargin = pct(f.operatingMargins);
    if (f.profitMargins > 0) p.netMargin = pct(f.profitMargins);
    if (f.returnOnEquity > 0) p.returnOnEquity = pct(f.returnOnEquity);
  }

  // ── Growth ──
  const g = analysis.growth as Record<string, unknown> | undefined;
  if (g && typeof g === 'object') {
    if (f.revenueGrowth > 0) g.revenueGrowth = pct(f.revenueGrowth);
    if (f.earningsGrowth > 0) g.earningsGrowth = pct(f.earningsGrowth);
    if (f.revenueQuarterlyGrowth > 0) g.quarterlyRevenueGrowth = pct(f.revenueQuarterlyGrowth);
    if (f.earningsQuarterlyGrowth > 0) g.quarterlyEarningsGrowth = pct(f.earningsQuarterlyGrowth);
  }

  // ── Financial Health ──
  const h = analysis.financialHealth as Record<string, unknown> | undefined;
  if (h && typeof h === 'object') {
    const de = deRatio(f);
    if (de > 0) h.debtToEquity = +de.toFixed(2);
    if (f.freeCashflow > 0) h.freeCashFlow = formatBigMoney(f.freeCashflow);
  }

  // ── Earnings ──
  const e = analysis.earnings as Record<string, unknown> | undefined;
  if (e && typeof e === 'object') {
    if (f.epsForward > 0) e.forwardEps = f.epsForward.toFixed(2);
    // EPS trailing = çmimi / P/E — matematikisht e saktë nga të dhënat reale
    if (f.currentPrice > 0 && f.trailingPE > 0) e.eps = (f.currentPrice / f.trailingPE).toFixed(2);
    if (f.nextEarningsDate) {
      e.nextEarningsDate = f.nextEarningsDate;
    } else {
      // Mos shfaq kurrë datë fitimesh që ka kaluar — kthe "—"
      const d = String(e.nextEarningsDate || '');
      const ts = Date.parse(d);
      if (d && !isNaN(ts) && ts < Date.now()) e.nextEarningsDate = '—';
    }
  }

  // ── Analyst Consensus ──
  const ac = analysis.analystConsensus as Record<string, unknown> | undefined;
  if (ac && typeof ac === 'object') {
    if (f.targetMeanPrice > 0) ac.targetPrice = f.targetMeanPrice.toFixed(2);
    if (f.targetLowPrice > 0) ac.lowTarget = f.targetLowPrice.toFixed(2);
    if (f.targetHighPrice > 0) ac.highTarget = f.targetHighPrice.toFixed(2);
    if (f.recommendationKey) {
      const map: Record<string, string> = {
        strong_buy: 'STRONG_BUY', buy: 'BUY', hold: 'HOLD',
        underperform: 'SELL', sell: 'SELL', strong_sell: 'STRONG_SELL',
      };
      const mapped = map[f.recommendationKey.toLowerCase()];
      if (mapped) ac.rating = mapped;
    }
    // Shkallëzo B/H/S me numrin real të analistëve (ruan proporcionin e AI)
    if (f.numberOfAnalystOpinions > 0) {
      const b = Number(ac.buyRatings) || 0;
      const hd = Number(ac.holdRatings) || 0;
      const s = Number(ac.sellRatings) || 0;
      const total = b + hd + s;
      const n = f.numberOfAnalystOpinions;
      if (total > 0) {
        const nb = Math.max(1, Math.round((b / total) * n));
        const nh = Math.round((hd / total) * n);
        ac.buyRatings = nb;
        ac.holdRatings = nh;
        ac.sellRatings = Math.max(0, n - nb - nh);
      } else {
        // Pa shpërndarje nga AI — derivo një të arsyeshme nga konsensusi real
        const rec = (f.recommendationKey || 'hold').toLowerCase();
        const w = rec === 'strong_buy' || rec === 'buy' ? [0.7, 0.22]
          : rec === 'hold' ? [0.35, 0.45] : [0.15, 0.35];
        const nb = Math.round(n * w[0]);
        const nh = Math.round(n * w[1]);
        ac.buyRatings = nb;
        ac.holdRatings = nh;
        ac.sellRatings = Math.max(0, n - nb - nh);
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: FundamentalAnalysisRequest = await request.json();
    const { ticker, company } = body;

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
    }

    const companyInfo = company ? ` (${company})` : '';
    const tickerUpper = ticker.trim().toUpperCase();

    // ═══ FETCH REAL PRICE + REAL FUNDAMENTALS BEFORE AI CALL ═══
    const [livePrice, rawFund] = await Promise.all([
      getRealPrice(tickerUpper),
      getRealFundamentals(tickerUpper).catch(() => null),
    ]);
    const realPriceNum = livePrice ? livePrice.price : null;
    // Përshtat raportet e snapshot-it me çmimin live (P/E etj. të konsistueshme me tani)
    const realFund = rawFund ? adjustFundamentalsToLivePrice(rawFund, realPriceNum) : null;
    console.log(`[FUNDAMENTAL] Real price for ${tickerUpper}:`, livePrice ? `$${livePrice.price} [${livePrice.source}]` : 'unavailable');
    console.log(`[FUNDAMENTAL] Real fundamentals for ${tickerUpper}:`,
      realFund ? `PE=${realFund.trailingPE} fwdPE=${realFund.forwardPE} target=$${realFund.targetMeanPrice} [${realFund.source}]` : 'unavailable');

    let userMessage = `Perform a comprehensive fundamental analysis for ${tickerUpper}${companyInfo}. Include valuation metrics, profitability ratios, growth rates, financial health, earnings data, competitive advantage (moat), and analyst consensus. Provide a clear investment verdict.`;
    // AI-i s'e di datën e sotme pa këtë — kthen datë fitimesh të kaluara (2025-01-22 etj.)
    userMessage += `\n\nToday's date is ${new Date().toISOString().slice(0, 10)}. Any date you output (including nextEarningsDate) MUST be in the future relative to today.`;

    // Inject real prices into prompt
    if (livePrice) {
      userMessage = injectPricesIntoPrompt(userMessage, { [tickerUpper]: livePrice });
    }
    // Inject real fundamentals into prompt (P/E, margjina, targete, EPS — jo vetëm çmimi)
    if (realFund) {
      userMessage = buildFundamentalsContext(userMessage, realFund);
    }

    // Try real AI first, fall back to demo
    let content: string;
    try {
      content = await callAI({
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        temperature: 0.3,
        timeoutMs: 30000,
        retries: 0,
      });
    } catch {
      // AI unavailable — use demo data, but override me të dhëna reale aty ku ka
      console.log(`[DEMO MODE] AI unavailable for fundamental-analysis of ${tickerUpper}, using simulation with real price: $${realPriceNum || 'N/A'}`);
      const demo = generateDemoFundamentalAnalysis(tickerUpper, company, realPriceNum);
      if (realFund) applyRealFundamentals(demo as unknown as Record<string, unknown>, realFund, realPriceNum);
      return NextResponse.json({ analysis: demo, demo: true });
    }

    const fallback = {
      ticker: ticker.toUpperCase(),
      company: company || ticker.toUpperCase(),
      overallRating: 'HOLD',
      score: 50,
      summary: content,
      verdict: content,
      risks: [],
      valuation: { rating: 'FAIRLY_VALUED', summary: '' },
      profitability: { rating: 'AVERAGE', summary: '' },
      growth: { rating: 'MODERATE', summary: '' },
      financialHealth: { rating: 'MODERATE', summary: '' },
      earnings: { rating: 'MODERATE', summary: '' },
      competitiveAdvantage: { moat: 'NARROW', keyStrengths: [], keyWeaknesses: [] },
      analystConsensus: { rating: 'HOLD', targetPrice: 'N/A' },
    };

    const analysis = parseAIResponse(content, fallback);

    // Force real price + real fundamentals into AI response (AI may hallucinate stale values)
    if (realFund) {
      applyRealFundamentals(analysis as unknown as Record<string, unknown>, realFund, realPriceNum);
    } else if (livePrice && analysis && typeof analysis === 'object') {
      // Vetëm çmimi real i disponueshëm — së paku rregullo marketCap
      if ('valuation' in analysis && analysis.valuation && typeof analysis.valuation === 'object') {
        const v = analysis.valuation as Record<string, unknown>;
        const raw = getStock(tickerUpper);
        if (raw?.shares) {
          // shares është në MILIONA aksione — saktëso me × 1e6 (para: AAPL dilte $5M në vend të ~$5T)
          const mcap = livePrice.price * raw.shares * 1e6;
          v.marketCap = mcap > 1e12
            ? `$${(mcap / 1e12).toFixed(1)}T`
            : mcap > 1e9
              ? `$${(mcap / 1e9).toFixed(0)}B`
              : `$${(mcap / 1e6).toFixed(0)}M`;
        }
      }
    }

    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Fundamental AI error:', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Fundamental analysis error:', message);
    return NextResponse.json({ error: 'Analiza fundamentale dështoi. Provo përsëri.' }, { status: 500 });
  }
}
