// ═══════════════════════════════════════════════════════════════
// MARKET MAP (Finviz-style heatmap) — data layer
//
// Universe: ~220 kompanitë më të mëdha US të grupuara në 11 sektorë.
// Data: Yahoo v7 quote batch (marketCap + regularMarketChangePercent)
//       me cookie+crumb flow të provuar (shih alpha-vantage.ts Task 26).
// Cache: 60s në memorie — s'ka kuptim më shpesh se kaq për një mapë.
// ═══════════════════════════════════════════════════════════════

export interface MarketMapStock {
  symbol: string;
  name: string;
  sector: string;          // emri shqip i sektorit
  sectorKey: string;       // çelësi identifikues
  price: number;
  change: number;          // $ change
  changePercent: number;   // % change ditor
  previousClose: number;
  marketCap: number;
  volume: number;
}

export interface MarketMapSectorDef {
  key: string;
  label: string;           // etiketa shqip
  tickers: string[];       // Yahoo symbols (BRK-B, BF-B format)
}

// ─── Universi: kompanitë më të mëdha sipas sektorëve (GICS-style) ───
export const MARKET_MAP_UNIVERSE: MarketMapSectorDef[] = [
  {
    key: 'technology',
    label: 'Teknologji',
    tickers: [
      'AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'CSCO', 'ACN',
      'IBM', 'INTC', 'TXN', 'QCOM', 'INTU', 'NOW', 'AMAT', 'MU', 'ADI', 'PANW',
      'KLAC', 'SNPS', 'CDNS', 'CRWD', 'PLTR', 'SNOW', 'NET', 'DDOG', 'ANET', 'WDC',
      'FTNT', 'WDAY', 'SHOP', 'ARM', 'SMCI',
    ],
  },
  {
    key: 'communication',
    label: 'Komunikim',
    tickers: [
      'GOOGL', 'META', 'NFLX', 'DIS', 'TMUS', 'CMCSA', 'T', 'VZ', 'EA', 'TTWO',
      'WBD', 'SPOT', 'RBLX', 'PINS',
    ],
  },
  {
    key: 'consumer-discretionary',
    label: 'Konsum Ciklik',
    tickers: [
      'AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'LOW', 'SBUX', 'TJX', 'ABNB', 'GM',
      'F', 'DASH', 'MAR', 'CMG', 'ORLY', 'AZO', 'LULU', 'DPZ', 'ROST', 'YUM',
      'EBAY',
    ],
  },
  {
    key: 'consumer-staples',
    label: 'Konsum Bazik',
    tickers: [
      'WMT', 'PG', 'KO', 'PEP', 'COST', 'PM', 'MO', 'MDLZ', 'CL', 'KMB',
      'TSN', 'STZ', 'KDP', 'MNST', 'EL', 'HSY', 'GIS', 'KVUE',
    ],
  },
  {
    key: 'healthcare',
    label: 'Shëndetësi',
    tickers: [
      'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'ISRG', 'AMGN', 'BSX',
      'MDT', 'VRTX', 'GILD', 'REGN', 'CI', 'CVS', 'HCA', 'ZTS', 'DHR', 'SYK',
      'EW', 'DXCM', 'BMY',
    ],
  },
  {
    key: 'financials',
    label: 'Financa',
    tickers: [
      'BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SCHW', 'C',
      'BLK', 'AXP', 'SPGI', 'CB', 'MRSH', 'PGR', 'PYPL', 'AIG', 'MET', 'PRU',
      'USB', 'PNC', 'TFC', 'COIN', 'HOOD', 'AFL',
    ],
  },
  {
    key: 'industrials',
    label: 'Industria',
    tickers: [
      'GE', 'CAT', 'UNP', 'HON', 'BA', 'LMT', 'DE', 'UPS', 'RTX', 'FDX',
      'ADP', 'ETN', 'GD', 'NOC', 'CSX', 'NSC', 'WM', 'EMR', 'ITW', 'PH',
      'GEV', 'AXON', 'CPRT', 'MMM',
    ],
  },
  {
    key: 'energy',
    label: 'Energji',
    tickers: [
      'XOM', 'CVX', 'COP', 'WMB', 'EOG', 'SLB', 'PSX', 'MPC', 'OKE', 'KMI',
      'VLO', 'HAL', 'BKR', 'DVN', 'FANG',
    ],
  },
  {
    key: 'utilities',
    label: 'Utilities',
    tickers: [
      'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'PEG', 'ED', 'XEL',
      'WEC', 'AWK',
    ],
  },
  {
    key: 'real-estate',
    label: 'Real Estate',
    tickers: [
      'PLD', 'AMT', 'EQIX', 'SPG', 'O', 'PSA', 'CCI', 'WELL', 'DLR', 'VICI',
      'EQR', 'AVB', 'EXR', 'SBAC', 'IRM',
    ],
  },
  {
    key: 'materials',
    label: 'Materiale',
    tickers: [
      'LIN', 'SHW', 'APD', 'ECL', 'NEM', 'FCX', 'DOW', 'DD', 'PPG', 'NUE',
      'CF', 'LYB', 'ALB',
    ],
  },
];

// Mapë simbol → sektor (për lookup të shpejtë)
const TICKER_TO_SECTOR: Record<string, { key: string; label: string }> = {};
for (const sector of MARKET_MAP_UNIVERSE) {
  for (const t of sector.tickers) {
    TICKER_TO_SECTOR[t] = { key: sector.key, label: sector.label };
  }
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── Yahoo cookie + crumb (i njëjti flow i provuar si në alpha-vantage.ts) ───
let crumbState: { crumb: string; cookie: string; fetchedAt: number } | null = null;
const CRUMB_TTL_MS = 30 * 60 * 1000;

async function getYahooCrumb(force = false): Promise<{ crumb: string; cookie: string } | null> {
  if (!force && crumbState && Date.now() - crumbState.fetchedAt < CRUMB_TTL_MS) {
    return { crumb: crumbState.crumb, cookie: crumbState.cookie };
  }
  try {
    // Step 1: fc.yahoo.com vendos cookie-t e consent-it (404 është normale)
    const cookieRes = await fetch('https://fc.yahoo.com', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
    });
    const setCookies = cookieRes.headers.getSetCookie?.() || [];
    const cookie = setCookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: cookie → crumb.
    // ⚠️ MOS dërgo 'Accept: application/json' këtu — Yahoo kthen 406 (e provuar).
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length > 32 || crumb.includes('{') || crumb.includes('<')) return null;
    crumbState = { crumb, cookie, fetchedAt: Date.now() };
    return crumbState;
  } catch {
    return crumbState ? { crumb: crumbState.crumb, cookie: crumbState.cookie } : null;
  }
}

// ─── Cache 60s ───
let quoteCache: { stocks: MarketMapStock[]; fetchedAt: number } | null = null;
const QUOTE_CACHE_TTL_MS = 60 * 1000;

interface YahooV7Quote {
  symbol?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
  marketCap?: number;
  regularMarketVolume?: number;
}

async function fetchQuoteChunk(
  symbols: string[],
  crumb: string,
  cookie: string,
  base: string,
): Promise<YahooV7Quote[]> {
  const url = `${base}/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: {
      ...BROWSER_HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (!res.ok) throw new Error(`v7 quote ${res.status}`);
  const data = await res.json();
  const result = data?.quoteResponse?.result;
  if (!Array.isArray(result)) throw new Error('v7 quote: no result array');
  return result as YahooV7Quote[];
}

/**
 * Fetch quotes për të gjithë universin e mapës (chunked, me retry me crumb të ri).
 * Kthen listën e aksioneve me të dhëna reale live.
 */
export async function fetchMarketMapQuotes(): Promise<MarketMapStock[]> {
  const allSymbols = MARKET_MAP_UNIVERSE.flatMap(s => s.tickers);

  // Ndarë në chunk-e prej 60 (v7 e duron mirë, por s'ka pse të rrezikojmë)
  const chunks: string[][] = [];
  for (let i = 0; i < allSymbols.length; i += 60) {
    chunks.push(allSymbols.slice(i, i + 60));
  }

  const bases = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  const rawQuotes: Record<string, YahooV7Quote> = {};

  for (const chunk of chunks) {
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        const auth = await getYahooCrumb(attempt > 0); // në retry, crumb i ri
        if (!auth) throw new Error('no crumb');
        const base = bases[attempt % bases.length];
        const rows = await fetchQuoteChunk(chunk, auth.crumb, auth.cookie, base);
        for (const row of rows) {
          if (row?.symbol) rawQuotes[row.symbol] = row;
        }
        done = true;
      } catch (err) {
        console.log(`[MARKET-MAP] chunk dështoi (attempt ${attempt + 1}): ${err instanceof Error ? err.message : err}`);
        // nëse crumb-i ishte i pavlefshëm, resetoje që të merret i ri
        crumbState = null;
      }
    }
  }

  const stocks: MarketMapStock[] = [];

  // Kalimi i dytë: Yahoo nganjëherë heq disa simbole nga batch-i — i marrim veças
  const missing = allSymbols.filter(t => !rawQuotes[t]);
  if (missing.length > 0) {
    console.log(`[MARKET-MAP] retry pas ${missing.length} simboleve të humbura: ${missing.join(',')}`);
    try {
      const auth = await getYahooCrumb(false);
      if (auth) {
        const rows = await fetchQuoteChunk(missing, auth.crumb, auth.cookie, 'https://query1.finance.yahoo.com');
        for (const row of rows) {
          if (row?.symbol) rawQuotes[row.symbol] = row;
        }
      }
    } catch {
      // s'është fatale — vazhdojmë me ç'kemi
    }
  }

  // Kalimi i tretë: për simbolet që v7 s'i kthen (p.sh. EA, EQR, AVB) — v8 chart + v10 quoteSummary
  // (v8 jep çmimin/ndryshimin/emrin; v10 jep marketCap. Pa marketCap s'ka si të madhësohet pllaka.)
  const stillMissing = allSymbols.filter(t => !rawQuotes[t]);
  if (stillMissing.length > 0 && stillMissing.length <= 25) {
    console.log(`[MARKET-MAP] fallback v8+v10 për: ${stillMissing.join(',')}`);
    const auth = await getYahooCrumb(false);
    await Promise.all(stillMissing.map(async t => {
      try {
        const chartRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1d&interval=1d`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'], Accept: 'application/json' },
        });
        if (!chartRes.ok) return;
        const meta = (await chartRes.json())?.chart?.result?.[0]?.meta;
        if (!meta || typeof meta.regularMarketPrice !== 'number' || meta.regularMarketPrice <= 0) return;

        // marketCap nga v10 quoteSummary (summaryDetail)
        let mcap = 0;
        if (auth) {
          try {
            const qsRes = await fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=summaryDetail&crumb=${encodeURIComponent(auth.crumb)}`, {
              signal: AbortSignal.timeout(8000),
              headers: {
                'User-Agent': BROWSER_HEADERS['User-Agent'],
                Accept: 'application/json',
                ...(auth.cookie ? { Cookie: auth.cookie } : {}),
              },
            });
            if (qsRes.ok) {
              const sd = (await qsRes.json())?.quoteSummary?.result?.[0]?.summaryDetail;
              if (sd && typeof sd.marketCap?.raw === 'number') mcap = sd.marketCap.raw;
            }
          } catch {
            // mcap opsionale — nëse s'vjen, simboli skiptohet më poshtë
          }
        }
        if (mcap <= 0) return;

        const price = meta.regularMarketPrice;
        const pct = typeof meta.regularMarketChangePercent === 'number' ? meta.regularMarketChangePercent : 0;
        const prevClose = typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
          ? meta.chartPreviousClose
          : (1 + pct / 100) > 0 ? price / (1 + pct / 100) : price;

        rawQuotes[t] = {
          symbol: t,
          shortName: meta.shortName || t,
          regularMarketPrice: price,
          regularMarketChange: price - prevClose,
          regularMarketChangePercent: pct,
          regularMarketPreviousClose: prevClose,
          marketCap: mcap,
          regularMarketVolume: typeof meta.regularMarketVolume === 'number' ? meta.regularMarketVolume : 0,
        };
      } catch {
        // simbol i pamundur — skiptohet
      }
    }));
  }

  for (const sector of MARKET_MAP_UNIVERSE) {
    for (const ticker of sector.tickers) {
      const q = rawQuotes[ticker];
      if (!q || typeof q.regularMarketPrice !== 'number' || q.regularMarketPrice <= 0) continue;
      stocks.push({
        symbol: ticker,
        name: q.shortName || ticker,
        sector: sector.label,
        sectorKey: sector.key,
        price: q.regularMarketPrice,
        change: typeof q.regularMarketChange === 'number' ? q.regularMarketChange : 0,
        changePercent: typeof q.regularMarketChangePercent === 'number' ? q.regularMarketChangePercent : 0,
        previousClose: typeof q.regularMarketPreviousClose === 'number' ? q.regularMarketPreviousClose : q.regularMarketPrice,
        marketCap: typeof q.marketCap === 'number' ? q.marketCap : 0,
        volume: typeof q.regularMarketVolume === 'number' ? q.regularMarketVolume : 0,
      });
    }
  }

  return stocks;
}

/**
 * Version me cache — përdoret nga API route.
 */
export async function getMarketMapData(force = false): Promise<{ stocks: MarketMapStock[]; fetchedAt: number; cached: boolean }> {
  if (!force && quoteCache && Date.now() - quoteCache.fetchedAt < QUOTE_CACHE_TTL_MS) {
    return { stocks: quoteCache.stocks, fetchedAt: quoteCache.fetchedAt, cached: true };
  }
  const stocks = await fetchMarketMapQuotes();
  if (stocks.length > 0) {
    quoteCache = { stocks, fetchedAt: Date.now() };
    return { stocks, fetchedAt: quoteCache.fetchedAt, cached: false };
  }
  // Mos ruaj bosh në cache — nëse dështoi, provo pasardhësit menjëherë
  return { stocks, fetchedAt: Date.now(), cached: false };
}
