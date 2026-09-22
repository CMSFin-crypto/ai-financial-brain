// ═══════════════════════════════════════════════════════════════
// GRAFIK FINVIZ — të dhëna reale OHLCV nga Yahoo Finance (v8 chart)
// Burim për tab-in "Grafik Finviz" — stil finviz.com/charts?t=SYM&p=d
// I vetëqëndrueshëm (nuk prek alpha-vantage.ts) + cache 60s në memorie.
// ═══════════════════════════════════════════════════════════════

export interface FinvizCandle {
  date: string; // ISO date (ditore+) ose ISO datetime (intraday)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FinvizChartData {
  symbol: string;
  company: string;
  exchange: string;
  currency: string;
  price: number;
  previousClose: number;
  marketTime: number; // unix sekonda
  interval: string;
  range: string;
  candles: FinvizCandle[];
}

export const FINVIZ_RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max'] as const;
export const FINVIZ_INTERVALS = ['5m', '15m', '30m', '60m', '1h', '1d', '5d', '1wk', '1mo'] as const;

const SYMBOL_RE = /^[A-Z0-9.\-=^]{1,12}$/;

export function isValidFinvizSymbol(s: string): boolean {
  return SYMBOL_RE.test(s.toUpperCase().trim());
}

// Cache në memorie 60s — i njëjti pattern si chartCache në alpha-vantage.ts
const CACHE_TTL_MS = 60_000;
const finvizCache = new Map<string, { data: FinvizChartData; fetchedAt: number }>();

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function fetchFinvizChartData(
  ticker: string,
  range: string,
  interval: string,
): Promise<FinvizChartData | null> {
  const t = ticker.toUpperCase().trim();
  if (!isValidFinvizSymbol(t)) return null;
  const r = (FINVIZ_RANGES as readonly string[]).includes(range) ? range : '1y';
  const itv = (FINVIZ_INTERVALS as readonly string[]).includes(interval) ? interval : '1d';

  const cacheKey = `${t}_${r}_${itv}`;
  const cached = finvizCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  // Për candle-e ditore/javore/mujore ruaj vetëm datën (jo orën) — intraday mban ISO datetime.
  const isDailyPlus = itv === '1d' || itv === '5d' || itv === '1wk' || itv === '1mo';
  // Fundjavat kapërcehen VETËM për candle-e strikt ditorë (Yahoo i vulos në ditë tregtimi).
  // Për 1wk/1mo vulat mund të bien në fundjavë (sidomos kur range=max i grumbullon) dhe nuk duhen hedhur.
  const skipWeekends = itv === '1d';

  const endpoints = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

  for (const base of endpoints) {
    try {
      const url = `${base}/v8/finance/chart/${encodeURIComponent(t)}?range=${r}&interval=${itv}&includePrePost=false`;
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp || [];
      const q = result.indicators?.quote?.[0];
      const meta = result.meta;
      if (!q || !meta || !timestamps.length) continue;

      const candles: FinvizCandle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const open = q.open?.[i];
        const high = q.high?.[i];
        const low = q.low?.[i];
        const close = q.close?.[i];
        if (close == null || open == null || high == null || low == null || !(close > 0)) continue;

        const d = new Date(timestamps[i] * 1000);
        if (skipWeekends && (d.getDay() === 0 || d.getDay() === 6)) continue; // shtunë/diel

        const iso = isDailyPlus ? d.toISOString().split('T')[0] : d.toISOString();
        candles.push({
          date: iso,
          open: +Number(open).toFixed(4),
          high: +Number(high).toFixed(4),
          low: +Number(low).toFixed(4),
          close: +Number(close).toFixed(4),
          volume: q.volume?.[i] ?? 0,
        });
      }

      if (candles.length < 10) continue;

      const livePrice: number | null =
        (typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0 && meta.regularMarketPrice) || null;

      // previousClose = mbyllja e ditës së djeshme.
      // Renditja e fallback-eve: meta.previousClose → chartPreviousClose (vlen vetëm për 1d/5d) → candle-i i parafundit.
      const fallbackPrev =
        (r === '1d' || r === '5d' ? meta.chartPreviousClose : undefined) ??
        (candles.length >= 2 ? candles[candles.length - 2].close : undefined);
      const prevCloseNum: number =
        (typeof meta.previousClose === 'number' && meta.previousClose > 0 && meta.previousClose) ||
        (typeof fallbackPrev === 'number' && fallbackPrev > 0 && fallbackPrev) ||
        candles[candles.length - 1].close;

      // Përditëso candle-in e fundit me çmimin realtime (high/low të përfshira)
      if (livePrice) {
        const last = candles[candles.length - 1];
        candles[candles.length - 1] = {
          ...last,
          close: +livePrice.toFixed(4),
          high: +Math.max(last.high, livePrice).toFixed(4),
          low: +Math.min(last.low, livePrice).toFixed(4),
        };
      }

      const out: FinvizChartData = {
        symbol: (typeof meta.symbol === 'string' && meta.symbol) || t,
        company: meta.longName || meta.shortName || t,
        exchange: meta.fullExchangeName || meta.exchangeName || '',
        currency: meta.currency || 'USD',
        price: livePrice ?? candles[candles.length - 1].close,
        previousClose: +Number(prevCloseNum).toFixed(4),
        marketTime: (typeof meta.regularMarketTime === 'number' && meta.regularMarketTime) || Math.floor(Date.now() / 1000),
        interval: itv,
        range: r,
        candles,
      };

      finvizCache.set(cacheKey, { data: out, fetchedAt: Date.now() });
      // Kufiri i cache-it — hiq më të vjetrin
      if (finvizCache.size > 200) {
        const firstKey = finvizCache.keys().next().value;
        if (firstKey) finvizCache.delete(firstKey);
      }
      console.log(`[FINVIZ-CHART] ${t} ${r}/${itv}: ${candles.length} candle-e realë`);
      return out;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.log(`[FINVIZ-CHART] ${t}: ${base} dështoi: ${msg}`);
      continue;
    }
  }

  return null;
}
