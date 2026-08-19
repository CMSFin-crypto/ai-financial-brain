// ═══════════════════════════════════════════════════════════════
// STOCK NEWS FETCHER — Google News RSS (no API key needed)
// Fetches recent headlines for specific stocks to explain
// why they are moving.
// ═══════════════════════════════════════════════════════════════

export interface StockNewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
  category?: CatalystCategory;
  summary?: string;
}

export type CatalystCategory =
  | 'earnings'       // Zerbatim financiare
  | 'fda'            // Miratime FDA/biotech
  | 'contract'       // Kontrata, partneritete
  | 'regulatory'     // Miratime rregullatore
  | 'merger'         // Bashkim, blerje
  | 'product'        // Lanzim produktesh
  | 'sector'         // Lajme sektori (AI, crypto, etj)
  | 'analyst'        // Rekomandime analistësh
  | 'insider'        // Blerje/shitje insider
  | 'short-squeeze'  // Short squeeze
  | 'legal'          // Çështje ligjore
  | 'macro'          // Lajme makroekonomike
  | 'other';

export interface CatalystAnalysis {
  category: CatalystCategory;
  label: string;           // e.g. "Earnings Beat"
  description: string;     // Detailed explanation in Albanian
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: 'strong' | 'moderate' | 'mild';
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Cache
const newsCache = new Map<string, { items: StockNewsItem[]; time: number }>();
const NEWS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch recent news headlines for a specific stock ticker.
 * Uses Google News RSS — no API key required.
 */
export async function fetchStockNews(ticker: string, maxItems = 5): Promise<StockNewsItem[]> {
  const allItems = await fetchStockNewsRaw(ticker, maxItems + 5); // fetch extra for filtering
  return categorizeNews(allItems, ticker).slice(0, maxItems);
}

/**
 * Raw fetch — returns more items for categorization.
 */
async function fetchStockNewsRaw(ticker: string, maxItems = 10): Promise<StockNewsItem[]> {
  const cacheKey = ticker.toUpperCase();
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < NEWS_CACHE_TTL) {
    return cached.items;
  }

  try {
    // Search Google News for the ticker
    const query = encodeURIComponent(ticker + ' stock news');
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': BROWSER_UA },
    });

    if (!res.ok) return [];

    const xml = await res.text();
    const items = parseRSS(xml, maxItems);

    if (items.length > 0) {
      newsCache.set(cacheKey, { items, time: Date.now() });
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Fetch news for multiple tickers in parallel (for top candidates only).
 */
export async function fetchStockNewsBatch(tickers: string[], maxPerTicker = 5): Promise<Record<string, StockNewsItem[]>> {
  const results: Record<string, StockNewsItem[]> = {};

  // Fetch in parallel (max 5 at a time to avoid rate limits)
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(t => fetchStockNews(t, maxPerTicker))
    );

    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        results[batch[idx]] = r.value;
      }
    });
  }

  return results;
}

/**
 * Parse Google News RSS XML into structured items.
 */
function parseRSS(xml: string, maxItems: number): StockNewsItem[] {
  const items: StockNewsItem[] = [];

  // Simple regex parsing (no XML parser needed)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];

    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
      || block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
    const source = sourceMatch ? sourceMatch[1].trim() : 'Google News';

    if (title && !title.includes('Google News')) {
      items.push({ headline: title, source, publishedAt: pubDate, url: link });
    }
  }

  return items;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// ═══ CATALYST CATEGORIZATION ═══

const CATEGORY_KEYWORDS: Record<CatalystCategory, string[]> = {
  earnings: ['earnings', 'revenue', 'profit', 'loss', 'eps', 'quarterly', 'q1 ', 'q2 ', 'q3 ', 'q4 ', 'fiscal', 'beat estimates', 'missed', 'topped', 'guided', 'outlook', 'guidance'],
  fda: ['fda', 'clinical', 'trial', 'phase ', 'drug', 'approval', 'treatment', 'therapy', 'biotech', 'pipeline', 'ndc', 'blades', 'cder'],
  contract: ['contract', 'deal', 'partnership', 'agreement', 'collaboration', 'joint venture', 'signed', 'awarded', 'win ', 'supply', 'customer'],
  regulatory: ['sec ', 'regulation', 'regulatory', 'compliance', 'approved', 'clearance', 'certification', 'permit', 'license', 'sanction'],
  merger: ['merger', 'acquisition', 'buyout', 'takeover', 'buy ', 'acquires', 'acquired', 'combines', 'spinoff', 'ipo', 'spac'],
  product: ['launch', 'product', 'release', 'unveiled', 'introduces', 'new version', 'update', 'upgrade', 'feature', 'innovation'],
  sector: ['ai ', 'artificial intelligence', 'semiconductor', 'chip ', 'crypto ', 'bitcoin', 'ev ', 'electric vehicle', 'solar', 'battery', 'hydrogen', 'green energy', 'oil ', 'gas ', 'mining'],
  analyst: ['analyst', 'upgrade', 'downgrade', 'price target', 'rating', 'bullish', 'bearish', 'initiates', 'maintains', 'reiterates'],
  insider: ['insider', 'ceo ', 'cfo ', 'director', 'officer', 'bought', 'sold', 'purchased', 'filing', 'form 4', 'ownership'],
  'short-squeeze': ['short squeeze', 'short interest', 'shorts ', 'borrowed shares', 'short covering', 'short sellers', 'si '],
  legal: ['lawsuit', 'settlement', 'patent', 'litigation', 'court', 'guilty', 'investigation', 'subpoena'],
  macro: ['fed ', 'interest rate', 'inflation', 'gdp', 'employment', 'tariff', 'recession', 'market rally', 'selloff'],
  other: [],
};

/**
 * Categorize news headlines and add summary.
 */
function categorizeNews(items: StockNewsItem[], ticker: string): StockNewsItem[] {
  return items.map(item => {
    const headlineLower = item.headline.toLowerCase();
    const companyRef = ticker.toLowerCase();

    let bestCategory: CatalystCategory = 'other';
    let bestScore = 0;

    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [CatalystCategory, string[]][]) {
      if (cat === 'other') continue;
      let score = 0;
      for (const kw of keywords) {
        if (headlineLower.includes(kw)) score += 1;
      }
      // Bonus if ticker is mentioned in the headline (more relevant)
      if (headlineLower.includes(companyRef)) score += 2;
      if (score > bestScore) {
        bestScore = score;
        bestCategory = cat;
      }
    }

    const summary = generateNewsSummary(item.headline, bestCategory);

    return { ...item, category: bestCategory, summary };
  });
}

/**
 * Generate a short Albanian summary of a news headline based on its category.
 */
function generateNewsSummary(headline: string, category: CatalystCategory): string {
  switch (category) {
    case 'earnings': return 'Lajm financiar — rezultatet e fitimeve ndikuan ne cmim';
    case 'fda': return 'Lajm biotech/FDA —进展i klinik ose miratim i mundshem';
    case 'contract': return 'Kontrate ose partneritet i ri — rrit besimin per te ardhmen';
    case 'regulatory': return 'Lajm rregullator — miratim ose ndryshim rregullash';
    case 'merger': return 'Lajm M&A — bashkim, blerje ose ndryshim korporativ';
    case 'product': return 'Lanzim ose perditesim produktesh — innovacion';
    case 'sector': return 'Lajm sektorial — trend i industrise ndikon ne cmim';
    case 'analyst': return 'Analiste — ndryshim ne rekomandime ose price target';
    case 'insider': return 'Insider — blemtje ose shitje nga drejtuesit';
    case 'short-squeeze': return 'Short squeeze —Short sellers ne presion';
    case 'legal': return 'Lajm ligjor — çeshtje gjyqesore ose patentash';
    case 'macro': return 'Lajm makroekonomik — politika monetare ose tregu i gjerë';
    default: return 'Lajm i fundit per kete aksion';
  }
}

/**
 * Analyze news headlines to produce a detailed catalyst analysis.
 */
export function analyzeCatalystFromNews(headlines: StockNewsItem[], dailyChangePct: number): CatalystAnalysis {
  if (!headlines || headlines.length === 0) {
    return {
      category: 'other',
      label: 'Pa lajm te verifiquar',
      description: `Rritja ${dailyChangePct.toFixed(1)}% pa lajm te qarte. Verifikoni manualisht Finviz, Benzinga, apo Twitter per lajmin e fundit.`,
      confidence: 'LOW',
      impact: 'mild',
    };
  }

  // Find the most relevant headline (highest category match)
  const categorized = headlines.map(h => ({
    ...h,
    score: (h.category !== 'other' ? 3 : 0) + (h.headline.length > 40 ? 1 : 0),
  }));
  categorized.sort((a, b) => b.score - a.score);
  const top = categorized[0];
  const category = top.category || 'other';

  // Build detailed description
  const descriptions: Record<CatalystCategory, string> = {
    earnings: `Rezultatet financiare jane bote here positive. Kompania ka raportuar fitime ose te ardhura me te larta se priteshit, duke shkaktuar reagim pozitiv nga investoret. Kjo tregon se biznesi po performon mire.`,
    fda: `Ka进展ne procesin klinik ose miratim rregullator. Për kompanite biotech, kjo eshte katalizatori me i forte dhe shpesh shkakton levizje 20-100%+. Verifikoni ne faqen zyrtare te FDA.`,
    contract: `Nje kontrate ose partneritet i ri ka rritur besimin e investitoreve. Kontratat e medha sigurojne te ardhura te ardhshme dhe vërtetojne kompetencen e kompanise ne treg.`,
    regulatory: `Nje miratim rregullator ka hapur deren per rritje. Kjo mund te jete leje per nje produkt te ri, ose heqje e nje kufizimi qe pengonte biznesin.`,
    merger: 'Aktiviteti M&A tregon qe kompania ka vlere strategjike. Bashkimet dhe blerjet mund te krijojne sinergie dhe te rrisin cmimin e aksioneve.',
    product: 'Lanzimi i nje produkti te ri tregon inovacion. Investoret shmangen kursin e parapaguesit duke pare potencialin e tregut te ri.',
    sector: `Trendi pozitiv i sektorit po ndikon ne kete aksion. Kur i gjithe sektori leviz, aksionet individualne barten shtyse. Verifikoni nese eshte lag ose themelor.`,
    analyst: `Nje analiste i njohur ka ndryshuar opinionin per kete aksion. Rekomandimet e analisteve jane sinjale ndermjetëse — tregon vëmendje institucionale.`,
    insider: `Drejtuesit e kompanise jane duke blere aksione. Insider buying eshte nje sinjal pozitiv sepse ata kane me shume informacion se tregu.`,
    'short-squeeze': `Short interest i larte po krijoje presion per blerje te detyruar. Kur cmimi rritet, short seller-et duhet te mbulojne pozicionet, duke shtyre cmimin me larte.`,
    legal: `Nje çeshtje ligjore po ndikone ne cmim. Kjo mund te jete pozitive (fitore ne gjyq) ose negative (gjykim). Verifikoni detajet.`,
    macro: `Ngjarje makroekonomike po ndikojne ne treg. Normat e interesit, inflacioni, ose politikat qeveritare jane duke levizur tregun e gjerë.`,
    other: `Lajmet e fundit per kete kompani po ndikojne ne cmim. Lexoni titujne me poshte per me shume detaje.`,
  };

  const labels: Record<CatalystCategory, string> = {
    earnings: 'Rezultate Financiare',
    fda: 'Proces Klinik / FDA',
    contract: 'Kontrate / Partneritet',
    regulatory: 'Miratim Rregullator',
    merger: 'Bashkim / Blerje (M&A)',
    product: 'Lanzim Produktesh',
    sector: 'Trend Sektoral',
    analyst: 'Rekomandim Analisti',
    insider: 'Insider Activity',
    'short-squeeze': 'Short Squeeze',
    legal: 'Çeshtje Ligjore',
    macro: 'Faktor Makroekonomik',
    other: 'Lajm i Pergjithshem',
  };

  const hasMultipleHeadlines = headlines.length >= 2;
  const hasStrongCategory = category !== 'other';

  return {
    category,
    label: labels[category],
    description: descriptions[category],
    confidence: hasStrongCategory && hasMultipleHeadlines ? 'HIGH' : hasStrongCategory ? 'MEDIUM' : 'LOW',
    impact: dailyChangePct >= 20 ? 'strong' : dailyChangePct >= 10 ? 'moderate' : 'mild',
  };
}

/**
 * Generate a "why is it moving" explanation based on price action data.
 * This works for ALL stocks without any API call.
 */
export function generateRiseReason(data: {
  symbol: string;
  dailyChangePct: number;
  relativeVolume: number;
  price: number;
  prevClose: number;
  history: { close: number; high: number; low: number; volume: number; date: string }[];
}): string {
  const { dailyChangePct, relativeVolume, price, prevClose, history, symbol } = data;
  const reasons: string[] = [];

  // Gap analysis
  if (history.length >= 2) {
    const prevHigh = history[history.length - 2]?.high || prevClose;
    const prevLow = history[history.length - 2]?.low || prevClose;
    const gapPct = ((price - prevHigh) / prevHigh) * 100;

    if (gapPct > 5) {
      reasons.push(`Gap up ${gapPct.toFixed(1)}% mbi High e dites se kaluar ($${prevHigh.toFixed(2)})`);
    } else if (gapPct > 2) {
      reasons.push(`Gap i vogel ${gapPct.toFixed(1)}% — hapur mbi High e dites se kaluar`);
    }
  }

  // Volume explanation
  if (relativeVolume >= 20) {
    reasons.push(`Volumi 20x+ mesataren — institucionale ose short squeeze e mundshem`);
  } else if (relativeVolume >= 10) {
    reasons.push(`Volumi 10x+ mesataren — vëmendje e larteinstitutionale`);
  } else if (relativeVolume >= 5) {
    reasons.push(`Volumi 5x+ mesataren — interes i zgjeruar`);
  }

  // Trend context
  if (history.length >= 5) {
    const last5 = history.slice(-6, -1);
    const avgClose5 = last5.reduce((a, d) => a + d.close, 0) / last5.length;
    const trendPct = ((avgClose5 - last5[0].close) / last5[0].close) * 100;

    if (trendPct > 10) {
      reasons.push(`Ne nje uptrend te fort — rritje ${trendPct.toFixed(1)}% ne 5 diten e fundit`);
    } else if (trendPct < -10 && dailyChangePct > 5) {
      reasons.push(`Rikthim pas renies se fundit — mund te jete reversal`);
    }

    // Breakout detection
    const recentHighs = last5.map(d => d.high);
    const resistance = Math.max(...recentHighs);
    if (price > resistance && resistance > 0) {
      reasons.push(`Breakout mbi rezistencen $${resistance.toFixed(2)} (5-ditore)`);
    }
  }

  // Momentum type classification
  if (dailyChangePct >= 30) {
    reasons.push('Lëvizje parabolike — zakonisht e shkaktuar nga lajm i forte (FDA, kontrate, ose short squeeze)');
  } else if (dailyChangePct >= 20) {
    reasons.push('Rritje e forte — ka gjasë të ketë lajm themeltare (earnings, partnership, ose miratim rregullator)');
  } else if (dailyChangePct >= 15) {
    reasons.push('Momentum i lartë — zakonisht lajm pozitiv ose short interest i lartë');
  } else if (dailyChangePct >= 10) {
    reasons.push('Momentum i fortë — lajm ose katalizator i mundshëm');
  }

  // Support bounce
  if (history.length >= 10) {
    const last10 = history.slice(-11, -1);
    const recentLow = Math.min(...last10.map(d => d.low));
    const lowDaysAgo = last10.find(d => d.low === recentLow);
    if (lowDaysAgo && price > recentLow * 1.03 && dailyChangePct >= 5) {
      const daysSince = history.length - 1 - history.indexOf(lowDaysAgo);
      reasons.push(`Bounce nga suporti $${recentLow.toFixed(2)} (${daysSince} dite me pare)`);
    }
  }

  if (reasons.length === 0) {
    reasons.push(`Rritje ${dailyChangePct.toFixed(1)}% me volum ${relativeVolume.toFixed(1)}x — verifikoni lajmin e fundit`);
  }

  return reasons.join('. ') + '.';
}

/**
 * Generate caution signals — when to be careful.
 * Based on price action, timing, and pattern analysis.
 */
export function generateCautionSignals(data: {
  symbol: string;
  dailyChangePct: number;
  relativeVolume: number;
  price: number;
  prevClose: number;
  floatShares: number | null;
  pillarCount: number;
  status: string;
  highMomentum: boolean;
  historicalScore: number;
  historicalPattern: { setupsFound: number; winRate1d: number; winRate5d: number; avgMaxDrawdown5d: number; historicalBias: string; avgReturn1d: number; };
}): string[] {
  const signals: string[] = [];
  const { dailyChangePct, relativeVolume, price, floatShares, pillarCount, status, highMomentum, historicalScore, historicalPattern } = data;

  // ⚠️ Timing signals
  const now = new Date();
  const hourET = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false })) || 12;
  const dayOfWeek = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  const minuteET = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', minute: '2-digit' })) || 0;

  // Pre-market / first 15 min warning
  if (hourET >= 9 && hourET < 10 && minuteET < 15) {
    signals.push('9:30-9:45 ET — 15 min e para jane shume volatile, prit per konfirmim');
  }
  // Late day warning
  if (hourET >= 15) {
    signals.push('Pas ores 15:00 ET — rreziku i gap-it nese hapet me poshte neser');
  }
  // Friday afternoon
  if (dayOfWeek === 'Friday' && hourET >= 14) {
    signals.push('E premte pasdite — rrezik gap over weekend, mos hap pozicione te reja');
  }
  // Pre-holiday
  const month = now.getMonth();
  const date = now.getDate();
  if ((month === 11 && date >= 24) || (month === 0 && date <= 2)) {
    signals.push('Ditet festive — volumi i ulet, levizje te pakta, rrezik i larte');
  }

  // ⚠️ Pattern-based signals
  if (dailyChangePct >= 25) {
    signals.push('Rritje 25%+ — rrezik shume i larte i pullback-it neser. Mos ndiq ne opening.');
  }
  if (dailyChangePct >= 15 && relativeVolume >= 10) {
    signals.push('Volume climax — rritje e forte me volum te larte. Mund te jete topi i levizjes.');
  }
  if (relativeVolume >= 20) {
    signals.push('Volum 20x+ — ka gjas te jete short squeeze. Kujdes: kur terminojne shorti, rrenohet.');
  }

  // ⚠️ Price-level signals
  if (price <= 2) {
    signals.push('Penny stock — spread i gjere bid/ask, slippage i larte, manipulim i mundshem.');
  }
  if (price <= 1) {
    signals.push('Sub-dollar stock — rrezik ekstrem, shume broker nuk lejojne short, liquiditeti minimal.');
  }
  if (floatShares !== null && floatShares <= 2) {
    signals.push('Ultra-low float (<2M) — mund te rritet 100%+ por edhe te bie 50%+. Stop-i DUAJET te ngrohet.');
  }
  if (floatShares !== null && floatShares <= 5 && dailyChangePct >= 20) {
    signals.push('Float i vogel + rritje e madhe — maker-ja po kontrollon. Mos e ndiq nese nuk ke plan.');
  }

  // ⚠️ Historical pattern warnings
  if (historicalPattern.setupsFound >= 3) {
    if (historicalPattern.winRate1d < 40) {
      signals.push(`Historia tregon: vetem ${historicalPattern.winRate1d}% chance rritje diten neser (${historicalPattern.setupsFound} raste te ngjashme).`);
    }
    if (historicalPattern.avgMaxDrawdown5d >= 15) {
      signals.push(`Historia: drawdown mesatar ${historicalPattern.avgMaxDrawdown5d}% brenda 5 dites. Gati per rrezik?`);
    }
    if (historicalPattern.historicalBias === 'bearish') {
      signals.push('Bias historik BEARISH — rastet e ngjashme kane perfunduar me humbje mesatare.');
    }
  }

  // ⚠️ Status-specific
  if (status === 'FLOAT_REVIEW') {
    signals.push('Float i panjohur — verifikoni ne Finviz para se te hyni. Nese >20M, mos hyjni.');
  }
  if (pillarCount <= 2) {
    signals.push('Setup i dobet — vetem ' + pillarCount + '/5 pillar. Kjo nuk eshte trade sipas Ross Cameron.');
  }

  // ⚠️ General reminders
  if (highMomentum || (status === 'ELIGIBLE' && dailyChangePct >= 15)) {
    signals.push('Hapni pozicionin vetem pas konfirmimit (pullback ne VWAP, ose re-test i support).');
    signals.push('Stop loss DUAJET: nese nuk e keni vendosur stop, mos hyni.');
    signals.push('Max 1-2% e portfolio-se per nje trade. Mos rrisni pozicionin nese shkon kunder.');
  }

  return signals;
}
