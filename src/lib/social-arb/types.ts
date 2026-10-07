// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — llojet e dhënash (skema v5)
// Rrjedha: Google Trends "Trending now" RSS + skanim proaktiv i fjalorit
// me Wikipedia → klasifikim markë/produkt → DISCOVERED → WATCH (lidhja e
// verifikuar) → RESEARCH (vetëm me 5 gate-t e provave: burime të pavarura,
// materialitet, s'është çmuar, likuiditet, qëndrueshmëri — secili me arsye
// pse kaloi/dështoi).
// GDELT shënohet veç si media_confirmation — s'numërohet si burim kërkese.
// Skema e matjes mbetet identike me CSV-në e backtest-it që arkivohet
// në prapavijë (data/social-arb-backtest/).
// ═══════════════════════════════════════════════════════════════

export type SourceKind = 'google_trends' | 'gdelt' | 'wikipedia';
export type Region = 'US' | 'GB' | 'CA' | 'AU';
export type CandidateStatus = 'DISCOVERED' | 'WATCH' | 'RESEARCH' | 'REMOVED';

/** Lloji i lidhjes markë → kompani e listuar. */
export type LinkType = 'direct' | 'parent' | 'supplier' | 'retailer';

/** Një matje e interesit — rresht i CSV-së së arkivit. */
export interface Measurement {
  observed_at: string;   // YYYY-MM-DD — data e vëzhgimit
  available_at: string; // YYYY-MM-DD — data kur u bë e përdorshëm
  trend: string;        // termi siç duket në feed
  source: SourceKind;
  region: string;       // US | GB | CA | AU
  interest: number;     // shkalla natyrale e burimit (trafik / intensitet)
  ticker: string;
  product: string;
  company: string;
  materiality: number;  // 0–1 — vlerësim manual
  promo_risk: number;   // 0–1 — vlerësim manual
  event_risk: number;   // 0–1 — vlerësim manual
  stock_price: number | null; // close i ditës (opsional)
  index_price: number | null; // close i SPY (opsional)
}

export interface ScoreBreakdown {
  demand: number;        // max 25
  confirmation: number;  // max 20
  materiality: number;   // max 20
  price: number;         // max 15 — 0 kur s'ka të dhëna (e pamatshme ≠ pa reagim)
  quality: number;       // max 10
  event: number;         // max 10
}

export interface StatusEvent {
  at: string;                       // ISO
  from: CandidateStatus | 'NEW';
  to: CandidateStatus;
  reason: string;
}

// ── Verifikimi i shkakut të trendit (P2) ────────────────────────

export type CauseType =
  | 'positive_demand_possible'   // kërkesë pozitive e mundshme
  | 'news_launch_no_proof'       // lajm/lançim pa provë shitjesh
  | 'negative_event'             // ngjarje negative
  | 'unclear';                   // e paqartë

export interface CauseArticle {
  title: string;
  url: string;
  domain: string;
  seenAt: string; // ISO
}

export interface CauseInfo {
  type: CauseType;
  reason: string;            // pse klasifikohet kështu (fjalët kyçe + titujt)
  keywords: string[];         // fjalët kyçe që aktivizuan klasifikimin
  articles: CauseArticle[];   // deri 5 tituj/URL për kontroll manual
  newsTitle: string | null;   // lajmi i bashkangjitur në Google Trends RSS
  newsSource: string | null;
  checkedAt: string;          // ISO — kur u kontrollua
}

// ── Çmimet e detajuara (P1) ─────────────────────────────────────

export interface CandidatePrice {
  stockReturn: number | null;     // kthimi i aksionit në dritaren e balancuar
  indexReturn: number | null;    // kthimi i SPY në të NJËJTAT data
  priceVsIndex: number | null;   // diferencë — reagimi relativ
  asOf: string | null;            // data e fundit e PËRBASHKËT (të dyja anët kanë close)
  fromDate: string | null;        // data e parë e përbashkët e dritares
  stockPrice: number | null;      // close i aksionit në asOf
  indexPrice: number | null;      // close i SPY në asOf
  source: string | null;          // 'stockanalysis' | 'yahoo-q2' | 'yahoo-q1'
  error: string | null;           // gabimi konkret kur feed-i dështoi (të gjitha tentativat)
  checkedAt: string | null;       // ISO — kur u kontrollua së fundmi
}

// ── Rezultatet 5/20 ditë (P4) — për të gjithë, përfshi refuzuarit ──

export interface OutcomePoint {
  date: string;               // data e fundit e përbashkët e përdorur
  stockPrice: number;
  indexPrice: number;
  stockRet: number;           // bazë → kjo datë
  indexRet: number;
  relative: number;           // stockRet − indexRet
}

/** Baza e përbashkët e gjurmimit të rezultatit + pikat d5/d20. */
export interface OutcomeBase {
  baseDate: string | null;    // close-i i ditës së TREGTIMIT PAS ankorës
  baseStock: number | null;
  baseIndex: number | null;
  d5: OutcomePoint | null;    // mbushet kur ka ≥5 ditë tregtimi pas bazës
  d20: OutcomePoint | null;  // mbushet kur ka ≥20 ditë tregtimi pas bazës
  pendingNote: string | null; // p.sh. «prit edhe 3 ditë tregtimi»
  lastCheckedAt: string | null;
}

/** Rezultati nga zbulimi (ankora = firstSeenAt). */
export type CandidateOutcome = OutcomeBase;

/** Rezultati nga NGJITJA NË RESEARCH (ankora = promotedAt) — mas tezën
 *  e «hendekut të paçmuar» edhe kur promovimi vjen ditë pas zbulimit. */
export interface PromotionOutcome extends OutcomeBase {
  promotedAt: string | null;  // ISO — kur u ngjit në RESEARCH (hera e parë)
}

// ── Gate-t për RESEARCH (skema v4) ───────────────────────────

export type GateName = 'sources' | 'materiality' | 'not_priced' | 'liquidity' | 'persistence';

/** Rezultati i një gate-i për një kandidat — pse kaloi ose dështoi. */
export interface GateEval {
  gate: GateName;
  /** true = kaloi · false = dështoi · null = s'u mat dot (mungon data — bllokon ngritjen, fail-closed) */
  passed: boolean | null;
  /** Arsyja njerëzore — shfaqet në UI. */
  detail: string;
  checkedAt: string; // ISO
}

/** Materialiteti i detajuar i kandidatit (gate 2). */
export interface MaterialityInfo {
  /** Pjesa e të ardhurave të lidhura me markën/produktin (0-1) — null kur s'njihet. */
  exposurePct: number | null;
  /** Pse kjo vlerë (vlerësim manual i fjalorit / arsyeja e mungesës). */
  reason: string;
  /** Kova e kapitalizimit të kompanisë. */
  capBucket: 'mega' | 'large' | 'mid' | 'small';
  /** Lloji i lidhjes markë → kompani. */
  linkType: LinkType;
}

/** Wikipedia pageviews — burimi i 2-të i kërkesë (jo-lajme). */
export interface CandidateWiki {
  article: string | null;        // artikulli i përdorur
  growth: number | null;         // mediana 7d / mediana 8-35 − 1
  pageviews7dMedian: number | null;
  baselineMedian: number | null;
  /** Javët e njëpasnjëshme në rritje (persistence). */
  risingWeeks: number | null;
  /** Raporti pik/mesatare 4-javor — modeli i spike-it. */
  peakToAvg: number | null;
  error: string | null;          // gabimi konkret kur API dështoi
  checkedAt: string | null;       // ISO
}

/** Likuiditeti (gate 4) — vëllami mesatar në $. */
export interface CandidateLiquidity {
  avgDollarVolume: number | null;
  error: string | null;          // p.sh. «burimi i çmimeve s'jon volumet»
  checkedAt: string | null;
}

/** Kthimi që nga fillimi i trendit (gate 3). */
export interface ReturnSinceStart {
  fromDate: string | null;       // close-i bazë i përbashkët
  asOf: string | null;
  tradingDays: number | null;
  stockRet: number | null;
  indexRet: number | null;
  relative: number | null;      // stockRet − indexRet
  checkedAt: string | null;
}

/** Fillimi i trendit — ankora e gate-it not_priced. */
export interface TrendStart {
  at: string;                   // YYYY-MM-DD
  /** wiki = dita e parë e rritjes së vazhdueshme në serinë Wikipedia;
   *  firstSeen = fallback (kur seria s'mjafton) — i mangët, i shënuar si i tillë. */
  source: 'wiki' | 'firstSeen';
}

/** Katalizatori i ardhshëm i fitimeve — VETËM shfaqje/renditje, JO gate.
 *  Null kur s'ka FINNHUB_API_KEY ose kur fetch-i dështoi (shiko error). */
export interface CandidateCatalyst {
  nextEarningsDate: string | null;  // YYYY-MM-DD
  daysToEarnings: number | null;   // ditë kalendarike nga sot
  error: string | null;
  checkedAt: string | null;
}

export interface Candidate {
  key: string;            // trend|ticker|region (regioni i vëzhgimit — US/GB/CA/AU/WW)
  /** term|ticker i normalizuar (pa rajon) — njësia statistikore e pavarur:
   *  e njëjta tezë në US, GB, CA, AU është NJË rast, jo katër. */
  groupKey: string;
  trend: string;
  ticker: string;
  region: string;
  company: string;
  product: string;
  status: CandidateStatus;
  /** Si u zbulua: nga feed-i «Trending now» ose proaktivisht nga Wikipedia. */
  discoveredVia: 'google_trends' | 'wikipedia';
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  /** Skanimi i fundit ku kandidati mori radhën e matjes (wiki/GDELT) —
   *  motori i rotacionit rendit sipas kësaj (më e vjetra → e para). */
  lastMeasuredAt: string | null;
  /** Fillimi i trendit — ankora e gate-it not_priced (v5). */
  trendStart: TrendStart | null;
  score: number;
  /** Sa komponentë të score-it kishin data reale (nga 6) — p.sh. 4/6. */
  componentsAvailable: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
  google: {
    inFeedToday: boolean;
    approxTraffic: string | null; // "1000+" siç vjen nga RSS
    traffic: number | null;       // numri i parzgjedhur
  };
  gdelt: {
    articles1d: number | null;     // artikuj 24h — testimi mainstream
    growth: number | null;         // 7d kundrejt 28d bazës (raport -1)
    confirmed: boolean;
  };
  cause: CauseInfo | null;         // verifikimi i shkakut (P2)
  price: CandidatePrice;
  outcome: CandidateOutcome;
  /** Rezultati 5/20 ditë i matur nga NGJITJA në RESEARCH (v5). */
  outcomeFromPromotion: PromotionOutcome;
  // ── skema v4: provat e gate-ve ──
  wiki: CandidateWiki;                       // burimi 2 i kërkesë (jo-lajme)
  liquidity: CandidateLiquidity;             // vëllami $ për gate-in 4
  sinceStart: ReturnSinceStart;              // kthimi që nga fillimi i trendit (gate 3)
  materialityInfo: MaterialityInfo;          // materialiteti i detajuar (gate 2)
  gates: GateEval[];                          // vlerësimi i fundit i 5 gate-ve
  /** Flamuri «tashmë i çmuar» — kthimi që nga fillimi > +8% vs SPY. */
  alreadyMoved: boolean;
  /** Katalizatori i fitimeve — vetëm shfaqje/renditje, JO gate (v5). */
  catalyst: CandidateCatalyst;
  history: StatusEvent[];
}

export interface ScanRecord {
  at: string;
  durationMs: number;
  regions: string[];
  termsScanned: number;
  termsClassified: number;
  /** Kandidatë të rinj nga zbulimi proaktiv i Wikipedia-s (rrotullimi i fjalorit). */
  discoveredWiki: number;
  candidatesActive: number;
  promoted: number;
  removed: number;
  sources: Record<string, 'ok' | 'error' | 'throttled'>;
  errors: string[];
}

export interface SocialArbStore {
  version: 5;
  createdAt: string;
  lastScanAt: string | null;
  measurements: Measurement[];
  candidates: Record<string, Candidate>;
  scans: ScanRecord[];
  /** Meta për skanimet e rrotullueshme (kursori i fjalorit Wikipedia). */
  meta: { wikiScanCursor: number };
}

export interface ScanResultSummary {
  ok: boolean;
  at: string;
  durationMs: number;
  regions: string[];
  termsScanned: number;
  termsClassified: number;
  /** Kandidatë të rinj nga zbulimi proaktiv i Wikipedia-s. */
  discoveredWiki: number;
  newCandidates: string[];
  promoted: string[];
  removed: string[];
  activeCount: number;
  sources: Record<string, 'ok' | 'error' | 'throttled'>;
  errors: string[];
  archived: number; // rreshta të rinj në arkivin CSV
}
