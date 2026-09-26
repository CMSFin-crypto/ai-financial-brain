// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — motori i zbulimit automatik
//
// 1. Merr termat në rritje nga Google Trends "Trending now" (US/GB/CA/AU)
// 2. Klasifikon: a është termi produkt/markë? → e lidh me kompaninë/ticker-in
//    dhe ruan burimin, datën dhe arsyen.
// 3. E vendos në WATCH. E ngre në RESEARCH VETËM pasi:
//    (a) konfirmohet nga një burim tjetër (GDELT, rritje ≥25% e seria 30-ditore
//        kundrejt bazës) DHE (b) kontrollohet reagimi i çmimit (≤+3% vs SPY —
//        dritarja e hyrjes ende e hapur).
// 4. E heq (REMOVED) kur: trendi bëhet mainstream (≥200 artikuj GDELT/24h —
//    rregulli i daljes së Camillo), çmimi ka reaguar >10% ndaj indeksit,
//    rreziku i promocionit/eventit është vrastar, ose interesi ftohet.
// 5. Çdo matje arkivohet në CSV (prapavijë) për backtest.
// ═══════════════════════════════════════════════════════════════

import { classifyTerm, effectiveMateriality, type BrandEntry } from './brands';
import {
  fetchTrendingNow, gdeltDailySeries, gdeltArticleCount, fetchDailyCloses, fetchIndexCloses,
  type GdeltDailyPoint, type PricePoint, type TrendingTerm,
} from './sources';
import { readStore, writeStore, mergeMeasurements, archiveToCsv } from './store';
import type {
  Candidate, CandidateStatus, Measurement, Region, ScanRecord, ScanResultSummary, ScoreBreakdown, SocialArbStore,
} from './types';

const REGIONS: Region[] = ['US', 'GB', 'CA', 'AU'];
const MAINSTREAM_ARTICLES = 200;   // Camillo: dil kur bëhet mainstream
const CONFIRM_GROWTH = 0.25;       // konfirmimi: +25% 7d kundrejt bazës 28d
const PRICE_WINDOW_OPEN = 0.03;     // ≤ +3% vs SPY — dritarja e hyrjes e hapur
const PRICE_WINDOW_CLOSED = 0.10;   // > +10% vs SPY — e mbyllur
const STALE_DAYS = 10;             // pa matje të reja → ftohje
const RESEARCH_SCORE = 60;
const MAX_GDELT_CANDIDATES = 10;   // kufi kohor: 2 thirrje GDELT × 6s secila
const MEASUREMENTS_CAP = 6000;     // kufizi i store-it (arkivi CSV mbetet i plotë)

// ── ndihmës ──────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().slice(0, 10);
const dayMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2 : 0;
};
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number | null) => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`);

// ── mutex — një skanim në akt ────────────────────────────────────

let scanning: Promise<ScanResultSummary> | null = null;
export function scanInProgress(): boolean {
  return scanning !== null;
}
export function runScan(): Promise<ScanResultSummary> {
  if (scanning) return scanning;
  scanning = doScan().finally(() => { scanning = null; });
  return scanning;
}

// ── struktura pune e skanimit ────────────────────────────────────

interface WorkCandidate {
  key: string;
  entry: BrandEntry;
  term: string;
  region: string;
  isNew: boolean;
  google: { inFeed: boolean; approxTraffic: string | null; traffic: number | null };
  gdeltQuery: string;
}

function candidateKey(term: string, ticker: string, region: string): string {
  return `${term.toLowerCase()}|${ticker}|${region}`;
}

// ── skanimi kryesor ──────────────────────────────────────────────

async function doScan(): Promise<ScanResultSummary> {
  const started = Date.now();
  const now = new Date().toISOString();
  const today = todayISO();
  const errors: string[] = [];
  const sources: Record<string, 'ok' | 'error' | 'throttled'> = {};

  const store = await readStore();

  // 1) merr termat trending nga të 4 rajonet
  const allTerms: TrendingTerm[] = [];
  for (const region of REGIONS) {
    try {
      allTerms.push(...(await fetchTrendingNow(region)));
      sources[`google_trends_${region}`] = 'ok';
    } catch (e) {
      sources[`google_trends_${region}`] = 'error';
      errors.push(`Trends ${region}: ${(e as Error).message}`);
    }
  }
  const googleOk = Object.values(sources).some(v => v === 'ok');
  sources.google_trends = googleOk ? 'ok' : 'error';

  // 2) klasifiko termat → markë/produkt
  const matched = new Map<string, WorkCandidate>();
  for (const t of allTerms) {
    const hit = classifyTerm(t.term);
    if (!hit) continue;
    const key = candidateKey(t.term, hit.entry.ticker, t.region);
    const existing = matched.get(key);
    if (existing) {
      // një term i njëjtë mund të mbivendoset — mbaj trafikun më të madh
      if ((t.traffic ?? 0) > (existing.google.traffic ?? 0)) {
        existing.google = { inFeed: true, approxTraffic: t.approxTraffic, traffic: t.traffic };
      }
      continue;
    }
    matched.set(key, {
      key,
      entry: hit.entry,
      term: t.term,
      region: t.region,
      isNew: !store.candidates[key],
      google: { inFeed: true, approxTraffic: t.approxTraffic, traffic: t.traffic },
      gdeltQuery: hit.entry.gdeltQuery ?? hit.entry.aliases[0],
    });
  }

  // 3) përfshi kandidatët aktivë ekzistues (edhe pse s'janë në feed sot)
  for (const [key, c] of Object.entries(store.candidates)) {
    if (c.status === 'REMOVED') continue;
    if (matched.has(key)) continue;
    const entry = entryFor(c);
    if (!entry) continue; // markë e panjohur — mos e keqtrajto
    matched.set(key, {
      key,
      entry,
      term: c.trend,
      region: c.region,
      isNew: false,
      google: { inFeed: false, approxTraffic: null, traffic: null },
      gdeltQuery: entry.gdeltQuery ?? entry.aliases[0],
    });
  }

  // 4) GDELT — konfirmimi (me dedupe sipas pyetjes dhe kufi kandidatësh)
  const activeKeys = [...matched.values()].filter(w => w.isNew || store.candidates[w.key]?.status !== 'REMOVED');
  const gdeltBudget = activeKeys.slice(0, MAX_GDELT_CANDIDATES);
  const seriesCache = new Map<string, GdeltDailyPoint[]>();
  const gdeltErrored = new Set<string>();
  let gdeltThrottled = false;
  for (const w of gdeltBudget) {
    if (seriesCache.has(w.gdeltQuery)) continue;
    try {
      seriesCache.set(w.gdeltQuery, await gdeltDailySeries(w.gdeltQuery));
    } catch (e) {
      const msg = (e as Error).message;
      gdeltErrored.add(w.gdeltQuery);
      if (msg.includes('429')) gdeltThrottled = true;
      errors.push(`GDELT "${w.gdeltQuery}": ${msg}`);
    }
  }

  // artikujt 24h (testi mainstream) — vetëm për kandidatët me seri të mbarë
  const articlesCache = new Map<string, number>();
  for (const w of gdeltBudget) {
    if (!seriesCache.has(w.gdeltQuery)) continue;
    if (articlesCache.has(w.gdeltQuery)) continue;
    try {
      articlesCache.set(w.gdeltQuery, await gdeltArticleCount(w.gdeltQuery));
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('429')) gdeltThrottled = true;
      errors.push(`GDELT artlist "${w.gdeltQuery}": ${msg}`);
    }
  }
  sources.gdelt = gdeltThrottled ? 'throttled' : errors.some(e => e.startsWith('GDELT')) ? 'error' : 'ok';

  // 5) çmimet — SPY një herë, secili ticker një herë
  let spyCloses: PricePoint[] = [];
  try {
    spyCloses = await fetchIndexCloses();
    sources.prices = 'ok';
  } catch (e) {
    sources.prices = 'error';
    errors.push(`SPY: ${(e as Error).message}`);
  }
  const priceCache = new Map<string, PricePoint[]>();
  for (const w of activeKeys) {
    if (priceCache.has(w.entry.ticker)) continue;
    try {
      priceCache.set(w.entry.ticker, await fetchDailyCloses(w.entry.ticker, '1mo'));
    } catch (e) {
      errors.push(`Yahoo ${w.entry.ticker}: ${(e as Error).message}`);
    }
  }

  // 6) ndërto matjet dhe përditëso kandidatët
  const newRows: Measurement[] = [];
  const promoted: string[] = [];
  const removed: string[] = [];
  const newCandidates: string[] = [];

  for (const w of matched.values()) {
    const b = w.entry;
    const mat = effectiveMateriality(b);
    const prev = store.candidates[w.key]; // lëvizur lart: duhet për carry-over kur GDELT gabon
    const series = seriesCache.get(w.gdeltQuery) ?? null;
    const articles1d = articlesCache.get(w.gdeltQuery) ?? null;
    const gdeltError = gdeltErrored.has(w.gdeltQuery);

    // rreshti i Google Trends (sot)
    newRows.push({
      observed_at: today, available_at: today,
      trend: w.term, source: 'google_trends', region: w.region,
      interest: w.google.traffic ?? 50, // fallback kur trafiku mungon
      ticker: b.ticker, product: b.product, company: b.company,
      materiality: mat, promo_risk: b.promoRisk, event_risk: b.eventRisk,
      stock_price: priceFor(priceCache.get(b.ticker), today),
      index_price: priceFor(spyCloses, today),
    });

    // rreshtat e serisë GDELT (30 ditë, histori publike — pa lookahead)
    if (series) {
      for (const p of series) {
        if (dayMs(p.date) > dayMs(today)) continue;
        const recent7 = dayMs(p.date) > dayMs(today) - 7 * 86400000;
        newRows.push({
          observed_at: p.date, available_at: p.date,
          trend: w.term, source: 'gdelt', region: w.region,
          interest: round4(p.value),
          ticker: b.ticker, product: b.product, company: b.company,
          materiality: mat, promo_risk: b.promoRisk, event_risk: b.eventRisk,
          stock_price: recent7 ? priceFor(priceCache.get(b.ticker), p.date) : null,
          index_price: recent7 ? priceFor(spyCloses, p.date) : null,
        });
      }
    }

    // rritja GDELT: 7 ditët e fundit kundrejt 28 ditëve para tyre
    let growth: number | null = null;
    if (series && series.length) {
      const asOf = dayMs(today);
      const recent = series.filter(p => dayMs(p.date) > asOf - 7 * 86400000 && dayMs(p.date) <= asOf).map(p => p.value);
      const baseline = series.filter(p => dayMs(p.date) > asOf - 35 * 86400000 && dayMs(p.date) <= asOf - 7 * 86400000).map(p => p.value);
      if (recent.length >= 2 && baseline.length >= 3 && median(baseline) > 0) {
        growth = median(recent) / median(baseline) - 1;
      }
    }
    // carry-over: kur GDELT gabon (429/rrjet) mbaj matjen e fundit të vlefshme —
    // «e pamatshme» nuk do të thotë «e pakonfirmuar»; democioni për shkak të
    // gabimit infrastrukture do të ishte i pandershëm ndaj të dhënave.
    const carried = gdeltError && prev ? prev.gdelt : null;
    if (growth === null && carried && carried.growth !== null) growth = carried.growth;
    const carriedArticles = articles1d ?? (gdeltError ? carried?.articles1d ?? null : null);
    const confirmed = growth !== null && growth >= CONFIRM_GROWTH;

    // reagimi i çmimit (7 ditët e fundit me close)
    const stockR = returnOver(priceCache.get(b.ticker), 7);
    const indexR = returnOver(spyCloses, 7);
    const priceVsIndex = stockR !== null && indexR !== null ? stockR - indexR : null;

    // score (komponentët e njëjtin me Laboratorin V2)
    const demandStrength = Math.max(growth ?? 0, w.google.inFeed ? 0.5 : 0);
    const breakdown: ScoreBreakdown = {
      demand: 25 * clamp01(demandStrength),
      confirmation: confirmed ? 20 : (growth !== null && growth > 0 ? 8 : 0),
      materiality: 20 * mat,
      price: priceVsIndex === null ? 0 : priceVsIndex <= PRICE_WINDOW_OPEN ? 15 : priceVsIndex <= PRICE_WINDOW_CLOSED ? 8 : 0,
      quality: 10 * (1 - b.promoRisk) * (confirmed ? 1 : 0.5),
      event: 10 * (1 - b.eventRisk),
    };
    const score = Math.round(breakdown.demand + breakdown.confirmation + breakdown.materiality + breakdown.price + breakdown.quality + breakdown.event);

    // ── makina e statusit ──
    let status: CandidateStatus;
    const reasons: string[] = [];
    reasons.push(`Zbuluar në Google Trends ${w.region}: «${w.term}»${w.google.approxTraffic ? ` (trafik ~${w.google.approxTraffic})` : ''} → marka i përket ${b.company} (${b.ticker}).`);
    if (growth !== null) {
      reasons.push(confirmed
        ? `Konfirmuar nga GDELT: +${(growth * 100).toFixed(0)}% 7 ditët e fundit kundrejt bazës 28-ditore (pragu +25%).`
        : `GDELT: ${(growth * 100).toFixed(0)}% 7 ditë kundrejt bazës — nën pragun e konfirmimit (+25%).`);
    } else {
      reasons.push('GDELT: pa histori të mjaftueshme për matjen e rritjes (duhen 2 pika të freskëta + 3 bazë).');
    }
    if (gdeltError && carried) {
      reasons.push('GDELT i padisponueshëm këtë skanim (429/rrjet) — u mbajt matja e fundit e vlefshme; statusi nuk u demotua për shkak të gabimit infrastrukture.');
    }
    if (carriedArticles !== null) reasons.push(`GDELT artikuj 24h: ${carriedArticles}${carriedArticles >= MAINSTREAM_ARTICLES ? ' — trendi është bërë MAINSTREAM (rregulli i daljes së Camillo)' : ''}.`);
    if (priceVsIndex !== null) {
      reasons.push(`Reagimi i çmimit: aksioni ${pct(stockR)} vs SPY ${pct(indexR)} → diferencë ${pct(priceVsIndex)} ndaj indeksit (${priceVsIndex <= PRICE_WINDOW_OPEN ? 'dritarja e hyrjes ende e hapur' : priceVsIndex <= PRICE_WINDOW_CLOSED ? 'reagim i pjesshëm — kujdes' : 'çmimi ka reaguar — dritarja u mbyll'}).`);
    } else {
      reasons.push('Çmimi: pa dy close krahasues — kontrolli i reagimit nuk u krye.');
    }

    if (b.promoRisk >= 0.7 || b.eventRisk >= 0.8) {
      status = 'REMOVED';
      if (b.promoRisk >= 0.7) reasons.push(`Rrezik promovimi artificial i lartë (promo_risk ${b.promoRisk.toFixed(1)} ≥ 0.7) — kandidat i bllokuar.`);
      if (b.eventRisk >= 0.8) reasons.push(`Rrezik eventesh i lartë (event_risk ${b.eventRisk.toFixed(1)} ≥ 0.8) — kandidat i bllokuar.`);
    } else if (carriedArticles !== null && carriedArticles >= MAINSTREAM_ARTICLES) {
      status = 'REMOVED';
      reasons.push(`DALJE: trendi u bë mainstream — ${carriedArticles} artikuj në 24h (pragu ${MAINSTREAM_ARTICLES}); sipas Camillo, lajmi tashmë është i çmimit.`);
    } else if (priceVsIndex !== null && priceVsIndex > PRICE_WINDOW_CLOSED) {
      status = 'REMOVED';
      reasons.push(`DALJE: aksioni ka tejkaluar indeksin me ${pct(priceVsIndex)} (>+10%) — lëvizja e çmimit ka zënë vend, ngecjen e pritjes së reflektuar.`);
    } else if (confirmed && priceVsIndex !== null && priceVsIndex <= PRICE_WINDOW_OPEN && score >= RESEARCH_SCORE) {
      status = 'RESEARCH';
      reasons.push(`NGJITJE në RESEARCH: konfirmim shumë-burim + çmimi pa reagim + score ${score} ≥ ${RESEARCH_SCORE}. Kandidat për hulumtim thelbësor — jo rekomandim tregtimi.`);
    } else {
      status = 'WATCH';
      reasons.push('Në WATCH — pritet konfirmimi i pavarur dhe/ose dritarja e çmimit.');
    }

    // ftohja: kandidat aktiv pa matje të reja
    if (status !== 'REMOVED' && prev && prev.status !== 'REMOVED') {
      const lastSeen = Date.parse(prev.lastSeenAt);
      if (Number.isFinite(lastSeen) && Date.now() - lastSeen > STALE_DAYS * 86400000 && !w.google.inFeed) {
        status = 'REMOVED';
        reasons.push(`DALJE: interesi u ftoh — pa matje të reja për më shumë se ${STALE_DAYS} ditë.`);
      }
    }

    // dosja e kandidatit
    const cand: Candidate = prev ?? {
      key: w.key, trend: w.term, ticker: b.ticker, region: w.region,
      company: b.company, product: b.product,
      status: 'WATCH', firstSeenAt: now, lastSeenAt: now, lastChangedAt: now,
      score: 0, breakdown, reasons: [], history: [],
      google: { inFeedToday: false, approxTraffic: null, traffic: null },
      gdelt: { articles1d: null, growth: null, confirmed: false },
      price: { stockReturn: null, indexReturn: null, priceVsIndex: null, asOf: null },
    };
    if (!prev) newCandidates.push(w.key);

    const prevStatus: CandidateStatus | 'NEW' = prev ? prev.status : 'NEW';
    if (prevStatus === 'NEW') {
      cand.history.push({ at: now, from: 'NEW', to: 'WATCH', reason: `Zbuluar automatikisht në Google Trends ${w.region}: «${w.term}» → ${b.ticker}.` });
    }
    if (prevStatus !== 'NEW' && prevStatus !== status) {
      cand.history.push({ at: now, from: prevStatus, to: status, reason: reasons.find(r => r.startsWith('NGJITJE') || r.startsWith('DALJE')) ?? `Statusi u përditësua në ${status}.` });
      if (status === 'RESEARCH') promoted.push(w.key);
      if (status === 'REMOVED') removed.push(w.key);
      cand.lastChangedAt = now;
    }

    cand.status = status;
    cand.lastSeenAt = w.google.inFeed ? now : (prev?.lastSeenAt ?? now);
    if (w.google.inFeed) cand.lastSeenAt = now;
    cand.score = score;
    cand.breakdown = breakdown;
    cand.reasons = reasons;
    cand.google = { inFeedToday: w.google.inFeed, approxTraffic: w.google.approxTraffic, traffic: w.google.traffic };
    cand.gdelt = { articles1d: carriedArticles, growth, confirmed };
    cand.price = {
      stockReturn: stockR, indexReturn: indexR, priceVsIndex,
      asOf: (priceCache.get(b.ticker) ?? []).at(-1)?.date ?? null,
    };
    store.candidates[w.key] = cand;
  }

  // 6-b) pastrimi: kandidatë aktivë që s'u përfshinë në skanim dhe kanë ftohur
  for (const [key, c] of Object.entries(store.candidates)) {
    if (matched.has(key) || c.status === 'REMOVED') continue;
    const lastSeen = Date.parse(c.lastSeenAt);
    if (Number.isFinite(lastSeen) && Date.now() - lastSeen > STALE_DAYS * 86400000) {
      c.status = 'REMOVED';
      c.lastChangedAt = now;
      c.history.push({ at: now, from: 'WATCH', to: 'REMOVED', reason: `DALJE: interesi u ftoh — pa matje të reja për më shumë se ${STALE_DAYS} ditë.` });
      removed.push(key);
    }
  }

  // 7) ruaj matjet + arkivi CSV
  mergeMeasurements(store, newRows);
  if (store.measurements.length > MEASUREMENTS_CAP) {
    store.measurements.sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    store.measurements = store.measurements.slice(store.measurements.length - MEASUREMENTS_CAP);
  }
  let archived = 0;
  try {
    archived = await archiveToCsv(newRows);
  } catch (e) {
    errors.push(`Arkivi CSV: ${(e as Error).message}`);
  }

  const activeCount = Object.values(store.candidates).filter(c => c.status !== 'REMOVED').length;
  const record: ScanRecord = {
    at: now, durationMs: Date.now() - started, regions: [...REGIONS],
    termsScanned: allTerms.length, termsClassified: [...matched.values()].filter(w => w.google.inFeed).length,
    candidatesActive: activeCount, promoted: promoted.length, removed: removed.length,
    sources, errors,
  };
  store.lastScanAt = now;
  store.scans = [...store.scans, record].slice(-50);
  await writeStore(store);

  return {
    ok: googleOk, at: now, durationMs: record.durationMs, regions: [...REGIONS],
    termsScanned: allTerms.length,
    termsClassified: [...matched.values()].filter(w => w.google.inFeed).length,
    newCandidates, promoted, removed, activeCount, sources, errors, archived,
  };
}

// ── ndihmës të vegjël ────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function priceFor(closes: PricePoint[] | undefined, date: string): number | null {
  if (!closes) return null;
  const hit = closes.find(p => p.date === date);
  return hit ? hit.close : null;
}

/** Kthimi midis close-it të parë dhe të fundit brenda dritares N-ditore. */
function returnOver(closes: PricePoint[] | undefined, days: number): number | null {
  if (!closes || closes.length < 2) return null;
  const cutoff = Date.now() - days * 86400000;
  const window = closes.filter(p => dayMs(p.date) >= cutoff);
  const first = window[0] ?? closes[Math.max(0, closes.length - days)];
  const last = window[window.length - 1];
  if (!first || !last || first.date >= last.date) return null;
  return last.close / first.close - 1;
}

/** Rikthen hyrjen e fjalorit për një kandidat të ruajtur. */
function entryFor(c: Candidate): BrandEntry | null {
  const hit = classifyTerm(c.trend);
  if (hit) return hit.entry;
  return null;
}
