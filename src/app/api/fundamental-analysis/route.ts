import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStock, type StockProfile } from '@/lib/market-data';
import { getRealPrice, injectPricesIntoPrompt } from '@/lib/alpha-vantage';

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
}`;

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

  const marketCap = effectivePrice * p.shares;
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

export async function POST(request: NextRequest) {
  try {
    const body: FundamentalAnalysisRequest = await request.json();
    const { ticker, company } = body;

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
    }

    const companyInfo = company ? ` (${company})` : '';
    const tickerUpper = ticker.trim().toUpperCase();

    // ═══ FETCH REAL PRICE BEFORE AI CALL ═══
    const livePrice = await getRealPrice(tickerUpper);
    const realPriceNum = livePrice ? livePrice.price : null;
    console.log(`[FUNDAMENTAL] Real price for ${tickerUpper}:`, livePrice ? `$${livePrice.price} [${livePrice.source}]` : 'unavailable');

    let userMessage = `Perform a comprehensive fundamental analysis for ${tickerUpper}${companyInfo}. Include valuation metrics, profitability ratios, growth rates, financial health, earnings data, competitive advantage (moat), and analyst consensus. Provide a clear investment verdict.`;

    // Inject real prices into prompt
    if (livePrice) {
      userMessage = injectPricesIntoPrompt(userMessage, { [tickerUpper]: livePrice });
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
      // AI unavailable — use demo data with REAL price for ALL calculations
      console.log(`[DEMO MODE] AI unavailable for fundamental-analysis of ${tickerUpper}, using simulation with real price: $${realPriceNum || 'N/A'}`);
      const demo = generateDemoFundamentalAnalysis(tickerUpper, company, realPriceNum);
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

    // Force real price into AI response (AI may hallucinate prices)
    if (livePrice && analysis && typeof analysis === 'object') {
      // Update price-related fields with real data
      if ('valuation' in analysis && analysis.valuation && typeof analysis.valuation === 'object') {
        const v = analysis.valuation as Record<string, unknown>;
        // Recalculate market cap with real price if we have shares info
        const raw = getStock(tickerUpper);
        if (raw?.shares) {
          const mcap = livePrice.price * raw.shares;
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
