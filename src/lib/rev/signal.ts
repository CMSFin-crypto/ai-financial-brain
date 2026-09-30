// ═══════════════════════════════════════════════════════════════════
// REV v1 — Motori i Sinjalit ("Confirmed Short-Term Reversal")
// ═══════════════════════════════════════════════════════════════════
// E VEÇANTË nga logjika e tab-it IBKR (CTC v2) — mos e përziej.
// Këtu janë: treguesit e vegjël (RSI, ATR), zona e likuiditetit 20-80
// percentile mbi pool-in dedikuar REV (baza + shtresa mid-cap), sinjali
// i hyrjes (ret3 ≤ -8% OSE RSI(2) < 10, idiosinkratik vs SPY DHE vs
// SEKTORIN e vet), gates realë (8-K EDGAR FAIL-CLOSED — vetëm domestic
// filers, emrat pa timeline ekskludohen; SPY crash), dhe konfirmimi
// kundër "falling knife" (green candle / higher low + volum në rënie).
//
// Amendimi 1.1 (para-testimit, 2026-09-30):
//  1. EDGAR fail-closed — event-gate te REV është kusht SIGURIE (te CTC
//     është vetëm bonus PEAD): ADR/foreign filers (6-K/20-F) dhe emrat
//     pa timeline EDGAR të plotë EKSKLUDOHEN, jo "event-neutral".
//  2. Shtresa mid-cap — Nagel (2012): edge-i te mid-cap i vërtetë.
//  3. Dobësi sektoriale — shock-i i gjithë grupit s'ka të bëjë me
//     overreaction të emrit individual.
// ═══════════════════════════════════════════════════════════════════

import { REV_HYPOTHESIS as H } from './hypothesis';

// ── Tipe bazë ─────────────────────────────────────────────────────────

export interface RevBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RevSeries {
  symbol: string;
  bars: RevBar[];
}

// ── Tregues të vegjël, self-contained (s'importojnë nga lib/indicators) ──

/** RSI klasik Wilder — kthen varg me NaN për periudhën e ngrohjes. */
export function revRsi(closes: number[], period: number): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain += Math.max(0, ch) / period;
    avgLoss += Math.max(0, -ch) / period;
  }
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, ch)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -ch)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** ATR(14) Wilder — kthen varg me NaN për periudhën e ngrohjes. */
export function revAtr(bars: RevBar[], period: number): number[] {
  const n = bars.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n < period + 1) return out;
  const trs: number[] = [NaN];
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    trs.push(tr);
  }
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += trs[i];
  atr /= period;
  out[period] = atr;
  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    out[i] = atr;
  }
  return out;
}

/** Dollar-volume trailing 20d (mesatarja e close×volume të 20 barëve të fundit deri në i përfshirë). */
export function revDollarVol20(bars: RevBar[], i: number): number {
  const from = Math.max(0, i - H.liquidityLookbackDays + 1);
  let sum = 0;
  let cnt = 0;
  for (let k = from; k <= i; k++) {
    sum += bars[k].close * bars[k].volume;
    cnt++;
  }
  return cnt ? sum / cnt : 0;
}

// ── Sektori (map kompakt lokal REV — pa import nga ibkr-scan) ─────────

export const REV_SECTOR_MAP: Record<string, string> = {
  AAPL: 'Tech', MSFT: 'Tech', NVDA: 'Tech', AMZN: 'Consumer', GOOGL: 'Tech', GOOG: 'Tech', META: 'Tech',
  TSLA: 'Consumer', 'BRK.B': 'Finance', JPM: 'Finance', V: 'Finance', UNH: 'Healthcare', XOM: 'Energy',
  LLY: 'Healthcare', JNJ: 'Healthcare', WMT: 'Consumer', MA: 'Finance', AVGO: 'Tech', PG: 'Staples',
  ORCL: 'Tech', HD: 'Consumer', COST: 'Consumer', ABBV: 'Healthcare', BAC: 'Finance', KO: 'Staples',
  MRK: 'Healthcare', NFLX: 'Communication', CVX: 'Energy', PEP: 'Staples', CRM: 'Tech', TMO: 'Healthcare',
  AMD: 'Tech', ACN: 'Tech', LIN: 'Materials', MCD: 'Consumer', ABT: 'Healthcare', CSCO: 'Tech', DHR: 'Healthcare',
  WFC: 'Finance', GE: 'Industrial', INTC: 'Tech', IBM: 'Tech', TXN: 'Tech', QCOM: 'Tech', AMAT: 'Tech',
  NOW: 'Tech', INTU: 'Tech', ISRG: 'Healthcare', BKNG: 'Consumer', UBER: 'Consumer', DIS: 'Consumer',
  VZ: 'Communication', CMCSA: 'Communication', ADBE: 'Tech', PFE: 'Healthcare', T: 'Communication',
  NKE: 'Consumer', LOW: 'Consumer', UNP: 'Industrial', HON: 'Industrial', AMGN: 'Healthcare',
  SPGI: 'Finance', RTX: 'Industrial', CAT: 'Industrial', BA: 'Industrial', GS: 'Finance', BLK: 'Finance',
  PLD: 'REITs', SYK: 'Healthcare', ELV: 'Healthcare', MDT: 'Healthcare', AXP: 'Finance', C: 'Finance',
  MS: 'Finance', SCHW: 'Finance', TJX: 'Consumer', MMC: 'Finance', CB: 'Finance', SO: 'Utilities',
  DUK: 'Utilities', GILD: 'Healthcare', ADI: 'Tech', LRCX: 'Tech', PANW: 'Tech', KLAC: 'Tech',
  SNPS: 'Tech', CDNS: 'Tech', CRWD: 'Tech', SNOW: 'Tech', PLTR: 'Tech', SHOP: 'Tech', SQ: 'Finance',
  PYPL: 'Finance', COIN: 'Finance', HOOD: 'Finance', SOFI: 'Finance', AFRM: 'Finance', UPST: 'Finance',
  RBLX: 'Communication', U: 'Tech', ABNB: 'Consumer', DASH: 'Consumer', ETSY: 'Consumer', MELI: 'Consumer',
  SE: 'Consumer', JD: 'Consumer', BABA: 'Consumer', PDD: 'Consumer', NIO: 'Consumer', LI: 'Consumer',
  XPEV: 'Consumer', RIVN: 'Consumer', LCID: 'Consumer', F: 'Consumer', GM: 'Consumer', RACE: 'Consumer',
  HMC: 'Consumer', TM: 'Consumer', STLA: 'Consumer', PCAR: 'Industrial', DE: 'Industrial', FDX: 'Industrial',
  UPS: 'Industrial', DAL: 'Industrial', UAL: 'Industrial', LUV: 'Industrial', AAL: 'Industrial',
  CSX: 'Industrial', NSC: 'Industrial', ODFL: 'Industrial', WM: 'Industrial', RSG: 'Industrial',
  CTAS: 'Industrial', VRSK: 'Finance', CPRT: 'Industrial', FAST: 'Industrial', URI: 'Industrial',
  PWR: 'Industrial', PH: 'Industrial', EMR: 'Industrial', ITW: 'Industrial', ROK: 'Industrial',
  CARR: 'Industrial', OTIS: 'Industrial', TT: 'Industrial', IR: 'Industrial', AME: 'Industrial',
  DOV: 'Industrial', XYL: 'Industrial', IEX: 'Industrial', AMT: 'REITs', CCI: 'REITs', SPG: 'REITs',
  O: 'REITs', PSA: 'REITs', WELL: 'REITs', DLR: 'REITs', VICI: 'REITs', IRM: 'REITs', EQIX: 'REITs',
  NEE: 'Utilities', AEP: 'Utilities', EXC: 'Utilities', SRE: 'Utilities', XEL: 'Utilities',
  PEG: 'Utilities', EIX: 'Utilities', DTE: 'Utilities', CVNA: 'Consumer', CHWY: 'Consumer', LULU: 'Consumer',
  SBUX: 'Consumer', NKE_: 'Consumer', YUM: 'Consumer', CMG: 'Consumer', DPZ: 'Consumer',
  EL: 'Consumer', KHC: 'Staples', MDLZ: 'Staples', KDP: 'Staples', MNST: 'Staples', CELH: 'Staples',
  GIS: 'Staples', K: 'Staples', CAG: 'Staples', HRL: 'Staples', TSN: 'Staples', ADM: 'Staples',
  BG: 'Staples', MO: 'Staples', PM: 'Staples', BTI: 'Staples', CL: 'Staples', KMB: 'Staples',
  CHD: 'Staples', CLX: 'Staples', HSY: 'Staples', KHC_: 'Staples', STZ: 'Staples', TAP: 'Staples',
  BUD: 'Staples', DEO: 'Consumer', SAM: 'Staples', FIZZ: 'Staples', PRMW: 'Staples',
  CI: 'Healthcare', HUM: 'Healthcare', CVS: 'Healthcare', MCK: 'Healthcare', COR: 'Healthcare',
  BSX: 'Healthcare', EW: 'Healthcare', ZBH: 'Healthcare', BDX: 'Healthcare', ALGN: 'Healthcare',
  DXCM: 'Healthcare', PODD: 'Healthcare', MRNA: 'Healthcare', BNTX: 'Healthcare', REGN: 'Healthcare',
  VRTX: 'Healthcare', BIIB: 'Healthcare', INCY: 'Healthcare', EXEL: 'Healthcare', NBIX: 'Healthcare',
  ALNY: 'Healthcare', BMRN: 'Healthcare', RARE: 'Healthcare', TECH: 'Healthcare', WAT: 'Healthcare',
  MTD: 'Healthcare', IDXX: 'Healthcare', RVTY: 'Healthcare', BIO: 'Healthcare', CRL: 'Healthcare',
  IQV: 'Healthcare', A: 'Healthcare', HCA: 'Healthcare', THC: 'Healthcare', UHS: 'Healthcare',
  DVA: 'Healthcare', CNC: 'Healthcare', MOH: 'Healthcare', VTRS: 'Healthcare', TEVA: 'Healthcare',
  TAK: 'Healthcare', AZN: 'Healthcare', GSK: 'Healthcare', SNY: 'Healthcare', NVS: 'Healthcare',
  RHHBY: 'Healthcare', SAN: 'Finance', BCS: 'Finance', UBS: 'Finance', DB: 'Finance', ING: 'Finance',
  PNC: 'Finance', TFC: 'Finance', FITB: 'Finance', HBAN: 'Finance', RF: 'Finance', CFG: 'Finance',
  KEY: 'Finance', MTB: 'Finance', USB: 'Finance', COF: 'Finance', DFS: 'Finance', SYF: 'Finance',
  ALL: 'Finance', TRV: 'Finance', AIG: 'Finance', MET: 'Finance', PRU: 'Finance', AFL: 'Finance',
  HIG: 'Finance', CINF: 'Finance', PGR: 'Finance', AON: 'Finance', AJG: 'Finance', BRO: 'Finance',
  WTW: 'Finance', ICE: 'Finance', CME: 'Finance', CBOE: 'Finance', NDAQ: 'Finance', MKTX: 'Finance',
  TW: 'Finance', NTRS: 'Finance', STT: 'Finance', BK: 'Finance', RJF: 'Finance', LPLA: 'Finance',
  SF: 'Finance', EVR: 'Finance', PJT: 'Finance', MC: 'Finance', HLI: 'Finance', LAZ: 'Finance',
  BEN: 'Finance', TROW: 'Finance', IVZ: 'Finance', AMG: 'Finance', APO: 'Finance', KKR: 'Finance',
  BX: 'Finance', CG: 'Finance', ARES: 'Finance', OWL: 'Finance', FIS: 'Finance', FISV: 'Finance',
  GPN: 'Finance', JKHY: 'Finance', PAYX: 'Tech', PAYC: 'Finance', PCTY: 'Finance', WEX: 'Finance',
  EEFT: 'Finance', FOUR: 'Finance', TOST: 'Finance', BILL: 'Finance', NCNO: 'Finance', QTWO: 'Finance',
  SLB: 'Energy', EOG: 'Energy', OXY: 'Energy', MPC: 'Energy', PSX: 'Energy', VLO: 'Energy',
  DVN: 'Energy', FANG: 'Energy', CTRA: 'Energy', HES: 'Energy', WMB: 'Energy', KMI: 'Energy',
  OKE: 'Energy', TRGP: 'Energy', ET: 'Energy', EPD: 'Energy', LNG: 'Energy', COP: 'Energy',
  APA: 'Energy', MRO: 'Energy', PR: 'Energy', HAL: 'Energy', BKR: 'Energy', NOV: 'Energy',
  FTI: 'Energy', CHX: 'Energy', RRC: 'Energy', EQT: 'Energy', AR: 'Energy', CNX: 'Energy',
  MMM: 'Industrial', HON_: 'Industrial', GE_: 'Industrial', GD: 'Industrial', LMT: 'Industrial',
  NOC: 'Industrial', TDG: 'Industrial', HEI: 'Industrial', AXON: 'Industrial', RHI: 'Industrial',
  MAN: 'Industrial', LDOS: 'Industrial', BAH: 'Industrial', CAIN: 'Industrial', LHX: 'Industrial',
  TXT: 'Industrial', SPR: 'Industrial', HWM: 'Industrial', CR: 'Industrial', GGG: 'Industrial',
  SWK: 'Industrial', MAS: 'Industrial', ALB: 'Materials', FCX: 'Materials', NEM: 'Materials',
  NUE: 'Materials', STLD: 'Materials', CLF: 'Materials', X: 'Materials', AA: 'Materials',
  DOW: 'Materials', LYB: 'Materials', DD: 'Materials', PPG: 'Materials', SHW: 'Materials',
  ECL: 'Materials', APD: 'Materials', CE: 'Materials', EMN: 'Materials', IP: 'Materials',
  PKG: 'Materials', SEE: 'Materials', AVY: 'Materials', MLM: 'Materials', VMC: 'Materials',
  AMZN_: 'Consumer', EBAY: 'Consumer', W: 'Consumer', CHWY_: 'Consumer', GME: 'Consumer',
  BURL: 'Consumer', ROST: 'Consumer', KSS: 'Consumer', JWN: 'Consumer', M: 'Consumer',
  TGT: 'Consumer', DG: 'Consumer', DLTR: 'Consumer', FIVE: 'Consumer', OLLI: 'Consumer',
  COST_: 'Consumer', BJ: 'Consumer', KR: 'Staples', ACI: 'Staples', SFM: 'Staples', CASY: 'Staples',
  MUSA: 'Staples', TSCO: 'Consumer', HD_: 'Consumer', FDX_: 'Industrial', TRV_: 'Finance',
  DIS_: 'Consumer', PARA: 'Communication', FOX: 'Communication', FOXA: 'Communication',
  NWSA: 'Communication', NWS: 'Communication', NYT: 'Communication', PSO: 'Communication',
  CHTR: 'Communication', FUBO: 'Communication', SPOT: 'Communication', SIRI: 'Communication',
  MSGS: 'Communication', MANU: 'Communication', AMC: 'Communication', CNK: 'Communication',
  IMAX: 'Communication', PINS: 'Communication', SNAP: 'Communication', RDDT: 'Communication',
  MTCH: 'Communication', BMBL: 'Communication', IAC: 'Communication', YELP: 'Communication',
  WBD: 'Communication', TTWO: 'Consumer', EA: 'Consumer', ROKU: 'Communication', LYV: 'Communication',
  EXPE: 'Consumer', MAR: 'Consumer', HLT: 'Consumer', H: 'Consumer', IHG: 'Consumer', CHH: 'Consumer',
  WH: 'Consumer', TCOM: 'Consumer', TRIP: 'Consumer', DESP: 'Consumer', SABR: 'Consumer',
  TRVG: 'Consumer', YTRA: 'Consumer', ZNGA: 'Consumer', PLTK: 'Consumer', PENN: 'Consumer',
  CZR: 'Consumer', MGM: 'Consumer', WYNN: 'Consumer', LVS: 'Consumer', MLCO: 'Consumer', BYD: 'Consumer',
  DELL: 'Tech', HPQ: 'Tech', STX: 'Tech', WDC: 'Tech', SMCI: 'Tech', HPE: 'Tech', ANET: 'Tech',
  MRVL: 'Tech', MU: 'Tech', ON: 'Tech', MCHP: 'Tech', SWKS: 'Tech', QRVO: 'Tech', MPWR: 'Tech',
  NXPI: 'Tech', ASML: 'Tech', TSM: 'Tech', UMC: 'Tech', GFS: 'Tech', ARM: 'Tech', ENTG: 'Tech',
  MKSI: 'Tech', ACLS: 'Tech', LITE: 'Tech', COHR: 'Tech', KEYS: 'Tech', TRMB: 'Tech', S: 'Tech',
  OKTA: 'Tech', CLOUD: 'Tech', CYBR: 'Tech', TENB: 'Tech', PTC: 'Tech', TEAM: 'Tech', MDB: 'Tech',
  ESTC: 'Tech', CFLT: 'Tech', AI: 'Tech', BBAI: 'Tech', ADP: 'Tech', WDAY: 'Tech', VEEV: 'Healthcare',
  HUBS: 'Tech', ANSS: 'Tech', FTNT: 'Tech', NET: 'Tech', ZS: 'Tech', DDOG: 'Tech', AKAM: 'Tech',
  CTSH: 'Tech', JNPR: 'Tech', FFIV: 'Tech', CIEN: 'Tech', NTAP: 'Tech', PSTG: 'Tech',
  // Shtresa mid-cap REV (amendimi 1.1) — sektorët e kandidatëve të shtresës
  NTNX: 'Tech', GTLB: 'Tech', DBX: 'Tech', DOCN: 'Tech', WIX: 'Tech', TER: 'Tech',
  ZBRA: 'Tech', JBL: 'Tech', FLEX: 'Tech', ONTO: 'Tech', IPGP: 'Tech', CGNX: 'Tech',
  KTOS: 'Industrial', FIX: 'Industrial', STRL: 'Industrial', ACM: 'Industrial',
  BLD: 'Industrial', SITE: 'Industrial', WMS: 'Industrial',
  EWBC: 'Finance', CMA: 'Finance', FHN: 'Finance', SNV: 'Finance', ONB: 'Finance',
  GBCI: 'Finance', WAL: 'Finance',
  LNTH: 'Healthcare', CORT: 'Healthcare', INSP: 'Healthcare', RGEN: 'Healthcare',
  MEDP: 'Healthcare', TXG: 'Healthcare', EHC: 'Healthcare',
  WING: 'Consumer', CAVA: 'Consumer', DKS: 'Consumer', SHAK: 'Consumer', BOOT: 'Consumer',
  BFAM: 'Consumer', TPX: 'Consumer', NWL: 'Consumer', CROX: 'Consumer', YETI: 'Consumer',
  MTDR: 'Energy', VNOM: 'Energy', CIVI: 'Energy',
  MOS: 'Materials', CF: 'Materials',
  UDR: 'REITs', MAA: 'REITs', CPT: 'REITs', INVH: 'REITs', AMH: 'REITs',
  ATO: 'Utilities', NJR: 'Utilities', SR: 'Utilities', POWL: 'Utilities',
  CARG: 'Communication', TDS: 'Communication',
};

export function revSectorOf(symbol: string): string {
  return REV_SECTOR_MAP[symbol] ?? 'Tjetër';
}

// ── Shtresa mid-cap (amendimi 1.1 — Nagel 2012) ───────────────────

/**
 * SHTRESA MID-CAP — kandidatë likuidë S&P 400 / Russell Midcap-stil
 * ($2-20B), të shtuar POSAÇËRISHT për REV. Problemi: baza 400 e
 * përbashkët është e përqendruar në large/mega-cap, kështu që zona
 * 20-80p e saj është "jo-mega-cap brenda liste large-cap" — jo mid-cap
 * i vërtetë ku Nagel (2012) e gjen edge-in më të fortë. Këta emra
 * s'zëvendësojnë bazën — e ZGJEROJNË pool-in REV; filtri 20-80
 * percentile + pragjet absolute ($10M/ditë, $10) vazhdojnë të vlejnë
 * për të gjithë. Anëtarësimi në shtresë shërben edhe si klasifikim
 * mid-cap kur market cap nuk është i disponueshëm.
 */
export const REV_MIDCAP_TIER: string[] = [
  // Tech / Semikonduktorë
  'NTNX', 'GTLB', 'DBX', 'DOCN', 'WIX', 'TER', 'ZBRA', 'JBL', 'FLEX', 'ONTO', 'IPGP', 'CGNX',
  // Industrial / Aérospaciale / Ndërtim
  'KTOS', 'FIX', 'STRL', 'ACM', 'BLD', 'SITE', 'WMS',
  // Financa / Banka rajonale
  'EWBC', 'CMA', 'FHN', 'SNV', 'ONB', 'GBCI', 'WAL',
  // Healthcare / Biotech / Medtech
  'LNTH', 'CORT', 'INSP', 'RGEN', 'MEDP', 'TXG', 'EHC',
  // Consumer / Retail / Restorante
  'WING', 'CAVA', 'DKS', 'SHAK', 'BOOT', 'BFAM', 'TPX', 'NWL', 'CROX', 'YETI',
  // Energji
  'MTDR', 'VNOM', 'CIVI',
  // Materiale
  'MOS', 'CF',
  // REITs
  'UDR', 'MAA', 'CPT', 'INVH', 'AMH',
  // Komunalitete
  'ATO', 'NJR', 'SR', 'POWL',
  // Komunikim / Media
  'CARG', 'TDS',
];

const REV_MIDCAP_TIER_SET = new Set(REV_MIDCAP_TIER);

/**
 * A është emri mid-cap? Nëse market cap është i disponueshëm → klasifiko
 * sipas pragjeve $2-20B të ngrira; përndryshe sipas anëtarësimit në
 * shtresën mid-cap dedikuese REV.
 */
export function revIsMidcapCandidate(symbol: string, mktCap?: number | null): boolean {
  if (typeof mktCap === 'number' && Number.isFinite(mktCap) && mktCap > 0) {
    return mktCap >= H.midcapMktCapMin && mktCap <= H.midcapMktCapMax;
  }
  return H.requireMidcapLayer && REV_MIDCAP_TIER_SET.has(symbol);
}

export interface RevUniverseComposition {
  zoneTotal: number;
  midcapCount: number;
  midcapSharePct: number;
  ok: boolean; // ≥ revPoolMidcapMinSharePct
  note: string;
}

/**
 * Përbërja e ZONËS 20-80p (jo e gjithë pool-it!) — sa % e emrave që REV
 * vërtet do të testonte janë mid-cap. Kjo është matja e amendimit 1.1:
 * nëse zona është plot large-caps, hipoteza testohet mbi zonën e gabuar
 * të spektrit të likuiditetit dhe gate-i i përbërjes dështon.
 */
export function revUniverseComposition(
  zone: { symbol: string; mktCap?: number | null }[],
): RevUniverseComposition {
  const total = zone.length;
  let midcap = 0;
  for (const s of zone) {
    if (revIsMidcapCandidate(s.symbol, s.mktCap)) midcap++;
  }
  const midcapSharePct = total ? (midcap / total) * 100 : 0;
  const ok = midcapSharePct >= H.revPoolMidcapMinSharePct;
  return {
    zoneTotal: total,
    midcapCount: midcap,
    midcapSharePct: Math.round(midcapSharePct * 10) / 10,
    ok,
    note: ok
      ? `Zona përmban ${midcapSharePct.toFixed(0)}% mid-cap — hipoteza testohet në zonën e duhur`
      : `Zona ka vetëm ${midcapSharePct.toFixed(0)}% mid-cap (< ${H.revPoolMidcapMinSharePct}%) — zgjero shtresën mid-cap ose pranoje se teston zonën e gabuar`,
  };
}

// ── Zona e likuiditetit 20-80 percentile (POINT-IN-TIME) ──────────────

/**
 * Kalkulon kush është në zonën e likuiditetit mesatar (20-80 percentile
 * të dollar-volume trailing 20d, cross-seksional në ditën e dhënë) + pragjet
 * absolute (≥$10M/ditë, çmim ≥$10). Ky është ndryshimi themelor nga CTC,
 * që merr top-kuintilin.
 */
export function revLiquidityZoneAt(
  snapshot: { symbol: string; dollarVol20: number; price: number }[],
): { inZone: Set<string>; pctBySymbol: Record<string, number> } {
  const eligible = snapshot.filter((s) => s.price >= H.minPrice);
  const sorted = [...eligible].sort((a, b) => a.dollarVol20 - b.dollarVol20);
  const n = sorted.length;
  const inZone = new Set<string>();
  const pctBySymbol: Record<string, number> = {};

  sorted.forEach((s, rank) => {
    const pct = n > 1 ? rank / (n - 1) : 1;
    pctBySymbol[s.symbol] = pct;
    if (
      pct >= H.liquidityPercentileLow &&
      pct <= H.liquidityPercentileHigh &&
      s.dollarVol20 >= H.minDollarVolumeFloor &&
      s.price >= H.minPrice
    ) {
      inZone.add(s.symbol);
    }
  });

  // Ata nën pragjet absolute jashtë zone pavarësisht percentile
  for (const s of snapshot) {
    if (s.dollarVol20 < H.minDollarVolumeFloor || s.price < H.minPrice) inZone.delete(s.symbol);
  }

  return { inZone, pctBySymbol };
}

// ── Sinjali i hyrjes (Seksioni 2 i spec-it) ───────────────────────────

export interface RevSignalInput {
  ret3Pct: number; // kthimi kumulativ 3-ditor %
  rsi2: number;
  spyRet3Pct: number; // kthimi 3-ditor i SPY në të njëjtën periudhë
  sectorRet3Pct: number; // mesatarja equal-weight 3-ditore e sektorit PA veten; NaN nëse peers < minSectorPeers
  spyDailyMovePct: number; // lëvizja ditore e SPY ditën e sinjalit
}

export interface RevSignalResult {
  dropTriggered: boolean; // ret3 ≤ -8% OSE RSI(2) < 10
  idiosyncratic: boolean; // ret3 < spyRet3 (rënia më e madhe se tregu)
  sectorRelative: boolean; // ret3 < mesatarja e sektorit — dobësi specifike, jo shock grupi (amendimi 1.1)
  spyCrash: boolean; // SPY ≤ -3% ditën e sinjalit → circuit breaker
  passed: boolean;
}

export function revSignalCheck(inp: RevSignalInput): RevSignalResult {
  const dropTriggered =
    inp.ret3Pct <= H.min3DayCumReturnPct || inp.rsi2 < H.rsi2Oversold;
  const idiosyncratic = H.idiosyncraticVsSpyRequired
    ? inp.ret3Pct < inp.spyRet3Pct
    : true;
  // Amendimi 1.1: rënia duhet dukshëm negative EDHE kundrejt sektorit të
  // vet. Një aksion mund të bjerë njësoj si gjithë sektori (shock sektorial
  // — p.sh. lajm makro bankar) pa u dukur kundrejt SPY; aty reversal-i
  // individual është më pak i besueshëm (korrelacioni brenda sektorit
  // rritet, njësoj si te crash sistemik). Pa peers të mjaftueshëm →
  // fail-closed (s'kemi si ta verifikojmë dobësinë specifike).
  const sectorRelative = H.sectorRelativeRequired
    ? Number.isFinite(inp.sectorRet3Pct) &&
      inp.ret3Pct - inp.sectorRet3Pct <
        -Math.abs(H.sectorRelativeUnderperformancePct)
    : true;
  const spyCrash = inp.spyDailyMovePct <= H.blockIfSpyDailyMovePctBelow;
  return {
    dropTriggered,
    idiosyncratic,
    sectorRelative,
    spyCrash,
    passed: dropTriggered && idiosyncratic && sectorRelative && !spyCrash,
  };
}

// ── Konfirmimi (Seksioni 3 i spec-it — mbrojtja kundër falling knife) ──

export interface RevConfirmationInput {
  signalBar: RevBar; // dita e rënies (t)
  confirmBar: RevBar; // dita pas (t+1)
  confirmVolume: number;
}

export interface RevConfirmationResult {
  greenCandle: boolean; // close > open
  higherLow: boolean; // low(t+1) > low(t)
  stabilizing: boolean; // greenCandle OSE higherLow
  volumeDeclining: boolean; // vol(t+1) < vol(t)
  newLow: boolean; // low(t+1) < low(t) → thesis i invaliduar
  confirmed: boolean;
}

export function revConfirmationCheck(inp: RevConfirmationInput): RevConfirmationResult {
  const { signalBar, confirmBar } = inp;
  const greenCandle = confirmBar.close > confirmBar.open;
  const higherLow = confirmBar.low > signalBar.low;
  const newLow = confirmBar.low < signalBar.low;
  const stabilizing = greenCandle || higherLow;
  const volumeDeclining = H.requireVolumeDecliningOnConfirmation
    ? inp.confirmVolume < signalBar.volume
    : true;
  const confirmed =
    stabilizing &&
    volumeDeclining &&
    !(H.invalidateIfNewLowOnConfirmationDay && newLow);
  return { greenCandle, higherLow, stabilizing, volumeDeclining, newLow, confirmed };
}

// ── Event gate real — 8-K material (EDGAR) ────────────────────────────

/** Item-et 8-K që konsiderohen lajme materiale (spec Seksioni 2.3). */
export const MATERIAL_8K_ITEMS = new Set([
  '1.01', // Material Definitive Agreement
  '1.02', // Termination of Material Agreement
  '2.02', // Results of Operations (earnings surprise)
  '2.03', // Creation of Direct Financial Obligation
  '2.04', // Triggering Events (default / accelerate)
  '2.05', // Costs Associated with Exit
  '2.06', // Material Impairments
  '3.01', // Notice of Delisting
  '4.02', // Non-reliance on Previously Issued Financials
]);

export interface RevFiling8k {
  filingDate: string; // YYYY-MM-DD
  items: string[]; // ["2.02", ...]
  form?: string; // '8-K', '10-Q', '6-K', '20-F', … — për kontrollin e eligjibilitetit (amendimi 1.1)
}

/**
 * A ka 8-K REAL (material) brenda `days` ditëve kalendarike PARA datës së
 * sinjalit (përfshirë ditën e sinjalit)? — GATE: blloko hyrjen.
 */
export function revHasRecentMaterial8k(
  filings: RevFiling8k[],
  signalDate: string,
  days: number = H.blockIfReal8kWithinDays,
): { blocked: boolean; lastFiling?: RevFiling8k } {
  const t = new Date(signalDate + 'T00:00:00Z').getTime();
  const windowMs = days * 86400_000;
  const inWindow = filings
    .filter((f) => {
      const ft = new Date(f.filingDate + 'T00:00:00Z').getTime();
      return ft <= t && t - ft <= windowMs;
    })
    .sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));
  // 8-K pa items të parsueshme → trajtoje si material (konservator)
  const material = inWindow.find((f) => f.items.length === 0 || f.items.some((it) => MATERIAL_8K_ITEMS.has(it)));
  return material ? { blocked: true, lastFiling: material } : { blocked: false };
}

// ── EDGAR FAIL-CLOSED (amendimi 1.1) — kusht SIGURIE, jo cilësi e dhënash ──
//
// Te CTC event-gate është bonus (PEAD) — nëse mungon, humbet vetëm një
// përforcim. Te REV event-gate BLLOKON hyrjen: nëse mbulimi EDGAR mungon
// për një emër (p.sh. ADR që depoziton 6-K jo 8-K), gate-i do të
// dështonte në heshtje dhe REV mund të hynte pikërisht në rënie me
// arsye fondamentale reale — skenari më i keq, sepse humbet mbrojtja
// kryesore kundër falling-knife. Prandaj: emri pa timeline EDGAR të
// plotë EKSKLUDOHET nga REV krejtësisht — jo "event-neutral".

/** Formularët e foreign private issuers — këta s'depozitojnë 8-K. */
export const FOREIGN_FILER_FORMS = new Set([
  '6-K', '6-K/A', // raporte të përkohshme të të huajve
  '20-F', '20-F/A', // raport vjetor i të huajve
  '40-F', '40-F/A', // raport vjetor MJDS (Kanada)
]);

/**
 * Formularët që tërhiqen për kontrollin e eligjibilitetit — mbulojnë
 * detektimin domestic vs foreign + sondazhin e aktivitetit të timeline-it.
 */
export const EDGAR_ELIGIBILITY_FORMS = [
  '8-K', '8-K/A',
  '10-K', '10-K/A', '10-Q', '10-Q/A',
  '6-K', '6-K/A', '20-F', '20-F/A', '40-F', '40-F/A',
];

export interface RevEdgarEligibilityResult {
  eligible: boolean;
  reason?: 'FOREIGN_FILER' | 'NO_EDGAR_TIMELINE';
  detail: string;
}

/**
 * A ka ky emër timeline EDGAR të plotë që REV mund t'i besojë?
 * FAIL-CLOSED në tre nivele:
 *  1. Pa të dhëna fare → NO_EDGAR_TIMELINE (gate-i do të ishte i verbër)
 *  2. Formular foreign (6-K/20-F/40-F) → FOREIGN_FILER (8-K s'ekziston)
 *  3. Pa asnjë filing brenda edgarCoverageProbeDays → NO_EDGAR_TIMELINE
 * Vetëm pas kalimit të të treva konsiderohet emri "event-verifiable".
 */
export function revEdgarEligibilityCheck(
  filings: RevFiling8k[] | null | undefined,
  asOfDate: string,
): RevEdgarEligibilityResult {
  if (!H.excludeIncompleteEdgarCoverage && !H.usDomesticFilersOnly) {
    return { eligible: true, detail: 'EDGAR gate jo aktiv (konfigurim i vjetër)' };
  }

  // 1. Fail-closed absolute: pa të dhëna → s'kemi mënyrë ta verifikojmë event-gate
  if (!filings || !filings.length) {
    return {
      eligible: false,
      reason: 'NO_EDGAR_TIMELINE',
      detail:
        'Pa timeline EDGAR — event-gate 8-K do të dështonte në heshtje; ' +
        'ekskluzohet nga REV (kusht sigurie, spec Seks. 2.3-amendimi 1.1)',
    };
  }

  // 2. Detektim foreign private issuer / ADR
  if (H.usDomesticFilersOnly) {
    const foreign = filings.find(
      (f) => f.form && FOREIGN_FILER_FORMS.has(f.form.toUpperCase()),
    );
    if (foreign) {
      return {
        eligible: false,
        reason: 'FOREIGN_FILER',
        detail:
          `Filing ${foreign.form} (foreign private issuer / ADR) — 8-K s'ekziston ` +
          'për këtë emër, gate-i s\'do të funksiononte; ekskluzohet nga REV',
      };
    }
  }

  // 3. Sondazhi i timeline-it: të paktën një filing brenda dritares së sondazhit
  if (H.excludeIncompleteEdgarCoverage) {
    const t = new Date(asOfDate + 'T00:00:00Z').getTime();
    const probeMs = H.edgarCoverageProbeDays * 86400_000;
    const hasRecent = filings.some((f) => {
      const ft = new Date(f.filingDate + 'T00:00:00Z').getTime();
      return Number.isFinite(ft) && ft <= t && t - ft <= probeMs;
    });
    if (!hasRecent) {
      return {
        eligible: false,
        reason: 'NO_EDGAR_TIMELINE',
        detail:
          `Pa filing brenda ${H.edgarCoverageProbeDays} ditëve deri ${asOfDate} — ` +
          'timeline EDGAR e pamjaftueshme; ekskluzohet nga REV',
      };
    }
  }

  return { eligible: true, detail: 'Domestic filer me timeline EDGAR aktive — event-gate i verifikueshëm' };
}

// ── Sizing (Seksioni 5 i spec-it) ─────────────────────────────────────

export const REV_ACCOUNT_EQUITY_ASSUMPTION = 25_000; // vetëm për parashikim madhësie

export interface RevPositionSize {
  shares: number;
  riskDollars: number;
  notional: number;
}

export function revPositionSize(entry: number, stop: number): RevPositionSize {
  const riskDollars = REV_ACCOUNT_EQUITY_ASSUMPTION * H.riskPerTradePct;
  const riskPerShare = Math.max(0.01, entry - stop);
  const shares = Math.max(0, Math.floor(riskDollars / riskPerShare));
  return { shares, riskDollars: shares * riskPerShare, notional: shares * entry };
}

// ── Statusi i kandidatit në skanimin live ─────────────────────────────

export type RevScanStatus =
  | 'HYRJE_TANI' // sinjal dje + konfirmim sot OK → hyrje
  | 'PRIT_KONFIRMIM' // sinjal sot → prit konfirmimin nesër
  | 'BLLOKUAR_8K' // sinjal OK por 8-K material brenda 2 ditëve
  | 'BLLOKUAR_SEKTOR' // sinjal OK por rënia ndjek sektorin — jo dobësi specifike (amendimi 1.1)
  | 'EXKLUDUAR_EDGAR' // pa timeline EDGAR të verifikueshme / foreign filer → JASHTË nga REV (amendimi 1.1)
  | 'BLLOKUAR_SPY_CRASH' // sinjal OK por SPY në crash sistemik
  | 'INVALIDUAR_LOW_I_RI' // low i ri ditën e konfirmimit → mos hyr fare
  | 'KONFIRMIM_PLOTFULLYEM' // pa green candle/higher low ose volumi rritet → s'ka hyrje
  | 'PA_SINJAL';
