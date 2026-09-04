import { NextResponse } from 'next/server';
import { fetchHistoricalData, HistoricalDataPoint } from '@/lib/alpha-vantage';
import { calculateSMA, calculateRSI, calculateADX } from '@/lib/indicators';
import { checkMultiEventRisk } from '@/lib/event-risk';

export { runIBKRScan };
export type { FunnelStock, FunnelResponse };

// ═══════════════════════════════════════════════════════════════
// IBKR FUNNEL SCANNER v2 — Blueprint-aligned
// 5 shtresa: Data → Signal → Execution → Risk → Reporting
// ═══════════════════════════════════════════════════════════════

const UNIVERSE = [
  // Mega Caps + Tech / AI / Semiconductors (50)
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','AVGO','TSLA','BRK.B','LLY',
  'CRM','ORCL','ADBE','NOW','INTU','SNOW','PLTR','DDOG','CRWD','PANW',
  'NET','ZS','FTNT','MRVL','QCOM','TXN','MU','LRCX','AMAT','ADI',
  'KLAC','ON','DELL','HPQ','IBM','CTSH','WDAY','VEEV','HUBS','ANSS',
  'PAYX','CDNS','MANH','STX','AKAM','EQIX','FSLR','ENPH','GFS','ARM',
  // Communication / Media / Platforms (15)
  'DIS','CMCSA','NFLX','EA','TTWO','UBER','ABNB','BKNG','EXPE','ROKU',
  'PARA','LYV','DASH','RBLX','GOOG',
  // Consumer Discretionary / Retail (20)
  'COST','WMT','TGT','HD','LOW','NKE','MCD','SBUX','YUM','CMG',
  'EL','DEO','STZ','CL','KMB','RCL','LULU','TJX','AZO','DLTR',
  // Consumer Staples (15)
  'KO','PEP','PM','MO','BUD','UL','GIS','SJM','HSY','COTY',
  'CPB','CHD','K','CLX','BF.B',
  // Healthcare / Biotech / Pharma (25)
  'UNH','JNJ','MRK','ABBV','PFE','TMO','ABT','DHR','BMY','GILD',
  'VRTX','REGN','BIIB','ISRG','SYK','EW','BSX','MDT','HUM','CI',
  'ELV','CVS','MOH','CNC','IDXX',
  // Finance / Payments / Insurance (25)
  'JPM','V','MA','BAC','GS','MS','AXP','BLK','SCHW','C',
  'USB','PGR','CB','AON','MET','PRU','COF','SYF','DFS','NTRS',
  'ICE','MKTX','CBOE','PYPL','CME',
  // Energy / Oil & Gas (15)
  'XOM','CVX','COP','SLB','EOG','OXY','MPC','PSX','VLO','DVN',
  'FANG','PXD','CTRA','HES','WMB',
  // Industrial / Manufacturing / Aerospace (20)
  'CAT','GE','HON','UPS','RTX','BA','LMT','NOC','GD','DE',
  'MMM','EMR','ITW','ETN','CMI','ROK','PH','JCI','PCAR','FDX',
  // REITs / Infra / Telecom (10)
  'AMT','CCI','SPG','O','PSA','WELL','DLR','VICI','IRM','EQIX',
  // Utilities / Power (10)
  'NEE','DUK','SO','AEP','EXC','SRE','XEL','PEG','EIX','DTE',
];

const DEDUPED_UNIVERSE = [...new Set(UNIVERSE)];

const ETF_SET = new Set(['SPY','QQQ','SMH','XLF','XLE','XLK','XLV','XLY','XLP','XLI','XLB','XLU','XLRE','XLC','GLD','TLT','IWM','VTI','ARKK','SCHD']);

// Sector → ETF mapping
const SECTOR_ETF_MAP: Record<string, string> = {
  Tech: 'XLK',
  Consumer: 'XLY',
  Staples: 'XLP',
  Healthcare: 'XLV',
  Finance: 'XLF',
  Energy: 'XLE',
  Industrial: 'XLI',
  REITs: 'XLRE',
  Utilities: 'XLU',
  Communication: 'XLC',
  Materials: 'XLB',
};

const SECTOR_ETFS = [...new Set(Object.values(SECTOR_ETF_MAP))];

// ── Sector map ──
const SECTOR_MAP: Record<string, string> = {
  // Tech / AI / Semiconductors
  AAPL:'Tech',MSFT:'Tech',NVDA:'Tech',AMZN:'Consumer',GOOGL:'Tech',META:'Tech',
  AVGO:'Tech',TSLA:'Consumer','BRK.B':'Finance',LLY:'Healthcare',
  CRM:'Tech',ORCL:'Tech',ADBE:'Tech',NOW:'Tech',INTU:'Tech',SNOW:'Tech',
  PLTR:'Tech',DDOG:'Tech',CRWD:'Tech',PANW:'Tech',NET:'Tech',ZS:'Tech',
  FTNT:'Tech',MRVL:'Tech',QCOM:'Tech',TXN:'Tech',MU:'Tech',LRCX:'Tech',
  AMAT:'Tech',ADI:'Tech',KLAC:'Tech',ON:'Tech',DELL:'Tech',HPQ:'Tech',
  IBM:'Tech',CTSH:'Tech',WDAY:'Tech',VEEV:'Healthcare',HUBS:'Tech',ANSS:'Tech',
  PAYX:'Tech',CDNS:'Tech',MANH:'Tech',STX:'Tech',AKAM:'Tech',EQIX:'REITs',
  FSLR:'Energy',ENPH:'Energy',GFS:'Tech',ARM:'Tech',GOOG:'Tech',
  // Communication / Media
  DIS:'Consumer',CMCSA:'Communication',NFLX:'Communication',EA:'Consumer',
  TTWO:'Consumer',UBER:'Consumer',ABNB:'Consumer',BKNG:'Consumer',EXPE:'Consumer',
  ROKU:'Communication',PARA:'Communication',LYV:'Communication',DASH:'Consumer',RBLX:'Consumer',
  // Consumer Discretionary
  COST:'Consumer',WMT:'Consumer',TGT:'Consumer',HD:'Consumer',LOW:'Consumer',
  NKE:'Consumer',MCD:'Consumer',SBUX:'Consumer',YUM:'Consumer',CMG:'Consumer',
  EL:'Consumer',DEO:'Consumer',STZ:'Consumer',CL:'Consumer',KMB:'Consumer',
  RCL:'Consumer',LULU:'Consumer',TJX:'Consumer',AZO:'Consumer',DLTR:'Consumer',
  // Consumer Staples
  KO:'Staples',PEP:'Staples',PM:'Staples',MO:'Staples',BUD:'Staples',
  UL:'Staples',GIS:'Staples',SJM:'Staples',HSY:'Staples',COTY:'Consumer',
  CPB:'Staples',CHD:'Staples',K:'Staples',CLX:'Staples','BF.B':'Staples',
  // Healthcare
  UNH:'Healthcare',JNJ:'Healthcare',MRK:'Healthcare',ABBV:'Healthcare',PFE:'Healthcare',
  TMO:'Healthcare',ABT:'Healthcare',DHR:'Healthcare',BMY:'Healthcare',GILD:'Healthcare',
  VRTX:'Healthcare',REGN:'Healthcare',BIIB:'Healthcare',ISRG:'Healthcare',SYK:'Healthcare',
  EW:'Healthcare',BSX:'Healthcare',MDT:'Healthcare',HUM:'Healthcare',CI:'Healthcare',
  ELV:'Healthcare',CVS:'Healthcare',MOH:'Healthcare',CNC:'Healthcare',IDXX:'Healthcare',
  // Finance
  JPM:'Finance',V:'Finance',MA:'Finance',BAC:'Finance',GS:'Finance',
  MS:'Finance',AXP:'Finance',BLK:'Finance',SCHW:'Finance',C:'Finance',
  USB:'Finance',PGR:'Finance',CB:'Finance',AON:'Finance',MET:'Finance',
  PRU:'Finance',COF:'Finance',SYF:'Finance',DFS:'Finance',NTRS:'Finance',
  ICE:'Finance',MKTX:'Finance',CBOE:'Finance',PYPL:'Finance',CME:'Finance',
  // Energy
  XOM:'Energy',CVX:'Energy',COP:'Energy',SLB:'Energy',EOG:'Energy',
  OXY:'Energy',MPC:'Energy',PSX:'Energy',VLO:'Energy',DVN:'Energy',
  FANG:'Energy',PXD:'Energy',CTRA:'Energy',HES:'Energy',WMB:'Energy',
  // Industrial
  CAT:'Industrial',GE:'Industrial',HON:'Industrial',UPS:'Industrial',RTX:'Industrial',
  BA:'Industrial',LMT:'Industrial',NOC:'Industrial',GD:'Industrial',DE:'Industrial',
  MMM:'Industrial',EMR:'Industrial',ITW:'Industrial',ETN:'Industrial',CMI:'Industrial',
  ROK:'Industrial',PH:'Industrial',JCI:'Industrial',PCAR:'Industrial',FDX:'Industrial',
  // REITs
  AMT:'REITs',CCI:'REITs',SPG:'REITs',O:'Energy',PSA:'REITs',WELL:'REITs',
  DLR:'REITs',VICI:'REITs',IRM:'REITs',
  // Utilities
  NEE:'Utilities',DUK:'Utilities',SO:'Utilities',AEP:'Utilities',EXC:'Utilities',
  SRE:'Utilities',XEL:'Utilities',PEG:'Utilities',EIX:'Utilities',DTE:'Utilities',
};

// ── Helpers ──
function calcEMA(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return r;
  let s = 0; for (let i = 0; i < period; i++) s += data[i];
  r[period - 1] = s / period;
  const k = 2 / (period + 1);
  for (let i = period; i < data.length; i++) r[i] = data[i] * k + r[i - 1] * (1 - k);
  return r;
}

function calcATR(data: HistoricalDataPoint[], period = 14): number {
  if (data.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    trs.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function pct(data: number[], days: number): number {
  if (data.length < days + 1) return 0;
  const c = data[data.length - 1], p = data[data.length - 1 - days];
  return p > 0 ? ((c - p) / p) * 100 : 0;
}

// Position sizing: risk-based share calculation
function calcPositionSize(entry: number, stop: number, riskBudgetPct: number, accountEquity: number): { shares: number; positionValue: number; riskDollars: number; riskPct: number } {
  const riskPerShare = entry - stop;
  if (riskPerShare <= 0 || entry <= 0) return { shares: 0, positionValue: 0, riskDollars: 0, riskPct: 0 };
  const riskDollars = accountEquity * (riskBudgetPct / 100);
  const shares = Math.max(0, Math.floor(riskDollars / riskPerShare));
  const positionValue = shares * entry;
  const actualRiskPct = positionValue > 0 ? ((shares * riskPerShare) / accountEquity) * 100 : 0;
  return { shares, positionValue: Math.round(positionValue * 100) / 100, riskDollars: Math.round(riskDollars * 100) / 100, riskPct: Math.round(actualRiskPct * 100) / 100 };
}

// IBKR Bracket Order generator
function generateBracketOrder(symbol: string, action: 'BUY' | 'SELL', entry: number, stop: number, target: number, shares: number): object {
  const cOID = `ibkr_${symbol}_${Date.now()}`;
  const parentOID = `${cOID}_parent`;
  const stopChildOID = `${cOID}_stop`;
  const targetChildOID = `${cOID}_target`;

  return {
    orders: [
      {
        cOID: parentOID,
        symbol,
        orderType: 'LMT',
        side: action,
        quantity: shares,
        price: Math.round(entry * 100) / 100,
        tif: 'GTC',
        transmit: false,
      },
      {
        cOID: stopChildOID,
        symbol,
        orderType: 'STP',
        side: action === 'BUY' ? 'SELL' : 'BUY',
        quantity: shares,
        price: Math.round(stop * 100) / 100,
        tif: 'GTC',
        parentId: parentOID,
        transmit: false,
      },
      {
        cOID: targetChildOID,
        symbol,
        orderType: 'LMT',
        side: action === 'BUY' ? 'SELL' : 'BUY',
        quantity: shares,
        price: Math.round(target * 100) / 100,
        tif: 'GTC',
        parentId: parentOID,
        transmit: true, // last child transmits the bracket
      },
    ],
    summary: `Bracket: ${action} ${shares} ${symbol} @ $${entry.toFixed(2)} | Stop $${stop.toFixed(2)} | Target $${target.toFixed(2)}`,
  };
}

// ── Types ──
type Decision = 'READY' | 'WATCHLIST' | 'NO_TRADE' | 'EVENT_RISK' | 'EXTENDED';

interface FunnelStock {
  symbol: string;
  price: number;
  sector: string;
  // Phase 1: mechanical
  avgVol20d: number;
  avgDolVol20d: number;
  passedLiquidity: boolean;
  passedTrend: boolean;
  passedStackedMA: boolean; // NEW: close > EMA20 > SMA50 > SMA200
  passedADX: boolean;       // NEW: ADX 14 > 25
  passedEventRisk: boolean; // NEW: no critical events
  // Phase 2: technical
  trendScore: number;
  rsScore: number;
  momentumScore: number;
  volConfScore: number;
  setupScore: number;
  // Phase 3: risk
  riskScore: number;
  totalScore: number;
  // Setup detail
  setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE';
  horizon: string;
  // Indicators
  rsi: number;
  atr: number;
  atrPct: number;
  adx: number;           // NEW
  volRatio: number;
  volDeclining: boolean;
  lastDaySpike: boolean;
  pullbackDays: number;
  pullbackPct: number;
  distFromEMA10: number;
  distFromEMA20: number;
  // Trend
  aboveSMA50: boolean;
  aboveSMA200: boolean;
  sma50Above200: boolean;
  stackedMA: boolean;     // NEW
  // RS
  rsVsSPY: number;
  rsVsQQQ: number;
  rsVsSPY60d: number;
  // Entry levels
  entry: number;
  stop: number;
  target1R: number;
  target2R: number;        // NOW 3R
  target3R: number;        // NEW
  riskPct: number;
  rewardRiskRatio: number; // NOW based on 3R
  swingLow: number;
  // NEW: Risk management
  positionSize: number;     // shares
  positionValue: number;   // total $
  riskDollars: number;     // risk in $
  // NEW: Event risk
  eventRisk: string;        // summary text
  eventRiskSeverity: string;
  // NEW: Catalyst Gate
  catalystStatus: string;              // CLEAR | POSITIVE | MIXED | EVENT_RISK | NO_TRADE
  daysToEarnings: number | null;
  macroEventWithin24h: string | null;
  material8KLast30d: boolean;
  material8KSentiment: string;          // none | positive | negative
  positionSizeMultiplier: number;       // 1.0 = full size, 0.5 = half
  allowNewEntry: boolean;
  // NEW: RS vs Sector ETF
  sectorEtf: string;
  rsVsSector20d: number;
  sectorAboveSma50: boolean;
  sectorRsStatus: string;               // LEADING | INLINE | LAGGING
  // NEW: IBKR bracket order
  bracketOrder: object | null;
  // Verdict
  decision: Decision;
  reasons: string[];
  warnings: string[];
  // NEW: Swing Prediction
  ema10Val: number;
  ema20Val: number;
  sma50Val: number;
  pullbackZone: string;       // e.g. "$338.50 - $341.20"
  nextResistance: number;     // 20d high or recent peak
  projectedUpsidePct: number; // % from current price to 3R target
  dailyExpRange: string;      // e.g. "$338 - $345" (price +/- ATR)
  daysTo1R: number;           // estimated trading days to 1R target
  daysTo2R: number;
  daysTo3R: number;
  // NEW: Liquidity Metrics
  spreadPct: number;
  liquidityScore: number;
  liquidityStatus: string;
  // NEW: Overnight Risk
  avgOvernightGap20: number;
  avgOvernightGap60: number;
  overnightGapUpPct: number;
  maxOvernightGapDown: number;
  maxOvernightGapUp: number;
  overnightRiskLevel: string;
  overnightBias: string;
  gapCanSkipStop: boolean;
  stopDistPct: number;
}

interface FunnelResponse {
  scannedAt: string;
  regimeOk: boolean;
  regimeDetail: { spy: { above50: boolean; above200: boolean }; qqq: { above50: boolean; above200: boolean } };
  funnel: { universe: number; passedLiquidity: number; passedTrend: number; passedSetup: number; passedRisk: number; displayed: number; passedEventRisk: number; passedSectorLimit: number; };
  results: FunnelStock[];
  // NEW: exposure summary
  sectorExposure: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN GET HANDLER
// ═══════════════════════════════════════════════════════════════
export const maxDuration = 120;

// Exported core scan function (reusable by other routes)
export async function runIBKRScan(): Promise<FunnelResponse> {
  const t0 = Date.now();
  const ACCOUNT_EQUITY = 25000; // default demo account
  const MAX_RISK_PCT = 1.0;   // max 1% of equity per trade
  const MAX_PER_SECTOR = 2;   // max 2 stocks per sector

  // ── 0. Fetch benchmarks + sector ETFs ──
  const [spyData, qqqData, ...sectorDataArr] = await Promise.all([
    fetchHistoricalData('SPY', '1y'),
    fetchHistoricalData('QQQ', '1y'),
    ...SECTOR_ETFS.map(etf => fetchHistoricalData(etf, '1y')),
  ]);
  if (!spyData || !qqqData) throw new Error('Te dhena SPY/QQQ mungojne');

  // Build sector ETF data map
  const sectorEtfData: Record<string, { closes: number[]; sma50: number[] }> = {};
  SECTOR_ETFS.forEach((etf, i) => {
    const d = sectorDataArr[i];
    if (d) {
      const closes = d.map(dd => dd.close);
      sectorEtfData[etf] = { closes, sma50: calculateSMA(closes, 50) };
    }
  });

  const spyC = spyData.map(d => d.close), qqqC = qqqData.map(d => d.close);
  const spyS50 = calculateSMA(spyC, 50), spyS200 = calculateSMA(spyC, 200);
  const qqqS50 = calculateSMA(qqqC, 50), qqqS200 = calculateSMA(qqqC, 200);
  const sL = spyC.length - 1, qL = qqqC.length - 1;
  const spyA50 = spyC[sL] > (spyS50[sL]||0), spyA200 = spyC[sL] > (spyS200[sL]||0);
  const qqqA50 = qqqC[qL] > (qqqS50[qL]||0), qqqA200 = qqqC[qL] > (qqqS200[qL]||0);
  const regimeOk = spyA50 && spyA200 && qqqA50 && qqqA200;
  const spyRS60 = pct(spyC, 60);

  // ── 1. Fetch all universe OHLCV ──
  const syms = DEDUPED_UNIVERSE.filter(s => !ETF_SET.has(s));
  const hist: Record<string, HistoricalDataPoint[] | null> = {};

  const BATCH = 8;
  for (let i = 0; i < syms.length; i += BATCH) {
    const batch = syms.slice(i, i + BATCH);
    const res = await Promise.allSettled(batch.map(async s => ({ s, d: await fetchHistoricalData(s, '1y') })));
    for (const r of res) if (r.status === 'fulfilled' && r.value.d) hist[r.value.s] = r.value.d;
    if (i + BATCH < syms.length) await new Promise(r => setTimeout(r, 250));
  }

  console.log(`[IBKR v2] Fetched ${Object.keys(hist).length}/${syms.length} stocks in ${((Date.now()-t0)/1000).toFixed(1)}s`);

  // ── 2. PHASE 1 — Mechanical filter (liquidity + trend + ADX + stacked MA + event risk) ──
  const phase1: FunnelStock[] = [];
  let passedEventRiskCount = 0;

  for (const sym of syms) {
    const data = hist[sym];
    if (!data || data.length < 200) continue;

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const vols = data.map(d => d.volume);
    const last = closes.length - 1;
    const price = closes[last];

    // Liquidity checks
    const avgVol20 = vols.slice(-20).reduce((a,b) => a+b, 0) / 20;
    // Proper avg dollar volume: average of daily (close * volume)
    const n20 = Math.min(20, closes.length, vols.length);
    const dailyDolVols: number[] = [];
    for (let i = closes.length - n20; i < closes.length; i++) {
      dailyDolVols.push(closes[i] * vols[i]);
    }
    const avgDolVol = dailyDolVols.reduce((a,b) => a+b, 0) / n20;
    const passedLiq = price >= 10 && avgVol20 >= 1_000_000 && avgDolVol >= 20_000_000;

    // Trend checks (existing)
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    const above50 = price > (sma50[last] || 0);
    const above200 = price > (sma200[last] || 0);
    const golden = (sma50[last] || 0) > (sma200[last] || 0);
    const rs60 = pct(closes, 60);
    const passedTrend = above50 && golden && rs60 > spyRS60;

    // NEW: Stacked MA — close > EMA20 > SMA50 > SMA200
    const ema20 = calcEMA(closes, 20);
    const ema20Val = ema20[last] || 0;
    const sma50Val = sma50[last] || 0;
    const sma200Val = sma200[last] || 0;
    const stackedMA = price > ema20Val && ema20Val > sma50Val && sma50Val > sma200Val;

    // NEW: ADX 14 > 25 (trend strength)
    const adxArr = calculateADX(highs, lows, closes, 14);
    const adx = adxArr[last] || 0;
    const passedADX = adx > 25;

    // NEW: Event risk check
    const eventResult = checkMultiEventRisk(sym);
    const hasCriticalEvent = eventResult.hasCriticalEvent || eventResult.compositeRiskScore <= -50;
    const passedEventRisk = !hasCriticalEvent;
    if (passedEventRisk) passedEventRiskCount++;

    const sector = SECTOR_MAP[sym] || 'Other';

    // Store basic info for all stocks (funnel counts)
    phase1.push({
      symbol: sym, price, sector,
      avgVol20d: avgVol20, avgDolVol20d: avgDolVol,
      passedLiquidity: passedLiq, passedTrend,
      passedStackedMA: stackedMA, passedADX, passedEventRisk,
      trendScore: 0, rsScore: 0, momentumScore: 0, volConfScore: 0, setupScore: 0,
      riskScore: 0, totalScore: 0,
      setup: 'NONE', horizon: '',
      rsi: 0, atr: 0, atrPct: 0, adx: Math.round(adx * 10) / 10,
      volRatio: 0, volDeclining: false, lastDaySpike: false,
      pullbackDays: 0, pullbackPct: 0, distFromEMA10: 0, distFromEMA20: 0,
      aboveSMA50: above50, aboveSMA200: above200, sma50Above200: golden, stackedMA,
      rsVsSPY: 0, rsVsQQQ: 0, rsVsSPY60d: rs60 - spyRS60,
      entry: 0, stop: 0, target1R: 0, target2R: 0, target3R: 0,
      riskPct: 0, rewardRiskRatio: 0, swingLow: 0,
      positionSize: 0, positionValue: 0, riskDollars: 0,
      eventRisk: eventResult.summary, eventRiskSeverity: eventResult.worstEvent.severity,
      catalystStatus: eventResult.catalystStatus,
      daysToEarnings: eventResult.daysToEarnings,
      macroEventWithin24h: eventResult.macroEventWithin24h,
      material8KLast30d: eventResult.material8KLast30d,
      material8KSentiment: eventResult.material8KSentiment,
      positionSizeMultiplier: eventResult.positionSizeMultiplier,
      allowNewEntry: eventResult.allowNewEntry,
      sectorEtf: SECTOR_ETF_MAP[sector] || '',
      rsVsSector20d: 0,
      sectorAboveSma50: false,
      sectorRsStatus: 'INLINE',
      bracketOrder: null,
      decision: 'NO_TRADE', reasons: [], warnings: [],
      ema10Val: 0, ema20Val: 0, sma50Val: 0,
      pullbackZone: '', nextResistance: 0, projectedUpsidePct: 0,
      dailyExpRange: '', daysTo1R: 0, daysTo2R: 0, daysTo3R: 0,
      avgOvernightGap20: 0, avgOvernightGap60: 0,
      overnightGapUpPct: 0, maxOvernightGapDown: 0, maxOvernightGapUp: 0,
      overnightRiskLevel: 'SAFE', overnightBias: 'NEUTRAL',
      gapCanSkipStop: false, stopDistPct: 0,
      spreadPct: 0, liquidityScore: 0, liquidityStatus: 'N/A',
    });
  }

  const passedLiquidity = phase1.filter(s => s.passedLiquidity).length;
  const passedTrend = phase1.filter(s => s.passedTrend).length;

  // ── 3. PHASE 2 — Technical analysis on trend-passed stocks ──
  const phase2: FunnelStock[] = [];

  for (const stock of phase1) {
    if (!stock.passedTrend) continue;

    const data = hist[stock.symbol];
    if (!data) continue;
    const closes = data.map(d => d.close), highs = data.map(d => d.high), lows = data.map(d => d.low);
    const vols = data.map(d => d.volume);
    const last = closes.length - 1;
    const price = closes[last];

    const ema10 = calcEMA(closes, 10);
    const ema20 = calcEMA(closes, 20);
    const rsiArr = calculateRSI(closes, 14);
    const rsi = rsiArr[last] || 50;
    const atr = calcATR(data, 14);
    const atrPct = price > 0 ? (atr / price) * 100 : 0;

    // ── A) Trend Quality (0-100) — 25% weight ──
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    let tScore = 0;
    if (price > (sma50[last]||0)) tScore += 20;
    if (price > (sma200[last]||0)) tScore += 20;
    if ((sma50[last]||0) > (sma200[last]||0)) tScore += 15;
    if (stock.stackedMA) tScore += 15;
    const h20a = Math.max(...highs.slice(-40, -20));
    const h20b = Math.max(...highs.slice(-20));
    if (h20b > h20a) tScore += 15;
    if (stock.adx > 25) tScore += 15;
    stock.trendScore = Math.min(100, tScore);

    // ── B) Relative Strength (0-100) — 20% weight ──
    const rsSpy22 = pct(closes, 22) - pct(spyC, 22);
    const rsQqq22 = pct(closes, 22) - pct(qqqC, 22);
    const rsSpy60 = pct(closes, 60) - pct(spyC, 60);
    let rsScore = 50;
    if (rsSpy22 > 0) rsScore += Math.min(25, rsSpy22 * 3);
    else rsScore -= Math.min(25, Math.abs(rsSpy22) * 3);
    if (rsSpy60 > 0) rsScore += Math.min(25, rsSpy60 * 2);
    else rsScore -= Math.min(25, Math.abs(rsSpy60) * 2);
    stock.rsScore = Math.round(Math.max(0, Math.min(100, rsScore)));
    stock.rsVsSPY = Math.round(rsSpy22 * 100) / 100;
    stock.rsVsQQQ = Math.round(rsQqq22 * 100) / 100;
    stock.rsVsSPY60d = Math.round(rsSpy60 * 100) / 100;

    // ── B2) RS vs Sector ETF (20D) ──
    const sector = stock.sector;
    const sectorEtf = SECTOR_ETF_MAP[sector] || '';
    const etfInfo = sectorEtf ? sectorEtfData[sectorEtf] : null;
    let rsVsSector20d = 0;
    let sectorAboveSma50 = false;
    let sectorRsStatus = 'INLINE' as string;
    if (etfInfo && etfInfo.closes.length >= 21) {
      const stockRet20d = pct(closes, 20);
      const sectorRet20d = pct(etfInfo.closes, 20);
      rsVsSector20d = Math.round((stockRet20d - sectorRet20d) * 100) / 100;
      const etfLast = etfInfo.closes.length - 1;
      sectorAboveSma50 = etfInfo.closes[etfLast] > (etfInfo.sma50[etfLast] || 0);
      if (rsVsSector20d >= 3) sectorRsStatus = 'LEADING';
      else if (rsVsSector20d <= -3) sectorRsStatus = 'LAGGING';
      else sectorRsStatus = 'INLINE';
    }
    stock.sectorEtf = sectorEtf;
    stock.rsVsSector20d = rsVsSector20d;
    stock.sectorAboveSma50 = sectorAboveSma50;
    stock.sectorRsStatus = sectorRsStatus;
    if (sectorRsStatus === 'LEADING' && sectorAboveSma50) stock.rsScore = Math.min(100, stock.rsScore + 8);
    else if (sectorRsStatus === 'LAGGING' && !sectorAboveSma50) stock.rsScore = Math.max(0, stock.rsScore - 8);

    // ── C) Momentum (0-100) — 15% weight ──
    const mom5 = pct(closes, 5), mom10 = pct(closes, 10), mom22 = pct(closes, 22);
    let mScore = 50;
    if (mom5 > -2) mScore += 10; else mScore -= 10;
    if (mom10 > 0) mScore += 15; else mScore -= 10;
    if (mom22 > 0) mScore += 15; else mScore -= 10;
    if (mom5 < 8) mScore += 10; else mScore -= 15;
    stock.momentumScore = Math.round(Math.max(0, Math.min(100, mScore)));

    // ── D) Volume Confirmation (0-100) — 15% weight ──
    const avgVol20 = vols.slice(-20).reduce((a,b) => a+b, 0) / 20;
    const recent3 = vols.slice(-3).reduce((a,b) => a+b, 0) / 3;
    const pbVol = vols.slice(-5, -1);
    const priorVol = vols.slice(-10, -5);
    const avgPb = pbVol.length > 0 ? pbVol.reduce((a,b) => a+b, 0)/pbVol.length : 0;
    const avgPrior = priorVol.length > 0 ? priorVol.reduce((a,b) => a+b, 0)/priorVol.length : 0;
    const volDeclining = avgPb < avgPrior * 0.95;
    const lastDaySpike = vols[last] > avgVol20 * 1.1;
    const volRatio = avgVol20 > 0 ? recent3 / avgVol20 : 1;
    let vScore = 50;
    if (volDeclining) vScore += 20;
    if (lastDaySpike) vScore += 15;
    if (volRatio > 0.8 && volRatio < 1.5) vScore += 10;
    if (avgVol20 > 5_000_000) vScore += 5;
    stock.volConfScore = Math.round(Math.max(0, Math.min(100, vScore)));
    stock.volRatio = Math.round(volRatio * 100) / 100;
    stock.volDeclining = volDeclining;
    stock.lastDaySpike = lastDaySpike;

    // ── E) Setup Quality (0-100) — 10% weight ──
    const ema10Val = ema10[last], ema20Val = ema20[last];
    const dist10 = !isNaN(ema10Val) ? ((price - ema10Val) / ema10Val) * 100 : 99;
    const dist20 = !isNaN(ema20Val) ? ((price - ema20Val) / ema20Val) * 100 : 99;
    stock.distFromEMA10 = Math.round(dist10 * 100) / 100;
    stock.distFromEMA20 = Math.round(dist20 * 100) / 100;

    let highIdx = last;
    for (let i = last; i >= Math.max(0, last - 10); i--) if (closes[i] >= closes[highIdx]) highIdx = i;
    const peakPrice = closes[highIdx];
    const pbPct = peakPrice > 0 ? ((price - peakPrice) / peakPrice) * 100 : 0;
    const swLow = Math.min(...lows.slice(highIdx, last + 1));
    let pbDays = 0;
    for (let i = highIdx + 1; i <= last; i++) if (closes[i] < closes[i-1]) pbDays++;

    stock.pullbackDays = pbDays;
    stock.pullbackPct = Math.round(pbPct * 100) / 100;
    stock.swingLow = Math.round(swLow * 100) / 100;

    let setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE' = 'NONE';
    let sScore = 0;
    const reasons: string[] = [];

    if (pbDays >= 2 && pbDays <= 8 && pbPct >= -8 && pbPct <= -0.5) {
      setup = 'PULLBACK';
      sScore += 30;
      if (pbDays >= 3 && pbDays <= 6) { sScore += 20; reasons.push(`Pullback ${pbDays}d (ideal)`); }
      else { sScore += 10; reasons.push(`Pullback ${pbDays}d`); }
      if (Math.abs(dist10) < 3 || Math.abs(dist20) < 3) { sScore += 20; reasons.push('Afer EMA 10/20'); }
      if (volDeclining) { sScore += 15; reasons.push('Volumi ne renie (i mire)'); }
      if (lastDaySpike) { sScore += 15; reasons.push('Volum konfirmim'); }
      if (rsi >= 40 && rsi <= 65) { sScore += 10; reasons.push(`RSI ${rsi.toFixed(0)}`); }
    }

    if (setup === 'NONE') {
      const high20 = Math.max(...highs.slice(-20));
      if (price >= high20 * 0.98 && lastDaySpike && rsi >= 45 && rsi <= 70) {
        setup = 'BREAKOUT'; sScore = 55;
        reasons.push('Breakout 20d + volum');
        if (rsi >= 45 && rsi <= 65) { sScore += 15; reasons.push(`RSI ${rsi.toFixed(0)}`); }
      }
    }

    if (setup === 'NONE' && pbPct > -0.5 && pbPct < 2 && price > (sma50[last]||0)) {
      setup = 'TREND_CONT'; sScore = 40;
      reasons.push('Trend continuation');
      if (rsi >= 50 && rsi <= 65) { sScore += 15; reasons.push(`RSI ${rsi.toFixed(0)}`); }
      if (lastDaySpike) { sScore += 10; reasons.push('Volum konfirmim'); }
    }

    stock.setup = setup;
    stock.setupScore = Math.min(100, sScore);
    stock.rsi = Math.round(rsi * 10) / 10;
    stock.atr = Math.round(atr * 100) / 100;
    stock.atrPct = Math.round(atrPct * 100) / 100;
    stock.reasons = reasons;

    // Entry / Stop / Target
    const isBreakout = setup === 'BREAKOUT';
    const high20 = Math.max(...highs.slice(-20));
    const entry = isBreakout
      ? Math.round((high20 * 1.002) * 100) / 100
      : Math.round(price * 100) / 100;

    const stopAtr = Math.round((entry - atr * 1.5) * 100) / 100;
    const stopSwing = Math.round((swLow - atr * 0.2) * 100) / 100;
    const stop = Math.max(stopAtr, stopSwing);

    const riskPerShare = entry - stop;
    const riskPct = entry > 0 ? (riskPerShare / entry) * 100 : 0;
    const target1R = Math.round((entry + riskPerShare) * 100) / 100;
    const target2R = Math.round((entry + riskPerShare * 2) * 100) / 100;
    const target3R = Math.round((entry + riskPerShare * 3) * 100) / 100;
    const rr = riskPerShare > 0 ? (riskPerShare * 3) / riskPerShare : 0;

    stock.entry = entry;
    stock.stop = stop;
    stock.target1R = target1R;
    stock.target2R = target2R;
    stock.target3R = target3R;
    stock.riskPct = Math.round(riskPct * 100) / 100;
    stock.rewardRiskRatio = Math.round(rr * 10) / 10;

    const multiplier = stock.positionSizeMultiplier > 0 ? stock.positionSizeMultiplier : 1;
    const pos = calcPositionSize(entry, stop, MAX_RISK_PCT * multiplier, ACCOUNT_EQUITY);
    stock.positionSize = pos.shares;
    stock.positionValue = pos.positionValue;
    stock.riskDollars = pos.riskDollars;

    // Swing Prediction fields
    const ema10V = ema10[last] || 0;
    const ema20V = ema20[last] || 0;
    const sma50V = sma50[last] || 0;
    stock.ema10Val = Math.round(ema10V * 100) / 100;
    stock.ema20Val = Math.round(ema20V * 100) / 100;
    stock.sma50Val = Math.round(sma50V * 100) / 100;
    const pbZoneLow = Math.min(ema10V, ema20V);
    const pbZoneHigh = Math.max(ema10V, ema20V);
    stock.pullbackZone = `$${pbZoneLow.toFixed(2)} – $${pbZoneHigh.toFixed(2)}`;
    stock.nextResistance = Math.round(Math.max(...highs.slice(-20)) * 100) / 100;
    stock.projectedUpsidePct = price > 0 ? Math.round(((target3R - price) / price) * 10000) / 100 : 0;
    stock.dailyExpRange = `$${Math.round((price - atr) * 100) / 100} – $${Math.round((price + atr) * 100) / 100}`;
    const dailyPace = atr > 0 ? atr : price * 0.015;
    stock.daysTo1R = dailyPace > 0 ? Math.round(riskPerShare / dailyPace) : 0;
    stock.daysTo2R = dailyPace > 0 ? Math.round((riskPerShare * 2) / dailyPace) : 0;
    stock.daysTo3R = dailyPace > 0 ? Math.round((riskPerShare * 3) / dailyPace) : 0;

    if (atrPct < 1.5) stock.horizon = '10D';
    else if (atrPct < 3) stock.horizon = '5D';
    else stock.horizon = '5D';

    // ── Overnight Risk Analysis ──
    const opens = data.map(d => d.open);
    const overnightGaps: number[] = [];
    for (let i = 1; i < data.length; i++) {
      if (closes[i-1] > 0) {
        overnightGaps.push(((opens[i] - closes[i-1]) / closes[i-1]) * 100);
      }
    }
    const last60Gaps = overnightGaps.slice(-60);
    const last20Gaps = overnightGaps.slice(-20);
    const avgOG20 = last20Gaps.length > 0 ? last20Gaps.reduce((a,b) => a + Math.abs(b), 0) / last20Gaps.length : 0;
    const avgOG60 = last60Gaps.length > 0 ? last60Gaps.reduce((a,b) => a + Math.abs(b), 0) / last60Gaps.length : 0;
    const gapUpPct = last60Gaps.length > 0 ? (last60Gaps.filter(g => g > 0).length / last60Gaps.length) * 100 : 50;
    const maxOGDown = last60Gaps.length > 0 ? Math.min(...last60Gaps) : 0;
    const maxOGUp = last60Gaps.length > 0 ? Math.max(...last60Gaps) : 0;
    const stopDistPctVal = entry > 0 ? ((entry - stop) / entry) * 100 : 99;
    const gapCanSkip = avgOG60 > stopDistPctVal * 0.7;
    let oRiskLevel: 'SAFE' | 'MODERATE' | 'HIGH' = 'SAFE';
    if (avgOG20 > stopDistPctVal * 0.8 || Math.abs(maxOGDown) > stopDistPctVal * 1.5) {
      oRiskLevel = 'HIGH';
    } else if (avgOG20 > stopDistPctVal * 0.5 || Math.abs(maxOGDown) > stopDistPctVal) {
      oRiskLevel = 'MODERATE';
    }
    const oBias = gapUpPct >= 55 ? 'BULLISH' : gapUpPct <= 45 ? 'BEARISH' : 'NEUTRAL';
    stock.avgOvernightGap20 = Math.round(avgOG20 * 100) / 100;
    stock.avgOvernightGap60 = Math.round(avgOG60 * 100) / 100;
    stock.overnightGapUpPct = Math.round(gapUpPct);
    stock.maxOvernightGapDown = Math.round(maxOGDown * 100) / 100;
    stock.maxOvernightGapUp = Math.round(maxOGUp * 100) / 100;
    stock.overnightRiskLevel = oRiskLevel;
    stock.overnightBias = oBias;
    stock.gapCanSkipStop = gapCanSkip;
    stock.stopDistPct = Math.round(stopDistPctVal * 100) / 100;

    // ── Liquidity Metrics ──
    // Spread estimation (no real bid/ask in historical data)
    // Formula: spreadPct = min(0.5, 1.5 / sqrt(avgDolVol / 1M))
    const advM = stock.avgDolVol20d / 1_000_000;
    const spreadPct = advM > 0 ? Math.min(0.5, 1.5 / Math.sqrt(advM)) : 0.5;
    stock.spreadPct = Math.round(spreadPct * 1000) / 1000; // 3 decimals

    // Dollar Volume Score
    let dvScore = 25;
    if (stock.avgDolVol20d > 100_000_000) dvScore = 100;
    else if (stock.avgDolVol20d > 50_000_000) dvScore = 85;
    else if (stock.avgDolVol20d > 20_000_000) dvScore = 70;
    else if (stock.avgDolVol20d > 10_000_000) dvScore = 50;

    // Spread Score
    let spScore = 25;
    if (spreadPct <= 0.10) spScore = 100;
    else if (spreadPct <= 0.25) spScore = 80;
    else if (spreadPct <= 0.50) spScore = 55;

    const liqScore = Math.round(dvScore * 0.60 + spScore * 0.40);
    stock.liquidityScore = liqScore;

    if (liqScore >= 80) stock.liquidityStatus = 'HIGH';
    else if (liqScore >= 60) stock.liquidityStatus = 'GOOD';
    else if (liqScore >= 40) stock.liquidityStatus = 'MEDIUM';
    else stock.liquidityStatus = 'LOW';

    // ── F) Risk Quality (0-100) — 5% weight ──
    let rScore = 50;
    if (riskPct <= 3) rScore += 20;
    else if (riskPct <= 5) rScore += 10;
    else if (riskPct > 7) rScore -= 20;
    if (rr >= 2) rScore += 15;
    else if (rr >= 1.5) rScore += 5;
    else rScore -= 15;
    if (atrPct < 2) rScore += 10;
    else if (atrPct > 4) rScore -= 10;
    if (!stock.passedEventRisk) rScore -= 25;
    stock.riskScore = Math.round(Math.max(0, Math.min(100, rScore)));

    // ── Total Score ──
    stock.totalScore = Math.round(
      stock.trendScore * 0.25 +
      stock.rsScore * 0.20 +
      stock.momentumScore * 0.15 +
      stock.volConfScore * 0.15 +
      sScore * 0.10 +
      50 * 0.10 +
      stock.riskScore * 0.05
    );

    if (setup !== 'NONE') phase2.push(stock);
  }

  const passedSetup = phase2.length;

  // ── 4. PHASE 3 — Risk gate + Decision + Event risk ──
  const phase3: FunnelStock[] = [];

  for (const stock of phase2) {
    const warnings: string[] = [...stock.warnings];
    let decision: Decision = 'NO_TRADE';

    if (stock.rewardRiskRatio < 2.0) warnings.push(`R:R ${stock.rewardRiskRatio} — i ulet (duhet 1:2 me 3R target)`);
    if (stock.rsi > 75) warnings.push(`RSI ${stock.rsi} — i mbivleresuar`);
    if (stock.riskPct > 8) warnings.push(`Rreziku ${stock.riskPct}% — shume i larte`);
    if (stock.adx < 20) warnings.push(`ADX ${stock.adx} — trendi i dobet (duhet > 25)`);
    if (!regimeOk) warnings.push('REGJIMI jo OK — vetem watcher');
    if (!stock.passedEventRisk) warnings.push(`EVENT RISK: ${stock.eventRisk}`);
    if (!stock.allowNewEntry) warnings.push(`CATALYST GATE: ${stock.catalystStatus} — mos hap long te ri`);
    else if (stock.positionSizeMultiplier < 1) warnings.push(`CATALYST GATE: ${stock.catalystStatus} — pozicion ${Math.round(stock.positionSizeMultiplier * 100)}%`);
    if (!stock.stackedMA) warnings.push('MA jo te stackuara (close/EMA20/SMA50/SMA200)');
    if (stock.sectorRsStatus === 'LAGGING' && !stock.sectorAboveSma50) warnings.push(`SECTOR RS: ${stock.rsVsSector20d}% vs ${stock.sectorEtf} — sektori i dobet`);
    if (stock.pullbackPct > -0.5 && stock.setup === 'PULLBACK') warnings.push('Jo te vertete nje pullback — extended');

    const hasRR = stock.rewardRiskRatio >= 2.0;
    const rsiOk = stock.rsi >= 30 && stock.rsi <= 75;
    const riskOk = stock.riskPct <= 8;
    const scoreOk = stock.totalScore >= 45;
    const eventOk = stock.passedEventRisk;
    const catalystOk = stock.allowNewEntry;
    const sectorRsOk = !(stock.sectorRsStatus === 'LAGGING' && !stock.sectorAboveSma50);

    if (hasRR && rsiOk && riskOk && scoreOk && regimeOk && eventOk && catalystOk && sectorRsOk) {
      decision = 'READY';
    } else if (hasRR && rsiOk && riskOk && scoreOk && (eventOk || !regimeOk)) {
      decision = 'WATCHLIST';
      if (!regimeOk) warnings.push('WATCHLIST: Regjimi nuk lejon long tani');
      if (!eventOk) warnings.push('WATCHLIST: Event risk — prit');
      if (!catalystOk) warnings.push('WATCHLIST: Catalyst gate — prit');
      if (!sectorRsOk) warnings.push('WATCHLIST: Sector RS i dobet — prit');
    } else if (!hasRR || stock.riskPct > 6) {
      if (stock.setupScore >= 50) decision = 'WATCHLIST';
      else decision = 'NO_TRADE';
    } else if (stock.rsi > 72 || stock.pullbackPct > -0.3) {
      decision = 'EXTENDED';
    } else {
      decision = 'WATCHLIST';
    }

    if (!eventOk && decision === 'READY') {
      decision = 'EVENT_RISK';
      warnings.push('EVENT_RISK: Ngjarje kritike — mos hyr');
    }
    if (stock.rsi > 70 && stock.totalScore >= 55) {
      decision = 'EVENT_RISK';
      warnings.push('EVENT_RISK: RSI i larte, rrezik kthimi');
    }

    stock.decision = decision;
    stock.warnings = warnings;

    if (decision === 'READY' && stock.positionSize > 0) {
      stock.bracketOrder = generateBracketOrder(
        stock.symbol, 'BUY', stock.entry, stock.stop, stock.target3R, stock.positionSize
      );
    }

    if (decision === 'READY' || decision === 'WATCHLIST' || decision === 'EVENT_RISK') {
      phase3.push(stock);
    }
  }

  const passedRisk = phase3.length;

  // ── 5. PHASE 4 — Sector exposure limit + Top 10 final ──
  const sectorCount: Record<string, number> = {};
  const afterSectorLimit: FunnelStock[] = [];

  phase3.sort((a, b) => b.totalScore - a.totalScore);

  for (const stock of phase3) {
    const sec = stock.sector;
    if (!sectorCount[sec]) sectorCount[sec] = 0;
    if (sectorCount[sec] < MAX_PER_SECTOR) {
      afterSectorLimit.push(stock);
      sectorCount[sec]++;
    } else {
      stock.warnings.push(`Sector limit: ${sec} ka tashme ${MAX_PER_SECTOR} aksione`);
    }
  }

  const passedSectorLimit = afterSectorLimit.length;
  const topStocks = afterSectorLimit.slice(0, 10);
  topStocks.sort((a, b) => {
    const order: Record<Decision, number> = { READY: 0, WATCHLIST: 1, EVENT_RISK: 2, EXTENDED: 3, NO_TRADE: 4 };
    const diff = (order[a.decision] || 5) - (order[b.decision] || 5);
    return diff !== 0 ? diff : b.totalScore - a.totalScore;
  });

  const sectorExposure: Record<string, number> = {};
  for (const s of topStocks) {
    if (!sectorExposure[s.sector]) sectorExposure[s.sector] = 0;
    sectorExposure[s.sector]++;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[IBKR v2] ${syms.length} → ${passedLiquidity} → ${passedTrend} → ${passedSetup} → ${passedRisk} → ${passedSectorLimit} → ${topStocks.length} (${elapsed}s)`);

  const result = {
    scannedAt: new Date().toISOString(),
    regimeOk,
    regimeDetail: {
      spy: { above50: spyA50, above200: spyA200 },
      qqq: { above50: qqqA50, above200: qqqA200 },
    },
    funnel: {
      universe: syms.length,
      passedLiquidity,
      passedTrend,
      passedSetup,
      passedRisk,
      passedEventRisk: passedEventRiskCount,
      passedSectorLimit,
      displayed: topStocks.length,
    },
    results: topStocks,
    sectorExposure,
  };

  // ── Save snapshots to Adaptive Scanner Learning Engine (non-blocking) ──
  try {
    const { saveStrategySnapshots } = await import('@/lib/scanner-snapshot-service');
    const { ScannerStrategy, ScannerDecision } = await import('@prisma/client');

    const mapDecision = (d: string): typeof ScannerDecision[keyof typeof ScannerDecision] => {
      const map: Record<string, any> = {
        READY: ScannerDecision.READY,
        WATCHLIST: ScannerDecision.WATCHLIST,
        EVENT_RISK: ScannerDecision.EXTENDED_RISK,
        EXTENDED: ScannerDecision.EXTENDED_RISK,
        NO_TRADE: ScannerDecision.NO_TRADE,
      };
      return map[d] || ScannerDecision.NO_TRADE;
    };

    await saveStrategySnapshots(
      ScannerStrategy.IBKR_PULLBACK,
      topStocks.map((stock, index) => ({
        ticker: stock.symbol,
        rank: index + 1,
        totalScore: stock.totalScore,
        decision: mapDecision(stock.decision),
        price: stock.price,
        volume: stock.avgVol20d,
        averageVolume20D: stock.avgVol20d,
        avgDollarVolume20D: stock.avgDolVol20d,
        spreadPct: stock.spreadPct,
        liquidityScore: stock.liquidityScore,
        ema20: stock.ema20Val,
        sma50: stock.sma50Val,
        atr14: stock.atr,
        rsi14: stock.rsi,
        adx14: stock.adx,
        trendScore: stock.trendScore,
        volumeScore: stock.volConfScore,
        sector: stock.sector,
        marketRegime: regimeOk ? 'BULL' : 'BEAR',
        reasons: stock.reasons,
        riskFlags: stock.warnings,
      }))
    );
    console.log(`[IBKR v2] Saved ${topStocks.length} snapshots to learning engine`);
  } catch (e: any) {
    console.error('[IBKR v2] Snapshot save failed (non-blocking):', e?.message || e);
  }

  return result;
}

// HTTP wrapper
export async function GET() {
  try {
    const result = await runIBKRScan();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[IBKR v2] Error:', err);
    return NextResponse.json({ error: err?.message || 'Gabim skaneri' }, { status: 500 });
  }
}
