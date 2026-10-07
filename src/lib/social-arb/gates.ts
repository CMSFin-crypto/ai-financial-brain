// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — 5 gate-t për ngritjen në RESEARCH (P1)
//
// Të gjitha funksionet janë TË PASTËR (pa rrjet) — testueshme njësi.
// Çdo gate kthen { passed, detail } ku passed:
//   true  = kaloi
//   false = dështoi (me arsye konkrete)
//   null  = s'u mat dot — bllokon ngritjen (fail-closed), por s'fshin asgjë
//
// ⚠️ Pragjet vijnë nga config.ts — vlera fillestare me gjykim, JO të
// provuara; do të korrigjohen nga backtest-i (P3).
// ═══════════════════════════════════════════════════════════════

import { SOCIAL_ARB_CONFIG as CFG } from './config';
import type { WikiPoint, PricePoint } from './sources';

const dayMs = (s: string) => Date.parse(`${s}T00:00:00Z`);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2 : 0;
}

const pct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

export interface GateOutcome {
  passed: boolean | null;
  detail: string;
}

// ── Wikipedia: rritja + qëndrueshmëria + modeli i spike-it ─────

export interface WikiStats {
  growth: number | null;          // mediana 7d / mediana e ditëve 8-35 − 1
  pageviews7dMedian: number | null;
  baselineMedian: number | null;
  risingWeeks: number | null;     // javë të njëpasnjëshme rritje (max 4)
  peakToAvg: number | null;       // maks / mesatare e 4 javëve të fundit
}

/** Statistikat e serisë Wikipedia — normalizimi ndaj historisë së vet. */
export function wikiStats(series: WikiPoint[], today: string): WikiStats {
  const asOf = dayMs(today);
  const pts = series.filter(p => dayMs(p.date) <= asOf);
  if (pts.length < 35) {
    return { growth: null, pageviews7dMedian: null, baselineMedian: null, risingWeeks: null, peakToAvg: null };
  }
  const views = pts.map(p => p.views);
  const recent7 = pts.filter(p => asOf - dayMs(p.date) < 7 * 86400000).map(p => p.views);
  const baseline = pts.filter(p => asOf - dayMs(p.date) >= 7 * 86400000 && asOf - dayMs(p.date) < 35 * 86400000).map(p => p.views);
  const med7 = recent7.length >= 5 ? median(recent7) : null;
  const medBase = baseline.length >= 10 ? median(baseline) : null;
  const growth = med7 !== null && medBase !== null && medBase > 0 ? med7 / medBase - 1 : null;

  // javët e njëpasnjëshme në rritje: java më e re > e mëparshmja — numërohen
  // NIVEL-ET në zinxhirin ngjitës (3 javë rritje = 3 nivele, 2 krahasime)
  const weekMedian = (weeksAgo: number): number | null => {
    const w = pts
      .filter(p => asOf - dayMs(p.date) >= weeksAgo * 7 * 86400000 && asOf - dayMs(p.date) < (weeksAgo + 1) * 7 * 86400000)
      .map(p => p.views);
    return w.length >= 4 ? median(w) : null;
  };
  let comparisons = 0;
  for (let i = 0; i < 4; i++) {
    const cur = weekMedian(i);
    const prev = weekMedian(i + 1);
    if (cur !== null && prev !== null && cur > prev) comparisons++;
    else break;
  }
  const risingWeeks = comparisons > 0 ? comparisons + 1 : 0;

  // modeli i spike-it: maksimumi i 4 javëve të fundit kundrejt mesatares
  const last28 = pts.filter(p => asOf - dayMs(p.date) < 28 * 86400000).map(p => p.views);
  const peak = last28.length ? Math.max(...last28) : null;
  const avg28 = last28.length ? last28.reduce((a, b) => a + b, 0) / last28.length : null;
  const peakToAvg = peak !== null && avg28 !== null && avg28 > 0 ? peak / avg28 : null;

  return { growth, pageviews7dMedian: med7, baselineMedian: medBase, risingWeeks, peakToAvg };
}

// ── Gate 1: BURIME TË PAVARURA ─────────────────────────────────

/**
 * Së paku 2 burime kërkese jo-lajme në rritje. Google Trends = 1
 * (qenia në feed-in «Trending now»), Wikipedia = 1 (rritja e
 * pageviews ndaj historisë së vet). GDELT NUK numërohet — është
 * media_confirmation (konfirmim i vonë), shënohet veç.
 */
export function gateSources(input: {
  googleInFeed: boolean;
  googleTrafficNote?: string;
  wiki: WikiStats | null;
  wikiError?: string | null;
}): GateOutcome {
  const rising: string[] = [];
  if (input.googleInFeed) rising.push('Google Trends (në «Trending now»)');
  const g = input.wiki?.growth ?? null;
  if (g !== null && g >= CFG.gates.sources.wikiGrowthMin) {
    rising.push(`Wikipedia (+${(g * 100).toFixed(0)}% 7d vs baza 28d)`);
  }
  const count = rising.length;
  if (count >= CFG.gates.sources.minCount) {
    return { passed: true, detail: `${count} burime kërkese në rritje: ${rising.join(' · ')}. GDELT mbahet veç si konfirmim mediatik (i vonë) — s'numërohet.` };
  }
  if (input.wiki === null || (g === null && input.wikiError)) {
    return {
      passed: null,
      detail: `Wikipedia s'u mat dot${input.wikiError ? ` (${input.wikiError})` : ''} — s'u mund të verifikohet numri i burimeve (fail-closed). ${rising.length ? `Burim i vetëm: ${rising[0]}.` : 'Asnjë burim në rritje ende.'}`,
    };
  }
  return {
    passed: false,
    detail: `Vetëm ${count} burim${count === 1 ? '' : ''} kërkese në rritje (duhen ${CFG.gates.sources.minCount}): ${rising.length ? rising.join(' · ') : 'asnjë'}.${g !== null ? ` Wikipedia nën pragun (+${(CFG.gates.sources.wikiGrowthMin * 100).toFixed(0)}%): ${pct(g)}.` : ' Wikipedia pa rritje të matshme.'}`,
  };
}

// ── Gate 2: MATERIALITETI ──────────────────────────────────────

/**
 * Pesha e markës në biznesin e kompanisë (exposure), e kufizuar nga
 * kova e kapitalizimit. Pa materialitet të njohur → WATCH.
 */
export function gateMateriality(input: {
  effective: number | null;   // min(materiality, CAP_CEILING[cap])
  exposurePct: number | null; // pjesa e të ardhurave (pa tavanin)
  capBucket: string;
  linkType: string;
  reason: string;
}): GateOutcome {
  if (input.effective === null || !Number.isFinite(input.effective)) {
    return { passed: null, detail: `Materialiteti s'njihet — ${input.reason}. Pa materialitet të arsyetuar, kandidati mbetet në WATCH.` };
  }
  if (input.effective >= CFG.gates.materiality.minEffective) {
    return {
      passed: true,
      detail: `Materialiteti efektiv ${(input.effective * 100).toFixed(0)}% ≥ pragu ${(CFG.gates.materiality.minEffective * 100).toFixed(0)}% — lidhja «${input.linkType}», kova «${input.capBucket}» (tavani i kap-it aplikuar).`,
    };
  }
  return {
    passed: false,
    detail: `Materialiteti efektiv ${(input.effective * 100).toFixed(0)}% < pragu ${(CFG.gates.materiality.minEffective * 100).toFixed(0)}% — trendi s'peshon mjaftueshëm në të ardhurat e ${input.capBucket}-cap-it. ${input.reason}`,
  };
}

// ── Gate 3: NUK ËSHTË ÇMUAR (filtër negativ) ───────────────────

/** Kthimi i aksionit minus SPY që nga fillimi i trendit (deri në 20 ditë tregtimi). */
export function computeReturnSinceStart(
  stock: PricePoint[],
  spy: PricePoint[],
  firstSeenDate: string,
): { stockRet: number; indexRet: number; relative: number; fromDate: string; asOf: string; tradingDays: number } | null {
  const spyMap = new Map(spy.map(p => [p.date, p.close]));
  const common = stock.filter(p => spyMap.has(p.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (common.length < 2) return null;
  // baza: close-i i përbashkët më i afërt me zbulimin (preferon të njëjtën ditë/pas)
  const seen = firstSeenDate.slice(0, 10);
  let baseIdx = common.findIndex(p => p.date >= seen);
  if (baseIdx === -1) baseIdx = 0;
  if (baseIdx > 0 && dayMs(common[baseIdx].date) - dayMs(seen) > 3 * 86400000) baseIdx -= 1;
  if (baseIdx < 0) return null;
  // fundi: brenda dritares së 20 ditëve tregtimi pas bazës
  const maxIdx = Math.min(common.length - 1, baseIdx + CFG.gates.notPriced.windowTradingDays);
  if (maxIdx <= baseIdx) return null;
  const from = common[baseIdx];
  const to = common[maxIdx];
  if (from.date >= to.date) return null;
  const stockRet = to.close / from.close - 1;
  const indexRet = (spyMap.get(to.date) as number) / (spyMap.get(from.date) as number) - 1;
  return {
    stockRet, indexRet, relative: stockRet - indexRet,
    fromDate: from.date, asOf: to.date, tradingDays: maxIdx - baseIdx,
  };
}

/**
 * Çmimi si FILTËR negativ, jo si provë: nëse aksioni ka tejkaluar
 * SPY-në me > +8% që nga fillimi i trendit, lëvizja ka zënë vend —
 * kandidati mbetet në WATCH me flamurin already_moved.
 */
export function gateNotPriced(
  ret: { stockRet: number; indexRet: number; relative: number; fromDate: string; asOf: string; tradingDays: number } | null,
  error?: string | null,
): GateOutcome {
  if (!ret) {
    return { passed: null, detail: `Kthimi që nga fillimi i trendit s'u mat${error ? ` (${error})` : ''} — s'u mund të verifikohet nëse është çmuar (fail-closed).` };
  }
  if (ret.relative <= CFG.gates.notPriced.maxReturnVsIndex) {
    return {
      passed: true,
      detail: `Që nga fillimi i trendit (${ret.fromDate} → ${ret.asOf}, ${ret.tradingDays} ditë tregtimi): ${pct(ret.stockRet)} kundrejt SPY ${pct(ret.indexRet)} → diferencë ${pct(ret.relative)} ≤ pragun +${(CFG.gates.notPriced.maxReturnVsIndex * 100).toFixed(0)}% — pritja NUK është reflektuar në çmim.`,
    };
  }
  return {
    passed: false,
    detail: `Që nga fillimi i trendit (${ret.fromDate} → ${ret.asOf}, ${ret.tradingDays} ditë tregtimi): ${pct(ret.stockRet)} kundrejt SPY ${pct(ret.indexRet)} → diferencë ${pct(ret.relative)} > +${(CFG.gates.notPriced.maxReturnVsIndex * 100).toFixed(0)}% — tashmë i çmuar (already_moved). Çmimi është filtër, jo provë.`,
  };
}

// ── Gate 4: LIKUIDITETI ───────────────────────────────────────

/** Vëllami mesatar ditor në $ (mediana e close×volume të ditëve të fundit tregtimi). */
export function computeAvgDollarVolume(series: PricePoint[]): number | null {
  const withVol = series.filter(p => typeof p.volume === 'number' && p.volume > 0 && p.close > 0);
  const last = withVol.slice(-CFG.gates.liquidity.days);
  if (last.length < Math.min(10, CFG.gates.liquidity.days)) return null; // s'ka volum të mjaftueshëm nga burimi
  return median(last.map(p => p.close * (p.volume as number)));
}

/** Vëllami në dollarë mbi pragun minimal — hyni/dilni pa zhvendosur çmimin. */
export function gateLiquidity(avgDollarVolume: number | null, error?: string | null): GateOutcome {
  if (avgDollarVolume === null) {
    return { passed: null, detail: `Vëllami s'u mat${error ? ` (${error})` : " — burimi i çmimeve s'jon volumet"} — likuiditeti i paverifikueshëm (fail-closed).` };
  }
  if (avgDollarVolume >= CFG.gates.liquidity.minAvgDollarVolume) {
    return { passed: true, detail: `Vëllami mesatar ditor ${fmtM(avgDollarVolume)} ≥ pragu ${fmtM(CFG.gates.liquidity.minAvgDollarVolume)} (${CFG.gates.liquidity.days} ditët e fundit).` };
  }
  return { passed: false, detail: `Vëllami mesatar ditor ${fmtM(avgDollarVolume)} < pragu ${fmtM(CFG.gates.liquidity.minAvgDollarVolume)} — hyni real do ta zhvendoste çmimin kundër teje.` };
}

// ── Gate 5: JO MODË E SHKURTËR ─────────────────────────────────

/**
 * Qëndrueshmëria e kërkesës: 3+ javë rritje dhe pa modelin
 * pik-pastaj-rënie (raporti maks/mesatare e 4 javëve të fundit).
 */
export function gatePersistence(wiki: WikiStats | null, wikiError?: string | null): GateOutcome {
  if (!wiki || wiki.risingWeeks === null || wiki.peakToAvg === null) {
    return {
      passed: null,
      detail: `Qëndrueshmëria s'u mat${wikiError ? ` (${wikiError})` : ' — seria Wikipedia e pamjaftueshme'} — moda e shkurtër s'mund të përjashtohet (fail-closed).`,
    };
  }
  const weeksOk = wiki.risingWeeks >= CFG.gates.persistence.minRisingWeeks;
  const spike = wiki.peakToAvg > CFG.gates.persistence.maxPeakToAvgRatio;
  if (weeksOk && !spike) {
    return {
      passed: true,
      detail: `${wiki.risingWeeks} javë të njëpasnjëshme rritje (≥ ${CFG.gates.persistence.minRisingWeeks}) dhe raporti pik/mesatare ${wiki.peakToAvg.toFixed(1)}× ≤ ${CFG.gates.persistence.maxPeakToAvgRatio}× — nuk është modë e shkurtër.`,
    };
  }
  const why: string[] = [];
  if (!weeksOk) why.push(`vetëm ${wiki.risingWeeks} javë rritje e njëpasnjëshme (duhen ${CFG.gates.persistence.minRisingWeeks})`);
  if (spike) why.push(`model spike-i: maksimumi ${wiki.peakToAvg.toFixed(1)}× mbi mesataren e 4 javëve (> ${CFG.gates.persistence.maxPeakToAvgRatio}×)`);
  return { passed: false, detail: `Modë e mundshme e shkurtër — ${why.join(' dhe ')}.` };
}

// ── Vlerësimi i plotë ──────────────────────────────────────────

export interface GateInputs {
  googleInFeed: boolean;
  wiki: WikiStats | null;
  wikiError?: string | null;
  effectiveMateriality: number | null;
  exposurePct: number | null;
  capBucket: string;
  linkType: string;
  materialityReason: string;
  returnSinceStart: { stockRet: number; indexRet: number; relative: number; fromDate: string; asOf: string; tradingDays: number } | null;
  returnError?: string | null;
  avgDollarVolume: number | null;
  volumeError?: string | null;
}

/** Vlerëson të 5 gate-t — thirret nga motori në çdo skanim për çdo kandidat. */
export function evaluateGates(input: GateInputs): {
  sources: GateOutcome;
  materiality: GateOutcome;
  not_priced: GateOutcome;
  liquidity: GateOutcome;
  persistence: GateOutcome;
} {
  return {
    sources: gateSources({ googleInFeed: input.googleInFeed, wiki: input.wiki, wikiError: input.wikiError }),
    materiality: gateMateriality({
      effective: input.effectiveMateriality,
      exposurePct: input.exposurePct,
      capBucket: input.capBucket,
      linkType: input.linkType,
      reason: input.materialityReason,
    }),
    not_priced: gateNotPriced(input.returnSinceStart, input.returnError),
    liquidity: gateLiquidity(input.avgDollarVolume, input.volumeError),
    persistence: gatePersistence(input.wiki, input.wikiError),
  };
}

/** true vetëm kur të GJITHA gate-t kalojnë (null bllokon — fail-closed). */
export function allGatesPassed(g: Record<string, GateOutcome>): boolean {
  return Object.values(g).every(x => x.passed === true);
}

/** Flamuri already_moved — kthimi që nga fillimi > pragu (vetëm për UI/arsye). */
export function isAlreadyMoved(
  ret: { relative: number } | null,
): boolean {
  return ret !== null && ret.relative > CFG.gates.notPriced.maxReturnVsIndex;
}
