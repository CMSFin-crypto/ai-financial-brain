import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStock } from '@/lib/market-data';
import { getRealPrice, injectPricesIntoPrompt, fetchHistoricalData } from '@/lib/alpha-vantage';

interface TechnicalAnalysisRequest {
  ticker: string;
  company?: string;
  range?: string;
}

const SYSTEM_PROMPT = `You are an expert technical analyst. Analyze the given stock using technical analysis principles.

IMPORTANT: You MUST respond in ALBANIAN language. All text fields (interpretation, summary, actionPlan, pattern descriptions) must be in Albanian.

You MUST respond ONLY with a valid JSON object (no markdown, no code blocks):

{
  "ticker": "AAPL",
  "company": "Apple Inc.",
  "overallSignal": "BULLISH|BEARISH|NEUTRAL",
  "confidence": 78,
  "priceAnalysis": {
    "currentPrice": 195.50,
    "previousClose": 193.00,
    "priceChange": 1.29,
    "trend": "uptrend|downtrend|sideways",
    "trendStrength": "strong|moderate|weak"
  },
  "indicators": {
    "rsi": {
      "value": 62.5,
      "signal": "neutral|bullish|bearish|overbought|oversold",
      "interpretation": "Shpjegim i detajuar i leximit RSI. Përshkruani në 3-4 fjali: çfarë tregon vlera RSI, a është në zonën e mbipëshitjes/nënshitjes/neutrale, çfarë do të thotë kjo për stokin, dhe çfarë veprimi rekomandohet bazuar në RSI."
    },
    "macd": {
      "value": 1.25,
      "signal": "bullish|bearish|neutral",
      "interpretation": "Shpjegim i detajuar i MACD-së. Përshkruani: vlerën MACD, vijën e sinjalit, histogramin, kryqëzimin MACD/sinjal, forcën e momentit, dhe implikacionet tregtare. 3-4 fjali."
    },
    "movingAverage": {
      "sma20": "193.50",
      "sma50": "188.00",
      "sma200": "178.00",
      "ema12": "194.80",
      "signal": "bullish|bearish|neutral",
      "interpretation": "Shpjegim i detajuar i mesatareve lëvizëse. Përshkruani: pozicionin e çmimit ndaj SMA 20/50/200, kryqëzimet EMA 12/26, Golden/Death Cross, strukturën hierarkike, dhe se çfarë tregon kjo për tendencën. 3-4 fjali."
    },
    "bollingerBands": {
      "upper": "202.00",
      "middle": "195.00",
      "lower": "188.00",
      "signal": "overbought|oversold|neutral",
      "interpretation": "Shpjegim i detajuar i Bollinger Bands. Përshkruani: gjerësinë e brezit (volatilitetin), pozicionin e çmimit brenda brezit, ngushtësimin/shtrirjen, dhe se çfarë do të thotë për lëvizjen e ardhshme. 3-4 fjali."
    },
    "volume": {
      "trend": "increasing|decreasing|average",
      "signal": "bullish|bearish|neutral",
      "interpretation": "Shpjegim i detajuar i vëllimit. Përshkruani: tendencën e vëllimit, konfirmimin ose mungesën e konfirmimit të lëvizjes, interesin institutional, dhe se çfarë rritjeje të vëllimit duhet pritur. 3-4 fjali."
    },
    "stochastic": {
      "k": 72.5,
      "d": 65.0,
      "signal": "bullish|bearish|overbought|oversold|neutral",
      "interpretation": "Shpjegim i detajuar i Stochastic. Përshkruani: vlerat %K dhe %D, zonën (mbipëshitje/nënshitje/neutrale), kryqëzimin %K/%D, forcën e momentit afatshkurtër, dhe implikacionet tregtare. 3-4 fjali."
    }
  },
  "supportResistance": {
    "supports": ["190.00", "185.50", "178.00"],
    "resistances": ["200.00", "205.50", "212.00"]
  },
  "patterns": [
    {
      "name": "Golden Cross",
      "type": "bullish",
      "reliability": "high|moderate|low",
      "description": "Përshkrim i detajuar i modelit grafik, pse shfaqet, çfarë implikon, dhe probabilitetin e suksesit. 2-3 fjali."
    }
  ],
  "candlestickData": [
    {"date": "2025-01-06", "open": 190, "high": 194, "low": 189, "close": 193, "volume": 55000000}
  ],
  "summary": "Përmbledhje e plotë teknike në 4-6 fjali me rekomandime të veçanta. Përfshini: sinjalin e përgjithshëm, tendencën, indikatorët kryesorë, çmimin aktual, dhe orientimin. GJITHMË duhet të jetë e pranishme dhe e detajuar.",
  "actionPlan": "Plan konkret veprimi me nivele specifike HYRJE, STOP LOSS, TARGET 1, TARGET 2, dhe Risk/Reward. Përfshini fonde menaxhimi. GJITHMË duhet të jetë i pranishëm."
}

CRITICAL REQUIREMENTS:
1. ALWAYS include "summary" and "actionPlan" fields - these are MANDATORY and MUST NOT be empty.
2. The "summary" must be 4-6 sentences with specific price levels and indicator values.
3. The "actionPlan" must include: Entry zone, Stop Loss, Target 1, Target 2, Risk/Reward ratio, position sizing.
4. All "interpretation" fields must be 3-4 sentences with specific reasoning and actionable insights.
5. All text MUST be in Albanian language.
6. "candlestickData" should have 20-22 trading days of data (one month).`;

// ═══════════════════════════════════════════
// DETERMINISTIC RANDOM — seeded by ticker
// Results are ALWAYS the same for same ticker
// ═══════════════════════════════════════════

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Deterministic random within range, seeded by ticker
function dr(ticker: string, index: number, min: number, max: number): number {
  const seed = hashString(ticker) + index * 7919;
  return min + seededRandom(seed) * (max - min);
}

function drInt(ticker: string, index: number, min: number, max: number): number {
  return Math.round(dr(ticker, index, min, max));
}

// Generate ~130 days (6 months) of realistic candlestick data, deterministic per ticker
function generateCandlestickData(ticker: string, basePrice: number, trend: 'uptrend' | 'downtrend' | 'sideways') {
  const data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = [];
  const today = new Date();

  // Work backwards ~130 trading days (6 months)
  let price = basePrice;
  const days = 130;

  // First pass: calculate all closes working backwards
  const closes: number[] = [];
  for (let i = days; i >= 0; i--) {
    closes.push(price);
    const drift = trend === 'uptrend' ? 0.002 : trend === 'downtrend' ? -0.0015 : 0;
    const change = dr(ticker, i * 7, -0.015, 0.018) + drift;
    price = price / (1 + change); // reverse to get previous price
  }

  // Reverse so we go from oldest to newest
  closes.reverse();

  // Second pass: generate OHLC for each day
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const dateStr = d.toISOString().split('T')[0];
    const open = closes[i];
    const close = closes[i + 1] || basePrice;
    const spread = Math.abs(close - open);
    const high = Math.max(open, close) + spread * dr(ticker, i * 13 + 1000, 0.1, 0.5);
    const low = Math.min(open, close) - spread * dr(ticker, i * 13 + 2000, 0.1, 0.5);
    const volume = Math.floor(dr(ticker, i * 17 + 3000, 30000000, 80000000));

    data.push({
      date: dateStr,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +Math.max(low, 0.01).toFixed(2),
      close: +close.toFixed(2),
      volume,
    });
  }

  return data;
}

function generateDemoTechnicalAnalysis(ticker: string, company?: string, livePriceNum?: number | null, realChartData?: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> | null) {
  const t = ticker.toUpperCase();
  const raw = getStock(t);
  const p = raw ? {
    company: raw.company,
    sector: raw.sector,
    price: raw.price,
    signal: raw.signal,
    trend: raw.trend,
    pe: raw.pe,
    revGrowth: raw.revGrowth,
  } : {
    company: company || t + ' Corp',
    sector: 'Technology',
    price: 100,
    signal: 'NEUTRAL' as const,
    trend: 'sideways' as const,
    pe: 25,
    revGrowth: '10%',
  };

  // CRITICAL: Use live price if available, otherwise use market-data price
  // Guard: prevent $0 price
  const rawPrice = (livePriceNum && livePriceNum > 0) ? livePriceNum : p.price;
  const price = rawPrice > 0 ? rawPrice : 100;
  const prevClose = +(price * (1 - dr(ticker, 1, 0.005, 0.02))).toFixed(2);
  const priceChange = +((price - prevClose) / prevClose * 100).toFixed(2);

  const isBullish = p.signal === 'BULLISH';
  const isBearish = p.signal === 'BEARISH';

  // ─── RSI (14) ───
  const rsiValue = isBullish ? drInt(ticker, 10, 55, 72) : isBearish ? drInt(ticker, 10, 28, 42) : drInt(ticker, 10, 40, 60);
  const rsiSignal = rsiValue > 70 ? 'overbought' : rsiValue < 30 ? 'oversold' : 'neutral';
  const rsiInterpretation = rsiValue > 70
    ? `RSI(14) në ${rsiValue} — çmimi ka hyrë në zonën e mbipëshit (>70). Kjo tregon se ${p.company} ka përjetuar një lëvizje të shpejtë ngjitëse afërsisht dhe mund të ndodhë një korreksion afërsisht ose një konsolidim në afat të shkurtër. Tregtarët duhet të jenë të kujdesshëm me hapje të reja të gjatë pa pritur një rikthim mbi 70 ose një thyerje të reje. Nëse RSI kalon mbi 80, rreziku i korreksionit rritet ndjeshëm. Megjithatë, në ngritje të fortë, RSI mund të mbetet i mbipëshit për periudha të gjata para se të ndodhë një kthim.`
    : rsiValue < 30
      ? `RSI(14) në ${rsiValue} — çmimi ka hyrë në zonën e nënshitjes (<30). Kjo është një sinjal klasik i kthimit të mundshëm. ${p.company} mund të jetë mbipëshit në afat të shkurtër dhe një rikthim tekniku ose një ndryshim në sentimin mund të sjellë një lehtësim blerës. Megjithatë, një RSI i ulët mund të vazhdojë nëse tendanca themelore mbetet ulëse. Kërkoni konfirmim nga MACD ose Stochastic përpara se të hapni pozicion blerës.`
      : `RSI(14) në ${rsiValue} — çmimi gjendet në zonën neutrale (30-70). Nuk ka sinjal mbipëshitje ose nënshitjeje të fortë. ${p.company} po tregon forcë të moderuar ${isBullish ? 'ngjitëse' : isBearish ? 'ulëse' : 'anësore'}. Prisni për RSI që të afrohet 70 për sinjal ngjitës ose 30 për sinjal ulës. RSI në këtë nivel tregon ekuilibr të moderuar midis blerësve dhe shitësve, dhe lëvizjet e mëdha mund të ndodhin kur RSI dalë nga kjo zonë.`;

  // ─── MACD ───
  const macdValue = isBullish ? +dr(ticker, 20, 0.3, 2.5).toFixed(2) : isBearish ? +dr(ticker, 20, -2.5, -0.3).toFixed(2) : +dr(ticker, 20, -0.5, 0.5).toFixed(2);
  const macdSignalLine = +(macdValue - dr(ticker, 21, 0.1, 0.8)).toFixed(2);
  const macdHistogram = +(macdValue - macdSignalLine).toFixed(2);
  const macdSignal = macdValue > 0.2 ? 'bullish' : macdValue < -0.2 ? 'bearish' : 'neutral';
  const macdInterpretation = macdSignal === 'bullish'
    ? `MACD në ${macdValue > 0 ? '+' : ''}${macdValue} me vijën e sinjalit në ${macdSignalLine}. Histogrami MACD është pozitiv (${macdHistogram > 0 ? '+' : ''}${macdHistogram}), çka tregon moment ngjitës në rritje. Kur MACD kryqëzon mbi vijën e sinjalit nga poshtë, është një sinjal blerje. Kjo konfirmohet kur histogrami zgjërohet. Forca e këtij sinjali varet nga distanca midis MACD dhe vijës së sinjalit. Nëse histogrami fillon të ngushtohet, kjo mund të tregojë dobësim momenti.`
    : macdSignal === 'bearish'
      ? `MACD në ${macdValue} me vijën e sinjalit në ${macdSignalLine}. Histogrami MACD është negativ (${macdHistogram}), çka tregon moment ulës në rritje. Kur MACD kryqëzon nën vijën e sinjalit, është një sinjal shitjeje. Forca e rrezikut rritet kur histogrami zgjerohet negativisht. Prisni për divergjencë bullish (çmimi bën low të ri por MACD bën low më të lartë) përpara se të merrni pozicion blerës.`
      : `MACD në ${macdValue} me vijën e sinjalit në ${macdSignalLine}. Histogrami është afër zeros (${macdHistogram}), çka tregon moment neutral. Nuk ka sinjal të qartë nga MACD. Prisni për një kryqëzim të qartë mbi ose nën vijën e sinjalit përpara se të merrni vendim. Divergjencat midis çmimit dhe MACD-së mund të jenë sinjale të hershme të ndryshimit të tendencës. Vëmendje e veçantë kur MACD afrohet zeros nga një nga anët.`;

  // ─── Moving Averages ───
  const sma20 = +(price * dr(ticker, 30, 0.975, 1.005)).toFixed(2);
  const sma50 = +(price * dr(ticker, 31, 0.93, 0.98)).toFixed(2);
  const sma200 = +(price * dr(ticker, 32, 0.87, 0.94)).toFixed(2);
  const ema12 = +(price * dr(ticker, 33, 0.992, 1.003)).toFixed(2);
  const ema26 = +(price * dr(ticker, 34, 0.985, 0.998)).toFixed(2);

  let maSignal: string;
  let maInterpretation: string;
  if (isBullish) {
    maSignal = 'bullish';
    const aboveSma20 = price > sma20;
    const aboveSma50 = price > sma50;
    const aboveSma200 = price > sma200;
    const goldenCross = sma50 > sma200;
    maInterpretation = `Çmimi $${price} ${aboveSma20 ? `është MBI SMA 20 ($${sma20})` : `është NËN SMA 20 ($${sma20})`}. ${aboveSma50 ? `Mbi SMA 50 ($${sma50})` : `Nën SMA 50 ($${sma50})`}. ${aboveSma200 ? `Dhe mbi SMA 200 ($${sma200})` : `Nën SMA 200 ($${sma200})`}. EMA 12 ($${ema12}) ${ema12 > ema26 ? `mbi EMA 26 ($${ema26}) — moment ngjitës afatgjatë` : `nën EMA 26 ($${ema26})`}. ${goldenCross ? 'Golden Cross aktif (SMA50 > SMA200) — sinjal afatgjatë ngjitës me besueshmëri të lartë.' : 'Asnji Golden/Death Cross nuk është prezent.'} ${aboveSma20 && aboveSma50 ? 'Struktura e çmimeve është plotësisht ngjitëse me të gjitha SMA-të kryesore si suporte hierarkike. Suportet janë: SMA20 > SMA50 > SMA200.' : 'Çmimi po testuar suportet/nivelat kryesore.'}`;
  } else if (isBearish) {
    maSignal = 'bearish';
    const belowSma20 = price < sma20;
    const belowSma50 = price < sma50;
    const belowSma200 = price < sma200;
    const deathCross = sma50 < sma200;
    const emaBull = ema12 > ema26;
    maInterpretation = `Çmimi $${price} ${belowSma20 ? `është NËN SMA 20 ($${sma20})` : `është MBI SMA 20 ($${sma20})`}. ${belowSma50 ? `Nën SMA 50 ($${sma50})` : `Mbi SMA 50 ($${sma50})`}. ${belowSma200 ? `Dhe nën SMA 200 ($${sma200})` : `Mbi SMA 200 ($${sma200})`}. EMA 12 ($${ema12}) ${emaBull ? `mbi EMA 26 ($${ema26})` : `nën EMA 26 ($${ema26})`}. ${deathCross ? 'Death Cross aktif (SMA50 < SMA200) — sinjal ulës afatgjatë me rrezik të lartë.' : 'Asnji Death Cross.'} ${belowSma20 && belowSma50 ? 'Çmimi po tregtohet nën të gjitha SMA-të kryesore, çka tregon presion shitës të fortë. Rezistencat janë: SMA20 > SMA50 > SMA200.' : 'Çmimi po testuar rezistencat kryesore.'}`;
  } else {
    maSignal = 'neutral';
    maInterpretation = `Çmimi $${price} po lëviz midis SMA 20 ($${sma20}) dhe SMA 50 ($${sma50}), duke treguar paqëndrueshmëri. SMA 200 ($${sma200}) është ${price > sma200 ? 'nën çmimin aktual si suport afatgjatë' : 'mbi çmimin aktual si rezistencë'}. EMA 12 ($${ema12}) ${ema12 > ema26 ? 'është mbi EMA 26' : 'është nën EMA 26'}, duke treguar moment ${ema12 > ema26 ? 'lehtësisht ngjitës' : 'lehtësisht ulës'}. Prisni për një kryqëzim të qartë EMA 12/26 për konfirmim të drejtit të ardhshëm. Një thyerje me vëllim mbi SMA 50 do të jetë sinjal pozitiv.`;
  }

  // ─── Bollinger Bands ───
  const bbMiddle = +price.toFixed(2);
  const bbWidth = dr(ticker, 40, 0.03, 0.06);
  const bbUpper = +(price * (1 + bbWidth)).toFixed(2);
  const bbLower = +(price * (1 - bbWidth)).toFixed(2);
  const bbPosition = price > bbUpper ? 'mbi brezin e sipërm' : price < bbLower ? 'nën brezin e poshtëm' : price > bbMiddle ? 'në gjysmën e sipërme' : 'në gjysmën e poshtme';
  const bbSignal = price > bbUpper ? 'overbought' : price < bbLower ? 'oversold' : 'neutral';
  const bbInterpretation = `Bollinger Bands: Upper $${bbUpper} | Middle $${bbMiddle} | Lower $${bbLower}. Gjerësia e brezit është ${bbWidth > 0.04 ? 'e gjerë (volatilitet i lartë) — çmimi po lëviz në një rang të gjerë me lëvizje të mëdha ditor' : 'e ngushtë (volatilitet i ulët) — kjo zakonisht paraprin një lëvizje të madhe të çmimit, ngushtësimi është sinjal i hershëm i volatilitetit të ardhshëm'}. Çmimi $${price} është ${bbPosition}. ${price > bbUpper ? 'Çmimi ka kaluar mbi brezin e sipërm — kjo tregon mbipëshitje të mundshme. Një rikthim pranë brezit të mesëm ($' + bbMiddle + ') është shpesh herë rezultat. Kjo mund të jetë sinjal shitjeje për fitted traders.' : price < bbLower ? 'Çmimi ka kaluar nën brezin e poshtëm — kjo tregon nënshitje të mundshme. Çdo rikthim mbi brezin e poshtëm do të jetë sinjal i lehtë ngjitës. Kjo është zonë e mirë për të kërkuar blerje me stop të ngushtë.' : 'Çmimi brenda brezit — nuk ka sinjal ekstrem. Lëvizjet brenda brezit janë normale derisa të ndodhë një thyerje e brezit.'}`;

  // ─── Volume ───
  const volumeTrend = isBullish ? (drInt(ticker, 50, 0, 2) === 0 ? 'increasing' : 'average') : isBearish ? (drInt(ticker, 50, 0, 2) === 0 ? 'decreasing' : 'average') : 'average';
  const volumeSignal = isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral';
  const volumeInterpretation = volumeTrend === 'increasing'
    ? `Vëllimi është në rritje, çka konfirmon ${isBullish ? 'forca blerëse' : 'presionin shitës'}. Kur çmimi rritet me vëllim në rritje, lëvizja konsiderohet e qëndrueshme dhe mbështetet nga interes real, jo thjesht spekulim. ${isBullish ? 'Kjo sugjeron interes të vazhdueshëm institutional dhe rrugë kohore pozitive. Një rritje e papritur e vëllimit mund të konfirmojë thyerje të reja.' : 'Vëllimi i lartë me çmime në rënie konfirmon lëvizjen ulëse me entuziazëm shitës.'} Prisni që vëllimi të bjerë për konfirmim fazën e fundit të lëvizjes.`
    : volumeTrend === 'decreasing'
      ? `Vëllimi është në rënie, çka tregon mungesë interesi ose konsolidim. ${isBearish ? 'Ndonëse çmimet janë ulëse, vëllimi i ulët mund të thotë se shitja po mbaron dhe tregtarët po heqin dorë nga shitja e shkurtër.' : 'Mungesa e vëllimit bën që lëvizjet e çmimit të jenë më pak të besueshme.'} Një rritje e papritur e vëllimit mund të sjellë një thyerje të re dhe një lëvizje të fortë. Kjo mund të jetë periudhë e mirë për të vendosur pozicione me rrezik të ulët.`
      : `Vëllimi është mesatar, as në rritje as në rënie të thellë. ${isBullish ? 'Lëvizja ngjitëse nuk ka mbështetje të fortë nga vëllimi — kjo bën që lëvizjet të jenë më pak të besueshme.' : isBearish ? 'Lëvizja ulëse nuk është konfirmuar plotësisht nga vëllimi — mund të jetë vetëm një korreksion i përkohshëm.' : 'Tregu është në gjendje ekuilibri.'} Mbajtja e syrit për një ndryshim të papritur në vëllim mund të paraqesë sinjalin tjetër të rëndësishëm. Vëllimi është çelësi për konfirmimin e çdo thyerjeje.`;

  // ─── Stochastic ───
  const stochK = isBullish ? drInt(ticker, 60, 55, 80) : isBearish ? drInt(ticker, 60, 15, 40) : drInt(ticker, 60, 35, 65);
  const stochD = stochK - drInt(ticker, 61, 3, 12);
  const stochSignal = stochK > 80 ? 'overbought' : stochK < 20 ? 'oversold' : isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral';
  const stochInterpretation = stochK > 80
    ? `Stochastic %K: ${stochK} | %D: ${stochD} — Të dyja vijat janë në zonën e mbipëshit (>80). Kjo tregon se ${p.company} ka qenë nën presion blerës intensiv afërsisht. Një kryqëzim %K nën %D në këtë zonë është një sinjal klasik shitjeje. Megjithatë, në ngritje të fortë, Stochastic mund të mbetet i mbipëshit për periudha të gjata. Kini kujdes me sinjale false — konfirmoni me RSI dhe MACD përpara se të merrni vendim.`
    : stochK < 20
      ? `Stochastic %K: ${stochK} | %D: ${stochD} — Vijat janë në zonën e nënshitjes (<20). Kjo tregon se çmimi ka rënë shumë në afat të shkurtër. Një kryqëzim %K mbi %D në këtë zonë është një sinjal blerjeje klasik. Kjo kombinohet mirë me RSI < 30 për një sinjal të fortë kthimi. Çmimi zakonisht rifillon lëvizjen lart brenda 3-5 ditëve pas këtij sinjali.`
      : `Stochastic %K: ${stochK} | %D: ${stochD} — Vija %K ${stochK > stochD ? 'është MBI %D' : 'është NËN %D'}, duke treguar moment ${stochK > stochD ? 'ngjitës' : 'ulës'}. Nuk ka sinjal ekstrem në këtë moment. ${stochK > stochD && stochK < 50 ? 'Kryqëzimi i ardhshëm %K mbi %D mund të jetë sinjal i hershëm ngjitës — vërejeni me kujdes.' : stochK < stochD && stochK > 50 ? 'Kryqëzimi i ardhshëm %K nën %D mund të jetë paralajmërim ulës — kini kujdes.' : 'Stochastic është në zonë neutrale, as nuk konfirmon as mohon tendencën kryesore.'}`;

  // ─── Support & Resistance ───
  const supports = [
    +(price * dr(ticker, 70, 0.96, 0.985)),
    sma50,
    sma200,
  ].sort((a, b) => b - a).map(v => v.toFixed(2));

  const resistances = [
    +(price * dr(ticker, 71, 1.015, 1.04)),
    bbUpper,
    +(price * dr(ticker, 72, 1.05, 1.10)),
  ].sort((a, b) => a - b).map(v => v.toFixed(2));

  // ─── Chart Patterns ───
  const patterns: Array<{ name: string; type: string; reliability: string; description: string }> = [];

  if (isBullish) {
    if (sma50 > sma200) {
      patterns.push({
        name: 'Golden Cross',
        type: 'bullish',
        reliability: 'high',
        description: `SMA 50 ($${sma50}) ka kaluar mbi SMA 200 ($${sma200}). Kjo është një nga sinjalet më të besueshme teknike afatgjatë, dhe tregon fillimin e një tendence ngjitëse të re. Historikisht, çmimi ka performuar mirë pas Golden Cross për aksione me fondamente të forta. Ky sinjal ka një horizont kohor prej disa javëve deri disa muajsh.`,
      });
    }
    if (price > sma20 && sma20 > sma50) {
      patterns.push({
        name: 'Triple MA Alignment',
        type: 'bullish',
        reliability: 'high',
        description: `Çmimi > SMA 20 ($${sma20}) > SMA 50 ($${sma50}) — tre mesatare në përputhje ngjitëse. Struktura e çmimeve është shëndetshme me të gjitha mesataret si nivele suporti hierarkike. Çdo rënie i gjen suport në mesataren e ardhshme.`,
      });
    }
    patterns.push({
      name: 'Higher Highs / Higher Lows',
      type: 'bullish',
      reliability: 'moderate',
      description: `Çmimi po bën higt e reja të larta me low-t e reja më të larta, çka konfirmon tendencën ngjitëse aktuale. Kjo strukturë do të vazhdojë derisa të shihet një lower high, moment në të cilin sinjali do të dobësohet.`,
    });
    if (drInt(ticker, 80, 0, 1) === 1) {
      patterns.push({
        name: 'Bull Flag / Pennant',
        type: 'bullish',
        reliability: 'moderate',
        description: 'Formim i vogël konsolidimi pas lëvizjes ngjitëse. Kjo është një model vazhdim i cili zakonisht çon në vijim të tendencës ngjitëse pas një pushimi të shkurtër. Caktohet me thyerje mbi suportin e flag-së me vëllim.',
      });
    }
  } else if (isBearish) {
    if (sma50 < sma200) {
      patterns.push({
        name: 'Death Cross',
        type: 'bearish',
        reliability: 'high',
        description: `SMA 50 ($${sma50}) ka kaluar nën SMA 200 ($${sma200}). Death Cross është një sinjal ulës afatgjatë. Megjithatë, në disa raste çmimi thehet poshtë para se të shfaqet vërtet ulësja — kështu që prit konfirmim nga MACD ose vëllimi.`,
      });
    }
    patterns.push({
      name: 'Lower Highs / Lower Lows',
      type: 'bearish',
      reliability: 'moderate',
      description: 'Çmimi po bën hight e reja më të ulëta me low-t e reja më të ulëta. Struktura ulëse aktive tregon se shitësit kontrollojnë tregun dhe çdo rilëvizje shitet nga traders.',
    });
    if (drInt(ticker, 81, 0, 1) === 1) {
      patterns.push({
        name: 'Bear Flag',
        type: 'bearish',
        reliability: 'moderate',
        description: 'Konsolidim i përkohshëm pas rënies, tipik për vazhdim ulës. Prisni thyerje nën suportin e flag-së për konfirmim. Modeli ka sukses ~70% të kohës kur konfirmohet me vëllim.',
      });
    }
  } else {
    patterns.push({
      name: 'Consolidation / Range',
      type: 'neutral',
      reliability: 'low',
      description: `Çmimi po lëviz në një rang të ngushtë midis rezistencës $${resistances[0]} dhe suportit $${supports[0]}. Kjo konsolidim zakonisht paraprin një thyerje të madhe. Prisni thyerje me vëllim përpara se të veproni. Drejtimi i thyerjes do të përcaktojë trendin e ardhshëm.`,
    });
  }

  // ─── Candlestick Data: Use REAL data if available, else generate ───
  let candlestickData;
  if (realChartData && realChartData.length >= 10) {
    // Use real historical data, but ensure the last data point matches live price
    candlestickData = realChartData.map(d => ({
      date: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }));
  } else {
    candlestickData = generateCandlestickData(ticker, price, p.trend);
  }

  // ─── Confidence (deterministic) ───
  const confidence = isBullish ? drInt(ticker, 90, 65, 85) : isBearish ? drInt(ticker, 90, 55, 75) : drInt(ticker, 90, 40, 60);

  // ─── Summary (deterministic per signal type — ALWAYS present) ───
  let summary: string;
  if (isBullish) {
    summary = `${p.company} ($${price}, ${priceChange >= 0 ? '+' : ''}${priceChange}%) tregon një tendencë ngjitëse të ${price > sma200 ? 'fortë' : 'moderuar'} me çmimin ${price > sma50 ? 'mbi SMA 50' : 'duke testuar SMA 50'}. RSI(14) në ${rsiValue} tregon hapësirë për rritje të mëtejshme përpara se të hyjë në mbipëshitje (>70). MACD pozitiv me ${macdValue > macdSignalLine ? 'histogram në zgjerim' : 'histogram stabil'}, duke konfirmuar moment blerës aktiv. Vëllimi ${volumeTrend === 'increasing' ? 'mbështet lëvizjen aktuale me interes institucional' : 'mesatar — monitoroni për rritje vëllimi për konfirmim'}. Stochastic %K në ${stochK} ${stochK < 80 ? 'me hapësirë për rritje' : 'afër zonës së mbipëshitjes — kini kujdes'}. Nëse çmimi mbart suportin $${supports[0]}, pritet vazhdim ngjitës drejt rezistencës $${resistances[0]}. Sinjali gjeneral: BULLISH me besueshmëri ${confidence}%.`;
  } else if (isBearish) {
    summary = `${p.company} ($${price}, ${priceChange >= 0 ? '+' : ''}${priceChange}%) tregon tendencë ulëse aktive me çmimin ${price < sma50 ? 'nën SMA 50' : 'po afruar SMA 50'}. RSI(14) në ${rsiValue} ${rsiValue < 35 ? 'duke afrohur zonën e nënshitjes (<30) — sinjal i mundshëm rikthimi' : 'në nivel neutral pa sinjal të fortë'}. MACD negativ (${macdValue}) me moment ulës aktiv. ${sma50 < sma200 ? 'Death Cross aktiv — sinjal ulës afatgjatë me rrezik të lartë.' : 'Struktura mesatareve po dobësohet progresivisht.'} Vëllimi ${volumeTrend === 'decreasing' ? 'në rënie — mund të tregojë mbarim të shitjes' : volumeTrend === 'increasing' ? 'në rritje me çmime në rënie — konfirmim ulës' : 'mesatar — pa konfirmim të qartë'}. Stochastic %K në ${stochK} tregon moment ulës. Çdo rikthim mbi $${resistances[0]} do të jetë testim kyç. Nëse suporti $${supports[0]} thyhet, presni rënie të mëtejshme drejt $${supports[1]}. Sinjali gjeneral: BEARISH me besueshmëri ${confidence}%.`;
  } else {
    summary = `${p.company} ($${price}, ${priceChange >= 0 ? '+' : ''}${priceChange}%) po lëviz në një drejtim anësor pa sinjal të qartë. RSI(14) në ${rsiValue} është neutral midis 30-70. MACD pranë zeros (${macdValue}), pa moment të dallueshëm. Çmimi ${price > sma20 ? `mbi SMA 20 ($${sma20})` : `nën SMA 20 ($${sma20})`} me SMA 50 ($${sma50}) si referencë tjetër. Stochastic %K në ${stochK} — asnjë sinjal ekstrem. Vëllimi mesatar tregton mungesë interesi institucional. Prisni thyerje mbi $${resistances[0]} me vëllim rritës për sinjal ngjitës, ose thyerje nën $${supports[0]} për sinjal ulës. Deri atëherë, asnjë veprim rekomandohet. Sinjali gjeneral: NEUTRAL me besueshmëri ${confidence}%.`;
  }

  // ─── Action Plan (deterministic per signal type — ALWAYS present) ───
  let actionPlan: string;
  const entry = +(price * dr(ticker, 95, 0.985, 1.0)).toFixed(2);
  const stopLoss = +(price * dr(ticker, 96, 0.955, 0.975)).toFixed(2);
  const target1 = +(price * dr(ticker, 97, 1.02, 1.04)).toFixed(2);
  const target2 = +(price * dr(ticker, 98, 1.05, 1.08)).toFixed(2);
  const risk = Math.abs(price - stopLoss);
  const reward = Math.abs(target1 - price);
  const rr = (reward / risk).toFixed(1);

  if (isBullish) {
    actionPlan = `HYRJE: $${entry} - $${price} (zona e blerjes aktive — blini pranë suportit $${supports[0]}) | STOP LOSS: $${stopLoss} (nën SMA 20, -${((1 - stopLoss / price) * 100).toFixed(1)}%) | TARGET 1: $${target1} (+${((target1 / price - 1) * 100).toFixed(1)}%) — mbyllni 50% të pozicionit | TARGET 2: $${target2} (+${((target2 / price - 1) * 100).toFixed(1)}%) — mbyllni pjesën e mbetur | Risk/Reward: 1:${rr} | FONDIM: Përfitimi i përmasës 1/2 në levelin e ${target1}, lëre pjesën e mbetur me trailing stop në ${sma20}. Nëse çmimi bën lower high poshtë ${supports[0]}, dil nga pozicioni menjëherë. Prisni vëllim konfirmues përpara hyrjes.`;
  } else if (isBearish) {
    actionPlan = `KUJDES: Tendencë ulëse aktive — ASNJË HYRJE BLERËSE tani. Nëse jeni në pozicion, konsideroni SHITJE ose vendosni STOP në $${stopLoss}. Suporti kryesor: $${supports[0]} | Nëse $${supports[0]} thyhet me vëllim, next target $${supports[1]}. Nëse dëshironi SHORT: Hyrje $${price} | Stop $${resistances[0]} | Target $${target1} | Risk/Reward: 1:${rr}. Prisni RSI < 30 ose divergjencë bullish përpara se të merrni pozicion blerës. Për kursimtar: vërejeni për divergjencë midis çmimit dhe RSI/MACD.`;
  } else {
    actionPlan = `PRISNI: Asnjë veprim deri në thyerje të qartë me vëllim. SUPORTI KRYESOR: $${supports[0]} (nëse thyhet me vëllim > mesatarja, shikoni rënie drejt $${supports[1]} dhe pastaj $${supports[2]}) | REZISTENCA KRYESORE: $${resistances[0]} (nëse thyhet me vëllim, shikoni rritje drejt $${resistances[1]}). Monitoroni vëllimin — një rritje e papritur mund të jetë sinjali i hershëm i thyerjes. Stochastic dhe RSI mund të ofrojnë sinjale paraprake. Përdorni limit order pranë niveleve kryesore.`;
  }

  return {
    ticker: t,
    company: p.company,
    sector: p.sector,
    overallSignal: p.signal,
    confidence,
    isDemo: true,
    priceAnalysis: {
      currentPrice: price,
      previousClose: prevClose,
      priceChange: +priceChange.toFixed(2),
      trend: p.trend,
      trendStrength: isBullish || isBearish ? 'moderate' : 'weak',
    },
    indicators: {
      rsi: { value: rsiValue, signal: rsiSignal, interpretation: rsiInterpretation },
      macd: { value: macdValue, signal: macdSignal, interpretation: macdInterpretation },
      movingAverage: {
        sma20: sma20.toFixed(2),
        sma50: sma50.toFixed(2),
        sma200: sma200.toFixed(2),
        ema12: ema12.toFixed(2),
        signal: maSignal,
        interpretation: maInterpretation,
      },
      bollingerBands: { upper: bbUpper.toFixed(2), middle: bbMiddle.toFixed(2), lower: bbLower.toFixed(2), signal: bbSignal, interpretation: bbInterpretation },
      volume: { trend: volumeTrend, signal: volumeSignal, interpretation: volumeInterpretation },
      stochastic: { k: stochK, d: stochD, signal: stochSignal, interpretation: stochInterpretation },
    },
    supportResistance: { supports, resistances },
    patterns,
    candlestickData,
    summary,
    actionPlan,
  };
}

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let tickerUpper = '';

  try {
    const body: TechnicalAnalysisRequest = await request.json();
    const { ticker, range: userRange } = body;
    const range = userRange || '1mo';

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
    }

    tickerUpper = ticker.trim().toUpperCase();

    // ═══ PARALLEL: Fetch real price + real historical chart data ═══
    const [livePrice, realChartData] = await Promise.all([
      getRealPrice(tickerUpper),
      fetchHistoricalData(tickerUpper, range),
    ]);

    const realPriceNum = livePrice ? livePrice.price : null;
    console.log(`[TECHNICAL] ${tickerUpper}: price=${livePrice ? '$' + livePrice.price : 'N/A'}, chart=${realChartData ? realChartData.length + ' days' : 'N/A'}`);

    // ═══ Try real AI first ═══
    let userMessage = `Perform a comprehensive technical analysis for ${tickerUpper}. Include RSI(14), MACD, Moving Averages (SMA 20/50/200, EMA 12/26), Bollinger Bands, Volume analysis, Stochastic (%K/%D), support/resistance levels, chart patterns, and 30 days of candlestick data. Provide specific entry/exit/stop-loss levels.`;

    // Inject real prices into prompt
    if (livePrice) {
      userMessage = injectPricesIntoPrompt(userMessage, { [tickerUpper]: livePrice });
    }

    // If we have real chart data, tell the AI
    if (realChartData && realChartData.length > 0) {
      const lastDay = realChartData[realChartData.length - 1];
      userMessage += `\n\nHISTORICAL DATA CONTEXT (last ${realChartData.length} trading days):\n` +
        `Recent prices: ${realChartData.slice(-5).map(d => `${d.date}: O=${d.open} H=${d.high} L=${d.low} C=${d.close}`).join(' | ')}\n` +
        `Latest close: $${lastDay.close} on ${lastDay.date}\n` +
        `Price range (30d): Low $${Math.min(...realChartData.map(d => d.low))} — High $${Math.max(...realChartData.map(d => d.high))}`;
    }

    let content: string = '';
    let usedAI = false;
    try {
      content = await callAI({
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        temperature: 0.1, // Very low temp for consistency
        timeoutMs: 35000,
        retries: 0,
      });
      usedAI = true;
    } catch {
      // AI unavailable — use demo data with REAL price for ALL calculations
      console.log(`[DEMO MODE] AI unavailable for ${tickerUpper}, using simulation`);
    }

    if (!usedAI || !content) {
      // ═══ DEMO MODE: Deterministic fallback ═══
      const demo = generateDemoTechnicalAnalysis(tickerUpper, body.company, realPriceNum, realChartData);
      if (livePrice && demo.priceAnalysis) {
        demo.priceAnalysis.currentPrice = livePrice.price;
        demo.priceAnalysis.previousClose = livePrice.previousClose;
        demo.priceAnalysis.priceChange = livePrice.change;
      }
      // Mark if we used real chart data in demo
      if (realChartData && realChartData.length >= 10) {
        (demo as Record<string, unknown>).isRealChart = true;
      }

      return NextResponse.json({ analysis: demo, demo: true });
    }

    // ═══ AI MODE: Parse and post-process ═══
    const fallback = {
      ticker: ticker.toUpperCase(),
      company: body.company || ticker.toUpperCase(),
      overallSignal: 'NEUTRAL',
      confidence: 50,
      priceAnalysis: { currentPrice: realPriceNum || 0, previousClose: 0, priceChange: 0, trend: 'sideways', trendStrength: 'weak' },
      indicators: { rsi: { value: 50, signal: 'neutral', interpretation: '' }, macd: { value: 0, signal: 'neutral', interpretation: '' }, movingAverage: { sma20: '0', sma50: '0', sma200: '0', ema12: '0', signal: 'neutral', interpretation: '' }, bollingerBands: { upper: '0', middle: '0', lower: '0', signal: 'neutral', interpretation: '' }, volume: { trend: 'average', signal: 'neutral', interpretation: '' }, stochastic: { k: 50, d: 50, signal: 'neutral', interpretation: '' } },
      supportResistance: { supports: [], resistances: [] },
      patterns: [],
      candlestickData: [],
      summary: '',
      actionPlan: '',
    };

    const analysis = parseAIResponse(content, fallback);

    // Force real price into AI response
    if (livePrice && analysis && typeof analysis === 'object' && 'priceAnalysis' in analysis) {
      const pa = analysis.priceAnalysis as Record<string, unknown>;
      if (pa) {
        pa.currentPrice = livePrice.price;
        pa.previousClose = livePrice.previousClose;
        pa.priceChange = livePrice.change;
      }
    }

    // Use real chart data if AI's data is empty or we have better real data
    if (realChartData && realChartData.length > 10 && (!analysis.candlestickData || analysis.candlestickData.length < 10)) {
      (analysis as Record<string, unknown>).candlestickData = realChartData;
    }

    // ═══ CRITICAL: Ensure summary and actionPlan ALWAYS present ═══
    // If AI missed them, generate deterministic ones
    if (!analysis.summary || analysis.summary.length < 50) {
      const p = analysis.priceAnalysis?.currentPrice || realPriceNum || 0;
      const signal = (analysis.overallSignal || 'NEUTRAL').toUpperCase();
      const signalSq = analysis.overallSignal || 'NEUTRAL';
      const rsiV = analysis.indicators?.rsi?.value || 50;
      const macdV = analysis.indicators?.macd?.value || 0;

      if (signal === 'BULLISH') {
        analysis.summary = `Analiza teknike tregon tendencë ngjitëse. Çmimi aktual $${p} me RSI(14) në ${rsiV} dhe MACD ${macdV > 0 ? 'pozitiv' : 'afër zeros'}. Besueshmëria e sinjalit: ${analysis.confidence || 60}%. Indikatorët teknike mbështesin vazhdim ngjitës. Monitoroni suportin kryesor dhe vëllimin për konfirmim.`;
      } else if (signal === 'BEARISH') {
        analysis.summary = `Analiza teknike tregon tendencë ulëse. Çmimi aktual $${p} me RSI(14) në ${rsiV} dhe MACD ${macdV < 0 ? 'negativ' : 'afër zeros'}. Besueshmëria e sinjalit: ${analysis.confidence || 55}%. Indikatorët tregojnë presion shitës. Prisni sinjal kthimi përpara se të veproni.`;
      } else {
        analysis.summary = `Analiza teknike tregon paqëndrueshmëri. Çmimi aktual $${p} me RSI(14) në ${rsiV}. Nuk ka sinjal të qartë nga indikatorët kryesorë. Prisni thyerje të qartë me vëllim përpara se të merrni vendim.`;
      }
    }

    if (!analysis.actionPlan || analysis.actionPlan.length < 30) {
      const p = analysis.priceAnalysis?.currentPrice || realPriceNum || 0;
      const signal = (analysis.overallSignal || 'NEUTRAL').toUpperCase();
      const stopLoss = +(p * 0.96).toFixed(2);
      const target = +(p * 1.04).toFixed(2);

      if (signal === 'BULLISH') {
        analysis.actionPlan = `HYRJE: Bli pranë $${p} | STOP LOSS: $${stopLoss} (-4%) | TARGET: $${target} (+4%) | Gjeni suportin kryesor nga indikatorët më sipër. Përfitoni 50% në target dhe lëreni pjesën e mbetur me trailing stop.`;
      } else if (signal === 'BEARISH') {
        analysis.actionPlan = `KUJDES: Tendencë ulëse aktive. ASNJË HYRJE BLERËSE tani. Nëse jeni në pozicion, vendosni STOP në $${stopLoss}. Prisni RSI < 30 ose divergjencë bullish. Nëse dëshironi SHORT: hyrje $${p} | stop $${+(p * 1.03).toFixed(2)} | target $${target}`;
      } else {
        analysis.actionPlan = `PRISNI: Asnjë veprim tani. Monitoroni nivelet e suportit dhe rezistencës nga analiza më sipër. Një thyerje me vëllim do të japë sinjalin e radhës.`;
      }
    }

    // Ensure these fields are never null
    analysis.summary = analysis.summary || 'Analizë teknike e plotë e disponueshme në indikatorët më sipër.';
    analysis.actionPlan = analysis.actionPlan || 'Monitoroni indikatorët dhe prisni sinjal të qartë përpara se të veproni.';

    // Mark if real chart data was used
    if (realChartData && realChartData.length >= 10 && analysis.candlestickData?.length >= 15) {
      (analysis as Record<string, unknown>).isRealChart = true;
    }

    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Technical AI error:', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Technical analysis error:', message);

    // ═══ ULTIMATE FALLBACK: Always return analysis even on error ═══
    try {
      const demo = generateDemoTechnicalAnalysis(tickerUpper);
      return NextResponse.json({ analysis: demo, demo: true, fallbackError: true });
    } catch {
      return NextResponse.json({ error: 'Analiza teknike dështoi. Provo përsëri.' }, { status: 500 });
    }
  }
}
