// ═══════════════════════════════════════════════════════════════
// UNIVERSE CORE — Universi bazë i pastër (~200 emra)
// ═══════════════════════════════════════════════════════════════
// Zëvendëson "400-listën e përzier" (universe-400.ts) — KORRIGJIM
// CILËSIE TË DHËNASH, JO TUNIM PARAMETRI (see CTC_v2_strategy_spec.md,
// Seksioni 2 — i para-regjistruar 2026-09-30, para çdo vlerësimi rezultatesh).
//
// ARSYETIMI TEORIK (cilësi të dhënash, i pandryshueshëm nga rezultatet):
// 1. EDGAR coverage — të gjithë emrat janë US-domestic filers: depozitojnë
//    10-K/10-Q/8-K në US-GAAP pranë SEC. ADR-të dhe filerat e huaj (20-F/40-F,
//    shpesh IFRS) s'kanë mbulim të plotë EDGAR → kontrollet që varen nga
//    arkivat amerikane (8-K material, 10-K, XBRL) prishen ose bëhen no-op.
// 2. ADR filing mismatch — BABA, TSM, AZN, TM, SHOP, SPOT etj. depozitojnë
//    20-F/6-K me kontabilitet të huaj → krahasimi US-GAAP është i pavlefshëm.
// 3. Emra të vdekur/delisted (NKLA, KSU, SGEN, PXD, MRO, PARA, X, DFS...)
//    dhe ticker-e të pavlefshme (CISCO) në listën e vjetër — harrojnë kërkesa
//    të dhënash dhe përdredhin brendinë e sektorit.
//
// KRITERET (të fiksuara PARA rankimit të likuiditetit):
//   a) US-domestic, US-GAAP filer (10-K/10-Q/8-K) — JO 20-F/40-F/ADR
//   b) Large/mega-cap (≈ >$10B kapitalizim)
//   c) Likuide (ADV $ miliarda/dhjetra-miliarda; spread i ngushtë)
//   d) I listuar në NYSE/Nasdaq, listing primar i vetëm
//
// RENDI I FIKSUR: filtër universi bazë → PASTAJ rankimi i likuiditetit
// (top-kuintil percentile i dollar-volume 20d brenda kësaj baze — jo brenda
// 400-listës së vjetër).

export const UNIVERSE_CORE_VERSION = 2;
export const UNIVERSE_CORE_EFFECTIVE_DATE = '2026-09-30';

export const UNIVERSE_CORE_CRITERIA =
  'US-domestic, US-GAAP filer (10-K/10-Q/8-K, jo ADR/20-F/40-F), large/mega-cap, likuide';

export const UNIVERSE_CORE: string[] = [
  // ── Tech / AI / Semiconductors (26) ──
  "AAPL","MSFT","NVDA","AVGO","ORCL","CRM","ADBE","NOW","INTU","IBM",
  "CSCO","ACN","TXN","QCOM","AMAT","LRCX","KLAC","ADI","MRVL","MU",
  "ON","MCHP","MPWR","NXPI","ENTG","SNPS",
  // ── Software / Cybersecurity (14) ──
  "PANW","CRWD","ZS","FTNT","NET","OKTA","CYBR","APP","WDAY","DDOG",
  "MDB","HUBS","TWLO","TTD",
  // ── Communication / Media (16) ──
  "GOOGL","GOOG","META","NFLX","DIS","CMCSA","WBD","CHTR","T","VZ",
  "TMUS","EA","TTWO","RBLX","SNAP","RDDT",
  // ── Consumer Discretionary / Travel / Auto (21) ──
  "AMZN","TSLA","HD","LOW","TJX","NKE","ROST","MCD","SBUX","CMG",
  "ORLY","AZO","F","GM","ABNB","DASH","UBER","BKNG","EXPE","MAR",
  "HLT",
  // ── Consumer Staples (13) ──
  "WMT","COST","PG","KO","PEP","MO","PM","MDLZ","GIS","CL",
  "KMB","CLX","HSY",
  // ── Healthcare / Pharma / Biotech (26) ──
  "UNH","LLY","JNJ","ABBV","MRK","PFE","BMY","TMO","ABT","DHR",
  "AMGN","GILD","VRTX","REGN","ISRG","BSX","SYK","MDT","BDX","CI",
  "ELV","CVS","HUM","HCA","IDXX","IQV",
  // ── Financials / Banks / Insurance / Payments (29) ──
  "JPM","BAC","WFC","C","GS","MS","SCHW","BLK","BRK.B","USB",
  "PNC","TFC","AXP","COF","BX","KKR","PYPL","PGR","ALL","TRV",
  "CB","AIG","MET","ICE","CME","SPGI","MCO","V","MA",
  // ── Energy (12) ──
  "XOM","CVX","COP","EOG","HES","OXY","FANG","MPC","PSX","SLB",
  "WMB","OKE",
  // ── Industrials / Transport / Defense (20) ──
  "GE","RTX","LMT","NOC","BA","CAT","DE","UNP","CSX","NSC",
  "HON","ETN","ITW","ROK","PH","CMI","URI","TDG","WM","FDX",
  // ── Materials / Mining (8) ──
  "LIN","FCX","NEM","AEM","NUE","STLD","APD","SHW",
  // ── REITs (8) ──
  "AMT","CCI","EQIX","DLR","PSA","O","SPG","VICI",
  // ── Utilities (8) ──
  "NEE","DUK","SO","AEP","EXC","SRE","XEL","ED",
];

// Dedupe (siguri — lista e mësipërme duhet të jetë unike)
const DEDUPED = Array.from(new Set(UNIVERSE_CORE));

export const SCAN_UNIVERSE_SIZE = DEDUPED.length;

export const UNIVERSE_CORE_META = {
  version: UNIVERSE_CORE_VERSION,
  effectiveDate: UNIVERSE_CORE_EFFECTIVE_DATE,
  criteria: UNIVERSE_CORE_CRITERIA,
  size: SCAN_UNIVERSE_SIZE,
  rationale:
    'Korrigjim cilësie të dhënash (EDGAR coverage, ADR filing mismatch) — i para-regjistruar para vlerësimit të rezultateve; jo tunim parametri.',
} as const;

/**
 * Kthen universin bazë të pastër (deduped, i kufizuar në `limit`).
 * Default = gjithë bazën (~200 emra).
 */
export function getScanUniverse(limit: number = SCAN_UNIVERSE_SIZE): string[] {
  return DEDUPED.slice(0, limit);
}

/**
 * Ngastr universin në pako për IBKR pacing.
 * IBKR API kufizon ~50 kërkesa/pako; përdor 40–50 për siguri.
 */
export function batchUniverse(batchSize: number = 40): string[][] {
  const all = getScanUniverse();
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += batchSize) {
    batches.push(all.slice(i, i + batchSize));
  }
  return batches;
}
