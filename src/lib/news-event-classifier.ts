// ═══════════════════════════════════════════════════════════════
// NEWS EVENT CLASSIFIER — Event taxonomy, sentiment, ticker detection
// Classifies news into event types, scores sentiment, detects tickers.
// ═══════════════════════════════════════════════════════════════

// ── Event Taxonomy ──
export const EVENT_TYPES = [
  'earnings_beat',
  'earnings_miss',
  'revenue_guidance_up',
  'revenue_guidance_down',
  'analyst_upgrade',
  'analyst_downgrade',
  'fda_approval',
  'fda_setback',
  'ma_partnership',
  'product_launch',
  'ai_semiconductor_demand',
  'macro_inflation',
  'macro_jobs',
  'macro_rates',
  'geopolitical_regulation',
  'geopolitical_tariffs',
  'supply_chain',
  'insider_buying',
  'insider_selling',
  'legal_patent',
  'other',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface ClassifiedNews {
  ticker: string;
  headline: string;
  summary: string;
  eventType: EventType;
  sentimentScore: number;   // -1 to +1
  sentimentLabel: 'positive' | 'negative' | 'neutral';
  macroVsMicro: 'macro' | 'micro' | 'both';
  themeTags: string[];
}

// ── Ticker Detection ──
// Common company name → ticker mapping for detection
const COMPANY_TICKER_MAP: Record<string, string> = {
  'apple': 'AAPL', 'microsoft': 'MSFT', 'nvidia': 'NVDA', 'amazon': 'AMZN',
  'alphabet': 'GOOGL', 'google': 'GOOGL', 'meta': 'META', 'facebook': 'META',
  'tesla': 'TSLA', 'berkshire': 'BRK.B', 'jpmorgan': 'JPM', 'johnson & johnson': 'JNJ',
  'visa': 'V', 'mastercard': 'MA', 'bank of america': 'BAC', 'goldman sachs': 'GS',
  'morgan stanley': 'MS', 'blackrock': 'BLK', 'schwab': 'SCHW',
  'unitedhealth': 'UNH', 'eli lilly': 'LLY', 'merck': 'MRK', 'abbott': 'ABT',
  'pfizer': 'PFE', 'thermo fisher': 'TMO', 'abbvie': 'ABBV', 'caterpillar': 'CAT',
  'chevron': 'CVX', 'exxon': 'XOM', 'conocophillips': 'COP',
  'amd': 'AMD', 'broadcom': 'AVGO', 'qualcomm': 'QCOM', 'texas instruments': 'TXN',
  'intel': 'INTC', 'micron': 'MU', 'marvell': 'MRVL', 'lam research': 'LRCX',
  'applied materials': 'AMAT', 'kLA': 'KLAC', 'arm holdings': 'ARM',
  'salesforce': 'CRM', 'oracle': 'ORCL', 'adobe': 'ADBE', 'serviceNow': 'NOW',
  'intuit': 'INTU', 'snowflake': 'SNOW', 'palantir': 'PLTR', 'crowdstrike': 'CRWD',
  'datadog': 'DDOG', 'zscaler': 'ZS', 'fortinet': 'FTNT', 'cloudflare': 'NET',
  'netflix': 'NFLX', 'disney': 'DIS', 'comcast': 'CMCSA', 'walmart': 'WMT',
  'costco': 'COST', 'home depot': 'HD', 'nike': 'NKE', 'mcdonald': 'MCD',
  'starbucks': 'SBUX', 'chipotle': 'CMG', 'coca-cola': 'KO', 'pepsico': 'PEP',
  'boeing': 'BA', 'caterpillar': 'CAT', '3m': 'MMM', 'deere': 'DE',
  'uber': 'UBER', 'airbnb': 'ABNB', 'booking': 'BKNG',
};

// Sector mapping for IBKR universe tickers
const SECTOR_MAP: Record<string, string> = {
  'AAPL': 'Technology', 'MSFT': 'Technology', 'NVDA': 'Technology', 'AMZN': 'Consumer',
  'GOOGL': 'Communication', 'META': 'Communication', 'TSLA': 'Consumer',
  'AVGO': 'Technology', 'AMD': 'Technology', 'QCOM': 'Technology', 'INTC': 'Technology',
  'MU': 'Technology', 'MRVL': 'Technology', 'LRCX': 'Technology', 'AMAT': 'Technology',
  'TXN': 'Technology', 'ARM': 'Technology', 'KLAC': 'Technology',
  'CRM': 'Technology', 'ORCL': 'Technology', 'ADBE': 'Technology', 'NOW': 'Technology',
  'SNOW': 'Technology', 'PLTR': 'Technology', 'CRWD': 'Technology', 'DDOG': 'Technology',
  'NET': 'Technology', 'ZS': 'Technology', 'FTNT': 'Technology', 'PANW': 'Technology',
  'JPM': 'Finance', 'BAC': 'Finance', 'GS': 'Finance', 'MS': 'Finance', 'BLK': 'Finance',
  'V': 'Finance', 'MA': 'Finance', 'SCHW': 'Finance', 'AXP': 'Finance',
  'C': 'Finance', 'USB': 'Finance', 'PGR': 'Finance', 'CB': 'Finance',
  'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'LLY': 'Healthcare', 'MRK': 'Healthcare',
  'ABBV': 'Healthcare', 'PFE': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare',
  'GILD': 'Healthcare', 'VRTX': 'Healthcare', 'REGN': 'Healthcare', 'ISRG': 'Healthcare',
  'WMT': 'Consumer', 'COST': 'Consumer', 'HD': 'Consumer', 'NKE': 'Consumer',
  'MCD': 'Consumer', 'SBUX': 'Consumer', 'CMG': 'Consumer', 'TGT': 'Consumer',
  'NFLX': 'Communication', 'DIS': 'Communication', 'CMCSA': 'Communication',
  'UBER': 'Consumer', 'ABNB': 'Consumer', 'BKNG': 'Consumer',
  'KO': 'Staples', 'PEP': 'Staples', 'PM': 'Staples', 'MO': 'Staples',
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy',
  'CAT': 'Industrial', 'BA': 'Industrial', 'GE': 'Industrial', 'HON': 'Industrial',
};

/**
 * Detect ticker from headline text.
 * Checks for uppercase ticker patterns (e.g. "NVDA", "AAPL") and company names.
 */
export function detectTicker(text: string): string | null {
  const upper = text.toUpperCase();

  // 1. Check for explicit ticker symbols (2-5 uppercase letters, often in parens)
  const tickerPattern = /\b([A-Z]{2,5})\b/g;
  const knownTickers = new Set(Object.keys(SECTOR_MAP));
  let match;
  while ((match = tickerPattern.exec(upper)) !== null) {
    if (knownTickers.has(match[1])) return match[1];
  }

  // 2. Check for company name mappings
  const lowerText = text.toLowerCase();
  for (const [name, ticker] of Object.entries(COMPANY_TICKER_MAP)) {
    if (lowerText.includes(name)) return ticker;
  }

  // 3. Check for common tech/crypto sector keywords → map to sector ETF
  if (/semiconductor|chip maker|chip stock/i.test(text)) return 'SMH';
  if (/\bai\b|artificial intelligence/i.test(text)) return 'XLK';

  return null;
}

/**
 * Get sector for a known ticker.
 */
export function getTickerSector(ticker: string): string {
  return SECTOR_MAP[ticker.toUpperCase()] || '';
}

// ── Event Type Classification ──

const EVENT_KEYWORDS: Record<EventType, string[]> = {
  earnings_beat: ['beat estimates', 'topped', 'exceeded', 'better than expected', 'earnings beat', 'surpassed', 'blew past', 'crushed', 'smashed'],
  earnings_miss: ['missed', 'fell short', 'below expectations', 'disappointed', 'weaker than', 'earnings miss', 'underperformed'],
  revenue_guidance_up: ['raised guidance', 'upward revision', 'increased outlook', 'raised forecast', 'revenue guidance up', 'hiked outlook'],
  revenue_guidance_down: ['cut guidance', 'lowered outlook', 'reduced forecast', 'slashed guidance', 'warning', 'downward revision'],
  analyst_upgrade: ['upgrade', 'upgraded', 'raised price target', 'bullish', 'overweight', 'initiates buy', 'reiterates buy'],
  analyst_downgrade: ['downgrade', 'downgraded', 'cut price target', 'bearish', 'underweight', 'initiates sell', 'reiterates sell'],
  fda_approval: ['fda approval', 'fda approved', 'fda clears', 'granted approval', 'regulatory approval', 'green light'],
  fda_setback: ['fda rejection', 'clinical trial failed', 'trial setback', 'fda complete response', 'delayed approval', 'phase 3 failed'],
  ma_partnership: ['merger', 'acquisition', 'buyout', 'takeover', 'acquires', 'partnership', 'joint venture', 'deal with'],
  product_launch: ['launch', 'unveiled', 'announced new', 'product release', 'new version', 'rollout', 'introduces'],
  ai_semiconductor_demand: ['ai demand', 'semiconductor', 'chip demand', 'data center', 'gpu', 'ai chip', 'foundry', 'wafer', 'hbm'],
  macro_inflation: ['inflation', 'cpi', 'consumer price', 'ppi', 'price index'],
  macro_jobs: ['employment', 'non-farm', 'payroll', 'jobless claims', 'unemployment rate', 'labor market'],
  macro_rates: ['interest rate', 'federal reserve', 'fed ', 'rate cut', 'rate hike', 'fomc', 'basis point'],
  geopolitical_regulation: ['sanction', 'regulation', 'antitrust', 'doj ', 'ftc ', 'eu regulator', 'trade restriction'],
  geopolitical_tariffs: ['tariff', 'trade war', 'import duty', 'export ban', 'trade tension'],
  supply_chain: ['supply chain', 'shortage', 'export control', 'capacity constraint', 'lead time', 'inventory'],
  insider_buying: ['insider buying', 'ceo bought', 'director purchased', 'form 4', 'insider purchased', 'officer bought'],
  insider_selling: ['insider selling', 'ceo sold', 'director sold', 'insider sold', 'officer sold'],
  legal_patent: ['lawsuit', 'patent', 'litigation', 'court ruling', 'settlement', 'infringement'],
  other: [],
};

/**
 * Classify news into an event type based on headline keywords.
 */
export function classifyEventType(headline: string, summary: string = ''): EventType {
  const text = (headline + ' ' + summary).toLowerCase();
  let bestType: EventType = 'other';
  let bestScore = 0;

  for (const [type, keywords] of Object.entries(EVENT_KEYWORDS) as [EventType, string[]][]) {
    if (type === 'other') continue;
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return bestType;
}

// ── Sentiment Scoring ──

const POSITIVE_WORDS = [
  'beat', 'surpassed', 'exceeded', 'record', 'all-time high', 'jump', 'surge', 'soar',
  'rally', 'gain', 'profit', 'growth', 'upgrade', 'bullish', 'strong', 'robust',
  'approved', 'breakthrough', 'innovative', 'partnership', 'dividend', 'buyback',
  'raised', 'optimistic', 'outlook', 'momentum', 'recovery', 'expansion',
];

const NEGATIVE_WORDS = [
  'miss', 'fell', 'dropped', 'plunge', 'crash', 'slump', 'decline', 'loss',
  'downgrade', 'bearish', 'weak', 'cut', 'warning', 'delay', 'failed',
  'rejection', 'lawsuit', 'investigation', 'recall', 'setback', 'concern',
  'risk', 'fear', 'uncertainty', 'tariff', 'sanction', 'shortage',
];

/**
 * Score sentiment from -1 (very negative) to +1 (very positive).
 * Uses simple keyword counting — can be replaced with LLM later.
 */
export function scoreSentiment(headline: string, summary: string = ''): {
  score: number;
  label: 'positive' | 'negative' | 'neutral';
} {
  const text = (headline + ' ' + summary).toLowerCase();

  let posCount = 0;
  let negCount = 0;

  for (const w of POSITIVE_WORDS) {
    if (text.includes(w)) posCount++;
  }
  for (const w of NEGATIVE_WORDS) {
    if (text.includes(w)) negCount++;
  }

  const total = posCount + negCount;
  if (total === 0) return { score: 0, label: 'neutral' };

  const raw = (posCount - negCount) / total;
  const score = Math.round(raw * 100) / 100;

  return {
    score,
    label: score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral',
  };
}

/**
 * Determine if news is macro, micro, or both.
 */
export function classifyMacroVsMicro(eventType: EventType): 'macro' | 'micro' | 'both' {
  const macroTypes: EventType[] = [
    'macro_inflation', 'macro_jobs', 'macro_rates',
    'geopolitical_regulation', 'geopolitical_tariffs', 'supply_chain',
  ];

  if (macroTypes.includes(eventType)) return 'macro';
  if (eventType === 'ai_semiconductor_demand') return 'both';
  return 'micro';
}

/**
 * Extract theme tags from headline.
 */
export function extractThemeTags(headline: string, eventType: EventType): string[] {
  const tags: string[] = [];
  const text = headline.toLowerCase();

  if (/ai |artificial|machine learning|llm|gpt/i.test(text)) tags.push('AI');
  if (/semiconductor|chip|gpu|cpu|foundry|nvidia|amd|intel/i.test(text)) tags.push('semiconductor');
  if (/ev |electric vehicle|tesla|rivian/i.test(text)) tags.push('EV');
  if (/crypto|bitcoin|ethereum|blockchain/i.test(text)) tags.push('crypto');
  if (/fda|clinical|trial|drug|biotech|pharma/i.test(text)) tags.push('biotech');
  if (/fed |rate|fomc|basis point/i.test(text)) tags.push('rates');
  if (/tariff|trade war|sanction/i.test(text)) tags.push('trade_policy');
  if (/earnings|revenue|eps|profit/i.test(text)) tags.push('earnings');
  if (/merger|acquisition|buyout|takeover/i.test(text)) tags.push('M&A');

  if (tags.length === 0) tags.push(eventType);
  return tags;
}

/**
 * Full classification pipeline: ticker + event type + sentiment + tags.
 */
export function classifyNews(headline: string, summary: string = '', knownTicker?: string): ClassifiedNews {
  const ticker = knownTicker || detectTicker(headline) || '';
  const eventType = classifyEventType(headline, summary);
  const { score, label } = scoreSentiment(headline, summary);
  const macroVsMicro = classifyMacroVsMicro(eventType);
  const themeTags = extractThemeTags(headline, eventType);

  return {
    ticker: ticker.toUpperCase(),
    headline,
    summary,
    eventType,
    sentimentScore: score,
    sentimentLabel: label,
    macroVsMicro,
    themeTags,
  };
}
