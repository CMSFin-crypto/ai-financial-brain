// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — llojet e dhënash
// Rrjedha: Google Trends "Trending now" RSS → klasifikim markë/produkt
// → lidhje me ticker → WATCH → RESEARCH (pas konfirmimit + çmimit).
// Skema e matjes është identike me CSV-në e backtest-it që arkivohet
// në prapavijë (data/social-arb-backtest/).
// ═══════════════════════════════════════════════════════════════

export type SourceKind = 'google_trends' | 'gdelt';
export type Region = 'US' | 'GB' | 'CA' | 'AU';
export type CandidateStatus = 'WATCH' | 'RESEARCH' | 'REMOVED';

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
  price: number;         // max 15
  quality: number;       // max 10
  event: number;         // max 10
}

export interface StatusEvent {
  at: string;                       // ISO
  from: CandidateStatus | 'NEW';
  to: CandidateStatus;
  reason: string;
}

export interface Candidate {
  key: string;            // trend|ticker|region
  trend: string;
  ticker: string;
  region: string;
  company: string;
  product: string;
  status: CandidateStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  score: number;
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
  price: {
    stockReturn: number | null;    // 7 dite
    indexReturn: number | null;
    priceVsIndex: number | null;  // diferencë — reagimi relativ
    asOf: string | null;          // data e close-it të fundit
  };
  history: StatusEvent[];
}

export interface ScanRecord {
  at: string;
  durationMs: number;
  regions: string[];
  termsScanned: number;
  termsClassified: number;
  candidatesActive: number;
  promoted: number;
  removed: number;
  sources: Record<string, 'ok' | 'error' | 'throttled'>;
  errors: string[];
}

export interface SocialArbStore {
  version: 2;
  createdAt: string;
  lastScanAt: string | null;
  measurements: Measurement[];
  candidates: Record<string, Candidate>;
  scans: ScanRecord[];
}

export interface ScanResultSummary {
  ok: boolean;
  at: string;
  durationMs: number;
  regions: string[];
  termsScanned: number;
  termsClassified: number;
  newCandidates: string[];
  promoted: string[];
  removed: string[];
  activeCount: number;
  sources: Record<string, 'ok' | 'error' | 'throttled'>;
  errors: string[];
  archived: number; // rreshta të rinj në arkivin CSV
}
