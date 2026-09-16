// ═══════════════════════════════════════════════════════════════
// CAMS NEWS INTEL — Task 20
// Për secilin kandidat Top 10: çfarë po negociohet, çfarë lajmesh
// të rëndësishme ka, dhe çfarë impakti pozitiv/negativ mund të ketë.
//
// Burimi: Google News RSS (pa API key) + analizë kognitive e titujve:
//   1. DREJTIMI — POZITIV / NEGATIV / NEUTRAL (fjalë kyçe)
//   2. STATUSI — NE_NEGOCIATE (nuk ka mbaruar / pritet vendim) / KONFIRMUAR / INFO
//   3. PESHA E ARDHSHME — LART / MESËM / ULËT (kategoria + magnituda + pritja)
//   4. SHPJEGIMI — çfarë do të thotë dhe pse ka rëndësi (shqip)
// ═══════════════════════════════════════════════════════════════

import { fetchStockNews, type StockNewsItem, type CatalystCategory } from '@/lib/stock-news-fetcher';

export type NewsDirection = 'POZITIV' | 'NEGATIV' | 'NEUTRAL';
export type NewsWeight = 'LART' | 'MESËM' | 'ULËT';
export type NewsStatus = 'NE_NEGOCIATE' | 'KONFIRMUAR' | 'INFO';

export interface NewsIntelItem {
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
  category: CatalystCategory;
  categoryLabel: string;
  direction: NewsDirection;
  futureWeight: NewsWeight;
  weightScore: number;
  status: NewsStatus;
  impactNote: string;
  daysAgo: number | null;
}

export interface NewsIntelResult {
  symbol: string;
  fetchedAt: string;
  items: NewsIntelItem[];
  summary: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    negotiating: number;
    highWeight: number;
    netBias: NewsDirection;
    headline: string;
  };
}

// ── Etiketat shqip të kategorive ──

const CATEGORY_LABELS: Record<CatalystCategory, string> = {
  earnings: 'Rezultate financiare',
  fda: 'FDA / Klinikë',
  contract: 'Kontratë / Partneritet',
  regulatory: 'Rregullatore',
  merger: 'M&A / Blerje',
  product: 'Produkt',
  sector: 'Sektor',
  analyst: 'Analistë',
  insider: 'Insider',
  'short-squeeze': 'Short squeeze',
  legal: 'Ligjore',
  macro: 'Makro',
  other: 'Tjetër',
};

// ── 1) DREJTIMI: fjalë kyçe pozitive/negative me peshë ──

const POSITIVE_KEYWORDS: Array<[string, number]> = [
  // Rezultate & udhëzime
  ['record', 3], ['beats', 3], ['beat estimates', 4], ['tops estimates', 4], ['exceeds', 2], ['surpasses', 2],
  ['raises guidance', 4], ['lifts guidance', 4], ['raises outlook', 4], ['strong guidance', 3], ['guidance above', 3],
  ['upbeat', 2], ['blowout', 3],
  // Fitim kontratash & marrëveshjesh
  ['wins', 3], ['awarded', 3], ['secures', 3], ['lands', 2], ['expands partnership', 3], ['partnership', 2],
  ['collaboration', 2], ['joint venture', 2], ['strategic agreement', 2], ['multi-year deal', 3],
  // Rregullatore / FDA
  ['approved', 3], ['approval', 3], ['fda approves', 4], ['clearance', 2], ['green light', 2],
  ['breakthrough', 3], ['positive results', 3], ['positive data', 3], ['met primary endpoint', 4],
  ['phase 3 success', 4], ['successful trial', 4],
  // M&A (si target = pozitive)
  ['to be acquired', 4], ['acquisition of', 2], ['takeover', 2], ['buyout', 2], ['merger', 1],
  // Kapitali & aksionarët
  ['buyback', 3], ['repurchase', 3], ['dividend increase', 2], ['special dividend', 2], ['raises dividend', 2],
  ['insider buying', 2], ['ceo buys', 3],
  // Qëndrimet e analistëve
  ['upgrade', 2], ['upgrades', 2], ['raises price target', 2], ['raises target', 2], ['outperform', 2],
  ['initiates buy', 2], ['bullish', 1],
  // Reagimi i çmimit (konfirmim, jo shkak)
  ['surges', 1], ['soars', 1], ['jumps', 1], ['rallies', 1], ['climbs', 1], ['rises', 1], ['hits high', 1], ['all-time high', 2],
];

const NEGATIVE_KEYWORDS: Array<[string, number]> = [
  // Rezultate & udhëzime
  ['misses', 3], ['miss', 2], ['below estimates', 3], ['falls short', 3], ['disappointing', 3],
  ['cuts guidance', 4], ['lowers guidance', 4], ['weak guidance', 4], ['guidance below', 4], ['warns', 3],
  ['sees weakness', 2], ['slowdown', 2],
  // Rrezik ligjor & rregullator
  ['lawsuit', 3], ['sues', 3], ['sued', 3], ['litigation', 3], ['charges', 3], ['investigation', 3],
  ['probe', 3], ['subpoena', 3], ['fraud', 4], ['sec charges', 4], ['doj investigation', 4],
  // Produkt / FDA negative
  ['recall', 3], ['halted', 3], ['clinical hold', 3], ['trial fails', 4], ['failed study', 4],
  ['adverse', 2], ['safety concern', 3],
  // Hollim / diluim
  ['offering', 3], ['share sale', 3], ['stock sale', 2], ['convertible notes', 2], ['dilution', 3], ['priced offering', 3],
  ['at-the-market', 3], ['atm offering', 3],
  // Operative
  ['layoffs', 2], ['job cuts', 2], ['restructuring', 1], ['delays', 2], ['delayed', 2], ['postpones', 2],
  ['resigns', 2], ['steps down', 2], ['ceo exits', 3], ['bankruptcy', 4], ['chapter 11', 4], ['delisting', 4],
  ['short report', 3], ['short seller', 2],
  // Analistë
  ['downgrade', 2], ['downgrades', 2], ['cuts price target', 2], ['cuts target', 2], ['underperform', 2],
  ['bearish', 1],
  // Reagimi i çmimit
  ['plunges', 2], ['sinks', 2], ['tumbles', 2], ['slides', 1], ['drops', 1], ['falls', 1], ['slumps', 2],
];

// ── 2) STATUSI: negociatë / pritje — çfarë NUK ka mbaruar ende ──

const NEGOTIATION_KEYWORDS = [
  'in talks', 'negotiat', 'discussing', 'considering', 'exploring', 'evaluating', 'weighing',
  'potential', 'reportedly', 'rumor', 'rumour', 'sources say', 'people familiar', 'said to',
  'could', ' may ', ' might ', 'plans to', 'planning', 'intends to', 'expected to', 'expects to',
  'seeks', 'seeking', 'bids', 'bid for', 'to acquire', 'takeover talks', 'merger talks',
  'pending', 'awaiting', 'under review', 'filed for', 'submitted', 'applied',
  'if approved', 'decision expected', 'set to', 'preliminary', 'non-binding', 'term sheet',
  'letter of intent', 'loi', 'proposal', 'proposed',
];

const CONFIRMED_KEYWORDS = [
  'announces', 'announced', 'confirmed', 'signs', 'signed', 'agreement', 'completed', 'completes',
  'closed', 'closes deal', 'wins contract', 'awarded', 'approved', 'fda approves', 'reports',
];

// ── 3) MAGNITUDA: përforcon peshën e ardhshme ──

const MAGNITUDE_KEYWORDS = [
  'billion', 'multi-year', 'multi-billion', 'record', 'largest', 'biggest', 'major', 'massive',
  'landmark', 'historic', 'significant', 'transformative', 'unprecedented', 'huge',
];

// Copra opinioni/analize (jo ngjarje) — NUK janë katalizatorë: pesha ulet në MESËM/ULËT.
// Shembuj: "Is X Stock a Buy?", "Should You Buy", "Here's Our Price Target", "Jim Cramer Predicts..."
const OPINION_PATTERNS = [
  'stock a buy', 'is it too late', 'should you buy', 'worth buying', 'a buy now',
  'best stocks', 'stock analysis', 'what to know', 'how to trade', 'is trending',
  "here's what", "here's our", 'here\u2019s what', 'here\u2019s our', 'wall street sees',
  'predict', 'forecast', 'analysts say', 'investors should',
];

// Lajme institucionale të dobëta (13F / zënie pozicioni) — informative, mesatare jo të larta
const INSTITUTIONAL_WEAK = ['position increased', 'position decreased', '13f', 'stake in', 'form 4'];

// Peshëza bazë sipas kategorisë (0-100)
const CATEGORY_BASE_WEIGHT: Record<CatalystCategory, number> = {
  merger: 80, fda: 80, contract: 75, regulatory: 70, earnings: 65, legal: 60,
  product: 50, analyst: 45, 'short-squeeze': 45, insider: 40, sector: 35, macro: 30, other: 25,
};

// ── Analiza e një titulli ──

function scoreDirection(headlineLower: string): number {
  let score = 0;
  for (const [kw, w] of POSITIVE_KEYWORDS) if (headlineLower.includes(kw)) score += w;
  for (const [kw, w] of NEGATIVE_KEYWORDS) if (headlineLower.includes(kw)) score -= w;
  return score;
}

function detectStatus(headlineLower: string, hasDirection: boolean): NewsStatus {
  const negHit = NEGOTIATION_KEYWORDS.some(kw => headlineLower.includes(kw));
  const confHit = CONFIRMED_KEYWORDS.some(kw => headlineLower.includes(kw));
  if (negHit) return 'NE_NEGOCIATE';
  if (confHit || hasDirection) return 'KONFIRMUAR';
  return 'INFO';
}

function computeWeight(category: CatalystCategory, headlineLower: string, status: NewsStatus, daysAgo: number | null, dirScore: number): number {
  let w = CATEGORY_BASE_WEIGHT[category] ?? 25;
  if (MAGNITUDE_KEYWORDS.some(kw => headlineLower.includes(kw))) w += 12;
  if (status === 'NE_NEGOCIATE') w += 8;      // pritja = impakt i ardhshëm i mundshëm
  if (daysAgo !== null && daysAgo <= 3) w += 5;
  if (Math.abs(dirScore) >= 3) w += 5;         // drejtim i qartë = më relevant
  return Math.max(0, Math.min(100, w));
}

// ── Shpjegimi në shqip: çfarë do të thotë + impakti i ardhshëm ──

function buildImpactNote(category: CatalystCategory, direction: NewsDirection, status: NewsStatus, weight: NewsWeight): string {
  const parts: string[] = [];

  // Çfarë është
  const what: Record<CatalystCategory, string> = {
    earnings: 'lajm financar mbi rezultatet',
    fda: 'zhvillim klinik/rregullator',
    contract: 'kontratë ose partneritet',
    regulatory: 'zhvillim rregullator',
    merger: 'aktivitet bashkimi/blerje (M&A)',
    product: 'zhvillim produkti',
    sector: 'zhvillim sektorial',
    analyst: 'veprim analistësh',
    insider: 'aktivitet insider',
    'short-squeeze': 'dinamikë short squeeze',
    legal: 'zhvillim ligjor',
    macro: 'faktor makroekonomik',
    other: 'lajm i kompanisë',
  };
  parts.push(`Kjo është ${what[category]}.`);

  // Statusi
  if (status === 'NE_NEGOCIATE') {
    parts.push('⏳ NUK ka mbaruar ende — negociatë/vendim në pritje: nuk dihet se a do të konfirmohet, andaj rreziku dhe mundësia janë të dyja të mëdha — kjo është pikërisht pesha e saj e ardhshme.');
  }

  // Impakti sipas drejtimit
  const dirNote: Record<NewsDirection, string> = {
    POZITIV: 'Impakti i pritshëm: POZITIV — ka potencial të mbështesë çmimin ose ta ngrejë më tej (besim i shtuar i tregut, të ardhura të parashikueshme, ose kërkesë).',
    NEGATIV: 'Impakti i pritshëm: NEGATIV — mund të presojë çmimin (hollim, gjoba, dështim prove, humbje besimi) — mos e injoro asnjë lajm negativ me peshë të lartë.',
    NEUTRAL: 'Impakti: NEUTRAL — informatë që s\u2019lëviz çmimin drejtpërdrejt; mbaje në sy vetëm nëse merr konfirmim të mëtejshëm.',
  };
  parts.push(dirNote[direction]);

  // Shtesa sipas kategorisë
  if (category === 'merger' && status === 'NE_NEGOCIATE') {
    parts.push('Nëse mbyllet marëdhënia, çmimi zakonisht reagon shpejt (premium mbi nivelin aktual); nëse bie, tërhiqet gjithçka — ndiq lajmin dita-për-ditë.');
  }
  if (category === 'fda' || category === 'regulatory') {
    parts.push('Vendimet rregullatore/FDA lëvizin 20–100%+ në një ditë të vetme — këto janë ngjarjet me peshën më të madhe për biotech.');
  }
  if (category === 'earnings' && direction === 'POZITIV') {
    parts.push('Historikisht beats-të forta krijojnë drift pozitiv javët në vijim (PEAD) — ky është dhe themeli i kësaj strategjie.');
  }
  if (category === 'insider' && direction === 'POZITIV') {
    parts.push('Blerjet e drejtuesve janë sinjal i ngadaltë por i besueshëm — ata e njohin kompaninë më mirë se tregu.');
  }

  return parts.join(' ');
}

// ── Data sa vjetër ──

function parseDaysAgo(pubDate: string): number | null {
  try {
    const t = Date.parse(pubDate);
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  } catch { return null; }
}

// ── Analiza kryesore ──

export function analyzeNewsIntel(items: StockNewsItem[], ticker: string): NewsIntelItem[] {
  const tick = ticker.toLowerCase();

  // Rilevancë (e lehtë, përpara analizës së plotë):
  // mbaj lajmet që përmendin ticker-in OSE kanë kategori të qartë
  const enriched = items.map(item => ({ item, h: item.headline.toLowerCase() }));
  const relevant = enriched.filter(({ item, h }) =>
    h.includes(tick) || (item.category && item.category !== 'other' && item.category !== 'macro')
  );
  const pool = relevant.length >= 2 ? relevant : enriched;

  // Dedublifikim: burime të ndryshme me të njëjtin titull (mbaj të parin)
  const seen = new Set<string>();

  return pool
    .map(({ item, h }) => {
      const dirScore = scoreDirection(h);
      const direction: NewsDirection = dirScore >= 2 ? 'POZITIV' : dirScore <= -2 ? 'NEGATIV' : 'NEUTRAL';
      const status = detectStatus(h, direction !== 'NEUTRAL');
      const daysAgo = parseDaysAgo(item.publishedAt);
      let weightScore = computeWeight(item.category || 'other', h, status, daysAgo, dirScore);
      // Kapja e rreme "M&A" nga fjala "buy" në artikuj opinioni ("Is X a Buy?")
      if (INSTITUTIONAL_WEAK.some(p => h.includes(p))) weightScore = Math.min(weightScore, 55);
      if (OPINION_PATTERNS.some(p => h.includes(p))) weightScore = Math.min(weightScore, 45);
      const futureWeight: NewsWeight = weightScore >= 65 ? 'LART' : weightScore >= 40 ? 'MESËM' : 'ULËT';
      const category = item.category || 'other';

      const out: NewsIntelItem = {
        headline: item.headline,
        source: item.source,
        publishedAt: item.publishedAt,
        url: item.url,
        category,
        categoryLabel: CATEGORY_LABELS[category],
        direction,
        futureWeight,
        weightScore,
        status,
        impactNote: buildImpactNote(category, direction, status, futureWeight),
        daysAgo,
      };
      return out;
    })
    .filter(n => {
      const norm = n.headline.split(' - ')[0].toLowerCase().trim();
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    })
    .sort((a, b) => b.weightScore - a.weightScore || (a.daysAgo ?? 99) - (b.daysAgo ?? 99))
    .slice(0, 6);
}

// ── Cache 15-min në memorie (përtej 10-min të RSS) ──

const intelCache = new Map<string, { data: NewsIntelResult; time: number }>();
const INTEL_TTL = 15 * 60 * 1000;

export async function getCamsNewsIntel(ticker: string): Promise<NewsIntelResult> {
  const sym = ticker.toUpperCase();
  const cached = intelCache.get(sym);
  if (cached && Date.now() - cached.time < INTEL_TTL) return cached.data;

  const raw = await fetchStockNews(sym, 10);
  const items = analyzeNewsIntel(raw, sym);

  const positive = items.filter(i => i.direction === 'POZITIV').length;
  const negative = items.filter(i => i.direction === 'NEGATIV').length;
  const neutral = items.filter(i => i.direction === 'NEUTRAL').length;
  const negotiating = items.filter(i => i.status === 'NE_NEGOCIATE').length;
  const highWeight = items.filter(i => i.futureWeight === 'LART').length;

  const net: NewsDirection = positive > negative ? 'POZITIV' : negative > positive ? 'NEGATIV' : 'NEUTRAL';

  const headline = items.length === 0
    ? 'S\u2019u gjetën lajme të fundit relevante'
    : `${items.length} lajme: ${positive} pozitive, ${negative} negative, ${neutral} neutrale` +
      (negotiating > 0 ? ` · ${negotiating} ${negotiating === 1 ? 'negociatë' : 'negociata'} në zhvillim` : '') +
      (highWeight > 0 ? ` · ${highWeight} me peshë të lartë` : '') +
      ` — prirje netto: ${net}`;

  const result: NewsIntelResult = {
    symbol: sym,
    fetchedAt: new Date().toISOString(),
    items,
    summary: { total: items.length, positive, negative, neutral, negotiating, highWeight, netBias: net, headline },
  };

  intelCache.set(sym, { data: result, time: Date.now() });
  return result;
}
