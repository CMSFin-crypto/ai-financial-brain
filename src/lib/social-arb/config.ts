// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — konfigurimi i vetëm (pragjet + peshat)
//
// ⚠️ VLERAT FILLESTARE, JO TË PROVUARA: të zgjedhura me gjykim sipas
// metodës së Camillo-s, PA backtest. Do të rregullohen nga P3
// (backtest point-in-time, me grup kontrolli). Mos i trajto si të
// provuara dhe mos tregto mbi to pa i verifikuar vetë.
//
// Çdo prag i motorit dhe i gate-ve vjen NGA KËTU — asnjë numër i
// fshehur në logjikë.
// ═══════════════════════════════════════════════════════════════

export const SOCIAL_ARB_CONFIG = {
  // ── Makina e statusit (kufijtë e skanimit) ──
  scan: {
    /** Artikuj GDELT në 24h që e shpallin trendin «mainstream» (rregulli i dilutimit të Camillo).
     *  DUHET të jetë < maxRecords (250) i gdeltArticleList — nëse kërkojmë më pak artikuj
     *  se pragu, numërimi s'arrin kurrë pragun dhe rregulli s'aktivizohet kurrë. */
    mainstreamArticles: 200,
    /** Ditë pa matje të reja para ftohjes (REMOVED me arsye).
     *  DUHET ≥ dritarja e qëndrueshmërisë + 7 ditë (3 javë × 7 + 7 = 28): një trend
     *  i ngadaltë Camillo-style kërkon ≥3 javë vetëm për gate-in e qëndrueshmërisë —
     *  ftohja para 28 ditësh e heq para se ta matë. (Vlera e vjetër: 10 — gabim.) */
    staleDays: 28,
    /** Maks. kandidatë me pyetje GDELT/wiki për skanim (2 thirrje GDELT × 6s secila).
     *  Radha rrotullohet me skanime sipas lastMeasuredAt — shih orderCandidatesForMeasurement. */
    maxGdeltCandidates: 10,
    /** Maks. gjurmime rezultatesh 5/20-ditore për skanim. */
    maxOutcomeTracked: 12,
    /** Kufizi i store-it në memorie (arkivi CSV mbetet i plotë). */
    measurementsCap: 6000,
    /** Drita kalendarike e reagimit të çmimit (vetëm për panelin informativ). */
    priceWindowDays: 7,
  },

  // ── GATE-T PËR NGRITJE NË RESEARCH (të gjitha duhet të kalojnë) ──
  gates: {
    /** Gate 1 — BURIME TË PAVARURA: së paku 2 burime kërkese jo-lajne në rritje.
     *  Google Trends = 1; Wikipedia pageviews = 1. GDELT = media_confirmation
     *  (konfirmim i vonë), NUK numërohet si burim kërkese. */
    sources: {
      minCount: 2,
      /** Rritja minimale e Wikipedia-s: mediana 7-ditore / mediana e ditëve 8-35. */
      wikiGrowthMin: 0.25,
      /** Gjatësia e serisë Wikipedia (ditë kalendarike). */
      wikiSeriesDays: 90,
    },

    /** Gate 2 — MATERIALITETI: pesha e markës në biznesin e kompanisë
     *  (exposure) e kufizuar nga kova e kapitalizimit. */
    materiality: {
      /** Materialiteti efektiv minimal (0-1). */
      minEffective: 0.15,
    },

    /** Gate 3 — NUK ËSHTË ÇMUAR: kthimi i aksionit minus SPY që nga FILLIMI I
     *  TRENDIT (trendStartAt nga seria Wikipedia; fallback firstSeenAt), deri
     *  20 ditë tregtimi. Filtër negativ — jo provë. */
    notPriced: {
      /** Pragu i «tashmë i çmuar» — mbi këtë: WATCH + flamuri already_moved. */
      maxReturnVsIndex: 0.08,
      /** Dritarja e matjes (ditë tregtimi që nga fillimi i trendit). */
      windowTradingDays: 20,
    },

    /** Gate 4 — LIKUIDITETI: vëllami mesatar në dollarë mbi pragun minimal. */
    liquidity: {
      /** Vëllami minimal mesatar ditor në $ (close × volume, ditët e fundit tregtimi). */
      minAvgDollarVolume: 2_000_000,
      /** Dritarja (ditë tregtimi). */
      days: 20,
    },

    /** Gate 5 — JO MODË E SHKURTËR: qëndrueshmëri 3+ javë rritje dhe pa model
     *  pik-pastaj-rënie (raporti maksimum/mesatare e 4 javëve të fundit). */
    persistence: {
      /** Javë të njëpasnjëshme rritje (java më e re > e mëparshmja). */
      minRisingWeeks: 3,
      /** Raporti maksimal pik/mesatare mbi 4 javë — mbi këtë = model spike-i. */
      maxPeakToAvgRatio: 4.0,
    },
  },

  // ── Fillimi i trendit (ankora e gate-it not_priced) ──
  trendStart: {
    /** Mediana 7-ditore tejkalon bazën e matur me ≥15% (0.15). */
    minLift: 0.15,
    /** Baza = mediana e dritares 28-ditore, e matur 14 ditë më parë (kundrejt ditës së vlerësimit). */
    baselineLagDays: 14,
    baselineWindowDays: 28,
    /** Dritarja e dukshme e ditës (ditë kalendarike). */
    currentWindowDays: 7,
  },

  // ── Zbulimi proaktiv nga Wikipedia (skanimi i fjalorit, jo vetëm «Trending now») ──
  discovery: {
    /** Rritja minimale e Wikipedia-s për të krijuar kandidat DISCOVERED (0.5 = +50%). */
    wikiGrowth: 0.5,
    /** Javët minimale të njëpasnjëshme rritje për kandidat të ri. */
    minRisingWeeks: 2,
    /** Sa artikuj të fjalorit skanohen për skanim (rrotullim me kursorin store.meta.wikiScanCursor). */
    batchSize: 12,
    /** Kërkesa njëkohëse ndaj API-së së Wikipedia-s (i përhapur, brenda udhëzimeve të Wikimedia-s). */
    concurrency: 5,
  },

  // ── Katalizatori i fitimeve (opsional — vetëm shfaqje/renditje, JO gate) ──
  catalyst: {
    /** Sa ditë përpara shikohen fitimet e ardhshme (kërkesa Finnhub /calendar/earnings). */
    lookaheadDays: 90,
  },

  // ── Score-i (renditje; komponentët pa data s'numërohen) ──
  // demand = 25 × clamp01(wiki.growth) — Wikipedia është prova e kërkesës;
  // GDELT vetëm te komponenti i konfirmimit mediatik. Në feed-i s'jep më pikë falas.
  score: {
    /** Dritarja e hapur e çmimit për panel (≤ +3% vs SPY). */
    priceWindowOpen: 0.03,
    /** Dritarja e mbyllur për panel (> +10% vs SPY). */
    priceWindowClosed: 0.10,
  },
} as const;

export type SocialArbConfig = typeof SOCIAL_ARB_CONFIG;
