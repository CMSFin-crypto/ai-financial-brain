import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';

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
    "nextEarningsDate": "2025-04-24",
    "surprises": [
      {"quarter": "Q4 2024", "expected": "2.10", "actual": "2.18", "surprise": "+3.8%"}
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
}`;

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// ═══════════════════════════════════════════

interface StockFundProfile {
  company: string; sector: string; industry: string;
  price: number; shares: number;
  pe: number; fwdPE: number; peg: number; ps: number; pb: number; evEbitda: number; divYield: string;
  grossMargin: string; opMargin: string; netMargin: string; roe: string; roa: string; roi: string;
  revGrowth: string; epsGrowth: string; revGrowth3Y: string; epsGrowth3Y: string;
  qRevGrowth: string; qEpsGrowth: string;
  currentRatio: number; quickRatio: number; debtEq: number; debtAssets: number;
  fcf: string; eps: string; fwdEps: string;
  moat: 'WIDE' | 'NARROW' | 'NONE'; brandStrength: number;
  rating: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL';
  targetPrice: string; lowTarget: string; highTarget: string;
  buyCount: number; holdCount: number; sellCount: number;
  strengths: string[]; weaknesses: string[];
  position: string;
}

const FUND_PROFILES: Record<string, StockFundProfile> = {
  AAPL: {
    company: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics',
    price: 195.50, shares: 15470,
    pe: 31.5, fwdPE: 28.2, peg: 1.8, ps: 7.8, pb: 45.2, evEbitda: 25.1, divYield: '0.55%',
    grossMargin: '44.1%', opMargin: '29.8%', netMargin: '25.3%', roe: '147.9%', roa: '28.4%', roi: '36.5%',
    revGrowth: '8.1%', epsGrowth: '12.5%', revGrowth3Y: '10.2%', epsGrowth3Y: '15.8%',
    qRevGrowth: '6.2%', qEpsGrowth: '10.8%',
    currentRatio: 1.05, quickRatio: 0.99, debtEq: 1.72, debtAssets: 0.35,
    fcf: '110.5B', eps: '6.42', fwdEps: '7.15',
    moat: 'WIDE', brandStrength: 10,
    rating: 'BUY', targetPrice: '220.00', lowTarget: '195.00', highTarget: '250.00',
    buyCount: 28, holdCount: 8, sellCount: 2,
    strengths: ['Brand loyalty', 'Ekosistem i mbyllur', 'Inovacion i vazhdueshëm', 'Rezerva kasë masive'],
    weaknesses: ['Çmimet e larta limitojnë tregun', 'Varësia nga Kina', 'Presioni rregullator në EU'],
    position: 'Leaderi dominues në elektronikën e konsumit me ekosistem të fortë',
  },
  NVDA: {
    company: 'NVIDIA Corp', sector: 'Technology', industry: 'Semiconductors',
    price: 875.50, shares: 2460,
    pe: 65.2, fwdPE: 52.1, peg: 1.2, ps: 25.8, pb: 42.1, evEbitda: 55.3, divYield: '0.02%',
    grossMargin: '74.5%', opMargin: '55.2%', netMargin: '48.1%', roe: '112.5%', roa: '35.8%', roi: '48.2%',
    revGrowth: '125%', epsGrowth: '180%', revGrowth3Y: '75.3%', epsGrowth3Y: '98.5%',
    qRevGrowth: '122%', qEpsGrowth: '165%',
    currentRatio: 3.85, quickRatio: 3.42, debtEq: 0.41, debtAssets: 0.12,
    fcf: '28.3B', eps: '13.42', fwdEps: '16.80',
    moat: 'WIDE', brandStrength: 9,
    rating: 'STRONG_BUY', targetPrice: '1050.00', lowTarget: '850.00', highTarget: '1200.00',
    buyCount: 35, holdCount: 5, sellCount: 1,
    strengths: ['Dominimi i GPU AI', 'CUDA platform lock-in', 'Inovacion i shpejtë', 'Marzha operative brilante'],
    weaknesses: ['Vlerësim premium shumë i lartë', 'Varësia nga investimet AI', 'Rreziku i konkurrencës'],
    position: 'Monopoli de facto në çipe AI me dominim >85% në tregun e datacenter',
  },
  MSFT: {
    company: 'Microsoft Corp', sector: 'Technology', industry: 'Software',
    price: 415.20, shares: 7430,
    pe: 35.8, fwdPE: 31.5, peg: 2.1, ps: 12.5, pb: 12.8, evEbitda: 24.5, divYield: '0.72%',
    grossMargin: '69.3%', opMargin: '44.1%', netMargin: '35.2%', roe: '38.5%', roa: '18.2%', roi: '25.8%',
    revGrowth: '15.6%', epsGrowth: '18.2%', revGrowth3Y: '14.2%', epsGrowth3Y: '20.5%',
    qRevGrowth: '16.8%', qEpsGrowth: '20.1%',
    currentRatio: 1.78, quickRatio: 1.65, debtEq: 0.38, debtAssets: 0.15,
    fcf: '62.8B', eps: '11.60', fwdEps: '13.18',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '480.00', lowTarget: '420.00', highTarget: '530.00',
    buyCount: 30, holdCount: 7, sellCount: 1,
    strengths: ['Azure cloud lider', 'Copilot AI integrimi', 'Diversifikim i fortë', 'Cash flow stabil'],
    weaknesses: ['Çmimi premium', 'Rritja e Azure duke ngadalësuar', 'Konkurrenca AI'],
    position: 'Gigant software me prezencë dominuese në cloud dhe AI',
  },
  JPM: {
    company: 'JPMorgan Chase', sector: 'Finance', industry: 'Banking',
    price: 198.30, shares: 2860,
    pe: 11.8, fwdPE: 10.5, peg: 1.0, ps: 4.5, pb: 1.85, evEbitda: 8.2, divYield: '2.35%',
    grossMargin: '37.2%', opMargin: '32.5%', netMargin: '28.8%', roe: '15.2%', roa: '1.18%', roi: '12.5%',
    revGrowth: '6.2%', epsGrowth: '9.1%', revGrowth3Y: '5.8%', epsGrowth3Y: '8.5%',
    qRevGrowth: '8.5%', qEpsGrowth: '12.2%',
    currentRatio: 0.89, quickRatio: 0.86, debtEq: 1.21, debtAssets: 0.92,
    fcf: '42.1B', eps: '16.80', fwdEps: '18.89',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '230.00', lowTarget: '195.00', highTarget: '260.00',
    buyCount: 22, holdCount: 10, sellCount: 3,
    strengths: ['Banka më e madhe në SHBA', 'Menaxhim i shkëlqyer', 'Diversifikim', 'Dividend i qëndrueshëm'],
    weaknesses: ['Rreziku ciklik', 'Ekspozimi ndaj normave të interesit', 'Rregullore bankare'],
    position: 'Banka më e madhe dhe më e fortë financiare në Shtetet e Bashkuara',
  },
  JNJ: {
    company: 'Johnson & Johnson', sector: 'Healthcare', industry: 'Pharmaceuticals',
    price: 156.80, shares: 2430,
    pe: 22.5, fwdPE: 20.1, peg: 2.8, ps: 4.8, pb: 6.2, evEbitda: 15.5, divYield: '3.05%',
    grossMargin: '43.6%', opMargin: '22.8%', netMargin: '18.5%', roe: '42.5%', roa: '12.8%', roi: '18.5%',
    revGrowth: '3.2%', epsGrowth: '5.8%', revGrowth3Y: '4.5%', epsGrowth3Y: '6.2%',
    qRevGrowth: '2.8%', qEpsGrowth: '5.5%',
    currentRatio: 1.12, quickRatio: 0.95, debtEq: 0.45, debtAssets: 0.22,
    fcf: '18.2B', eps: '6.97', fwdEps: '7.80',
    moat: 'WIDE', brandStrength: 9,
    rating: 'HOLD', targetPrice: '170.00', lowTarget: '148.00', highTarget: '195.00',
    buyCount: 12, holdCount: 18, sellCount: 5,
    strengths: ['Dividend 62 vjet rresht', 'Pipeline farmaceutike', 'Reputacion i fortë', 'Stabilitet'],
    weaknesses: ['Rritje e ngadalshme', 'Litigime talcum powder', 'Konkurrencë në farmaci'],
    position: 'Dividenda aristokrate me diversifikim të gjerë në farmaci dhe pajisje mjekësore',
  },
  XOM: {
    company: 'Exxon Mobil', sector: 'Energy', industry: 'Oil & Gas',
    price: 108.50, shares: 4140,
    pe: 13.2, fwdPE: 12.5, peg: 0.8, ps: 1.1, pb: 2.2, evEbitda: 6.5, divYield: '3.45%',
    grossMargin: '11.8%', opMargin: '13.5%', netMargin: '8.2%', roe: '18.5%', roa: '8.5%', roi: '12.2%',
    revGrowth: '-2.1%', epsGrowth: '-5.3%', revGrowth3Y: '15.8%', epsGrowth3Y: '22.5%',
    qRevGrowth: '-8.5%', qEpsGrowth: '-12.2%',
    currentRatio: 1.25, quickRatio: 0.98, debtEq: 0.21, debtAssets: 0.14,
    fcf: '32.5B', eps: '8.22', fwdEps: '8.68',
    moat: 'WIDE', brandStrength: 8,
    rating: 'HOLD', targetPrice: '125.00', lowTarget: '95.00', highTarget: '145.00',
    buyCount: 15, holdCount: 14, sellCount: 6,
    strengths: ['Bilanci i forttë', 'Dividend i lartë', 'Shkallëzim global', 'Investime në energji të ulët'],
    weaknesses: ['Rënie e çmimeve të naftës', 'Rreziku kalimit', 'Varësia nga nafta'],
    position: 'Supermajor oil me bilanc të fortë dhe dividend mbizotërues',
  },
  TSLA: {
    company: 'Tesla Inc.', sector: 'Consumer Discretionary', industry: 'Electric Vehicles',
    price: 248.50, shares: 3210,
    pe: 72.3, fwdPE: 55.8, peg: 3.5, ps: 6.2, pb: 12.5, evEbitda: 38.5, divYield: '0.00%',
    grossMargin: '17.9%', opMargin: '9.2%', netMargin: '7.5%', roe: '22.8%', roa: '8.5%', roi: '15.2%',
    revGrowth: '1.0%', epsGrowth: '-23%', revGrowth3Y: '35.5%', epsGrowth3Y: '45.8%',
    qRevGrowth: '-8.5%', qEpsGrowth: '-52.5%',
    currentRatio: 1.82, quickRatio: 1.45, debtEq: 0.11, debtAssets: 0.05,
    fcf: '4.4B', eps: '3.44', fwdEps: '4.45',
    moat: 'NARROW', brandStrength: 8,
    rating: 'HOLD', targetPrice: '280.00', lowTarget: '165.00', highTarget: '350.00',
    buyCount: 14, holdCount: 16, sellCount: 12,
    strengths: ['Marka EV #1', 'Ekosistem supercharger', 'Teknologji AI/FSD', 'Energi diellore'],
    weaknesses: ['Konkurrencë VW/BYD', 'Rritje e ngadalshme', 'Çmimi premium', 'Varësia nga Musk'],
    position: 'Pioneri i EV me marka të fortë por konkurrencë në rritje',
  },
  LLY: {
    company: 'Eli Lilly & Co', sector: 'Healthcare', industry: 'Pharmaceuticals',
    price: 782.30, shares: 950,
    pe: 95.2, fwdPE: 72.5, peg: 1.5, ps: 18.5, pb: 28.5, evEbitda: 62.5, divYield: '0.85%',
    grossMargin: '78.5%', opMargin: '32.5%', netMargin: '22.8%', roe: '85.2%', roa: '22.5%', roi: '35.8%',
    revGrowth: '35%', epsGrowth: '42%', revGrowth3Y: '25.5%', epsGrowth3Y: '38.2%',
    qRevGrowth: '38.5%', qEpsGrowth: '45.2%',
    currentRatio: 1.45, quickRatio: 1.18, debtEq: 0.52, debtAssets: 0.25,
    fcf: '8.5B', eps: '8.22', fwdEps: '10.79',
    moat: 'WIDE', brandStrength: 8,
    rating: 'STRONG_BUY', targetPrice: '950.00', lowTarget: '750.00', highTarget: '1100.00',
    buyCount: 28, holdCount: 5, sellCount: 1,
    strengths: ['Mounjaro/Zepbound dominim', 'Pipeline GLP-1', 'Rritje e shpejtë EPS', 'Patente afatgjata'],
    weaknesses: ['Vlerësim shumë i lartë', 'Rreziku konkurrencës GLP-1', 'Varësia nga farmaci'],
    position: 'Leaderi i Mounjaro/Zepbound me rritje eksplozive në farmacinë e obezitetit',
  },
  META: {
    company: 'Meta Platforms', sector: 'Technology', industry: 'Social Media',
    price: 505.75, shares: 2540,
    pe: 27.5, fwdPE: 23.8, peg: 1.1, ps: 7.2, pb: 5.8, evEbitda: 16.5, divYield: '0.42%',
    grossMargin: '81.2%', opMargin: '38.5%', netMargin: '32.5%', roe: '25.8%', roa: '15.2%', roi: '22.5%',
    revGrowth: '22.1%', epsGrowth: '45.3%', revGrowth3Y: '18.5%', epsGrowth3Y: '35.2%',
    qRevGrowth: '24.5%', qEpsGrowth: '52.8%',
    currentRatio: 2.85, quickRatio: 2.65, debtEq: 0.18, debtAssets: 0.08,
    fcf: '43.5B', eps: '18.39', fwdEps: '21.26',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '600.00', lowTarget: '480.00', highTarget: '680.00',
    buyCount: 32, holdCount: 6, sellCount: 2,
    strengths: ['Monopoli rrjetet sociale', 'Reklamat AI në rritje', 'Efikasitet operativ', 'Free cash flow masiv'],
    weaknesses: ['Reality Labs humbje', 'Rregullore BE', 'Rritje e vështirë të mbajtur'],
    position: 'Monopoli i rrjeteve sociale me 3.9B përdorues dhe efikasitet operativ brilant',
  },
  V: {
    company: 'Visa Inc.', sector: 'Finance', industry: 'Payment Processing',
    price: 278.90, shares: 1590,
    pe: 30.2, fwdPE: 26.8, peg: 1.6, ps: 15.5, pb: 13.5, evEbitda: 22.5, divYield: '0.72%',
    grossMargin: '54.1%', opMargin: '48.5%', netMargin: '42.8%', roe: '48.5%', roa: '18.2%', roi: '32.5%',
    revGrowth: '10.5%', epsGrowth: '14.2%', revGrowth3Y: '12.8%', epsGrowth3Y: '18.5%',
    qRevGrowth: '11.8%', qEpsGrowth: '15.5%',
    currentRatio: 1.25, quickRatio: 1.18, debtEq: 0.52, debtAssets: 0.22,
    fcf: '18.9B', eps: '9.24', fwdEps: '10.41',
    moat: 'WIDE', brandStrength: 10,
    rating: 'BUY', targetPrice: '320.00', lowTarget: '260.00', highTarget: '360.00',
    buyCount: 25, holdCount: 8, sellCount: 2,
    strengths: ['Efekt rrjeti global', 'Marzha operative brilante', 'Modeli afatgjatë', 'Rritje ndërkombëtare'],
    weaknesses: ['Vlerësim premium', 'Rreziku rregullator', 'Varësia nga tregtia'],
    position: 'Rrjeti më i madh i pagesave globale me efekt rrjeti të pakapshëm',
  },
};

function generateDemoFundamentalAnalysis(ticker: string, company?: string) {
  const t = ticker.toUpperCase();
  const p = FUND_PROFILES[t] || {
    company: company || t + ' Corp', sector: 'Technology', industry: 'General',
    price: 150, shares: 1000,
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

  const valuationRating = p.pe > 50 ? 'OVERVALUED' : p.pe > 30 ? 'FAIRLY_VALUED' : 'UNDERVALUED';
  const profitRating = parseFloat(p.grossMargin) > 50 ? 'EXCELLENT' : parseFloat(p.grossMargin) > 30 ? 'GOOD' : 'AVERAGE';
  const growthRating = parseFloat(p.revGrowth) > 20 ? 'STRONG' : parseFloat(p.revGrowth) > 5 ? 'MODERATE' : 'WEAK';
  const healthRating = p.debtEq < 0.5 ? 'STRONG' : p.debtEq < 1 ? 'MODERATE' : 'WEAK';
  const earnRating = parseFloat(p.epsGrowth) > 15 ? 'STRONG' : parseFloat(p.epsGrowth) > 5 ? 'MODERATE' : 'WEAK';

  const score = p.rating === 'STRONG_BUY' ? 85 + Math.floor(Math.random() * 10) :
    p.rating === 'BUY' ? 72 + Math.floor(Math.random() * 10) :
    p.rating === 'HOLD' ? 50 + Math.floor(Math.random() * 12) :
    30 + Math.floor(Math.random() * 10);

  const marketCap = p.price * p.shares;
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
      nextEarningsDate: '2025-07-22',
      surprises: [
        { quarter: 'Q4 2024', expected: p.eps, actual: (parseFloat(p.eps) * 1.04).toFixed(2), surprise: '+4.0%' },
        { quarter: 'Q3 2024', expected: p.eps, actual: (parseFloat(p.eps) * 1.02).toFixed(2), surprise: '+2.5%' },
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

export async function POST(request: NextRequest) {
  try {
    const body: FundamentalAnalysisRequest = await request.json();
    const { ticker, company } = body;

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
    }

    const companyInfo = company ? ` (${company})` : '';
    const userMessage = `Perform a comprehensive fundamental analysis for ${ticker.toUpperCase()}${companyInfo}. Include valuation metrics, profitability ratios, growth rates, financial health, earnings data, competitive advantage (moat), and analyst consensus. Provide a clear investment verdict.`;

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
      // AI unavailable — use demo data
      console.log(`[DEMO MODE] AI unavailable for fundamental-analysis of ${ticker}, using simulation data`);
      const demo = generateDemoFundamentalAnalysis(ticker.trim().toUpperCase(), company);
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
