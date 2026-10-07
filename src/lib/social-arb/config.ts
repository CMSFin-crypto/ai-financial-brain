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
    /** Artikuj GDELT në 24h që e shpallin trendin «mainstream» (rregulli i dilutimit të Camillo). */
    mainstreamArticles: 200,
    /** Ditë pa matje të reja para ftohjes (REMOVED me arsye). */
    staleDays: 10,
    /** Maks. kandidatë me pyetje GDELT për skanim (2 thirrje × 6s secila). */
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
    /** Gate 1 — BURIME TË PAVARURA: së paku 2 burime kërkese jo-lajme në rritje.
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

    /** Gate 3 — NUK ËSHTË ÇMUAR: kthimi i aksionit minus SPY që nga fillimi
     *  i trendit (deri në 20 ditë tregtimi). Filtër negativ — jo provë. */
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

  // ── Score-i (i vjetër, v4) — vetëm për RENDITJE, jo më gate ──
  // Komponentët ekzistues mbeten deri në P2 (score-i i ri me acceleration/
  // catalyst/gap). S'pengon më ngritjen në RESEARCH.
  score: {
    /** Pragu i vjetër — tani vetëm referencë historike. */
    researchScore: 60,
    /** Dritarja e hapur e çmimit për panel (≤ +3% vs SPY). */
    priceWindowOpen: 0.03,
    /** Dritarja e mbyllur për panel (> +10% vs SPY). */
    priceWindowClosed: 0.10,
  },
} as const;

export type SocialArbConfig = typeof SOCIAL_ARB_CONFIG;
