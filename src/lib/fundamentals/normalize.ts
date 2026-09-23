// ============================================================
// TASK 26 — FUNDAMENTAL CONTEXT (Faza 1: vetëm panel informues)
// ============================================================
// Normalizimi i të dhënave fundamentale (Yahoo Finance quoteSummary /
// JSON lokal) në:
//   1. FundamentalContext  — objekti minimal që fiksohet në kandidat
//                            (identik me spec-in e userit); përdoret
//                            më vonë nga testi A/B (Technical-only vs
//                            Technical + Fundamental filter).
//   2. FundamentalReport   — versioni i pasuruar për popup: çdo tregues
//                            me vlerë, ndryshim periodik, periudhë,
//                            burim, timestamp dhe status.
//
// RREGULLI I ARTË (spec i userit):
//   Metrikë që mungon mbetet `undefined` — KURRË zero.
//   Zero do të interpretohej si vlerë reale (p.sh. "rritje 0%" kur në
//   fakt s'ka asnjë të dhënë). Në UI shfaqet "N/A — data unavailable".
//
// RREGULLI I DYTË:
//   Fundamental Context NUK ndryshon Technical Score, READY, BUY ose
//   WATCH. Është kontekst informues derisa testi rigoroz
//   (Technical-only vs Technical + Fundamental) të vendosë ndryshe.
// ============================================================

import type { YahooFundamentals } from '@/lib/alpha-vantage';
import { metricStatus, sectionLabel, contextLabel } from './scoring';
import { buildRiskFlags, type RiskFlag, type RiskFlagExtras } from './risk-flags';

// ─── 1. Konteksti bazë — SIKUR E SPECIFIKOI USERI (mos e ndrycho) ───

export interface FundamentalContext {
  revenueGrowth?: number;          // decimal YoY (0.184 = +18.4%)
  epsGrowth?: number;              // decimal YoY
  grossMargin?: number;            // decimal (0.46 = 46%)
  operatingMargin?: number;        // decimal
  netMargin?: number;              // decimal
  freeCashFlow?: number;           // $ TTM (mund të jetë negativ)
  debtToEquity?: number;           // % (150 = 1.5x)
  peRatio?: number;
  psRatio?: number;
  evToEbitda?: number;
  earningsSurprise?: number;      // % e tremujorit të fundit
  estimateRevision?: number;     // % — ndryshimi i estimate-it CY brenda 30 ditësh (epsTrend); negativ = po bie
  institutionalOwnership?: number; // % (top-institucione, approx)
  riskFlags: string[];            // kodet e flamujve (REVENUE_DECLINING, ...)
  asOf?: string;                  // ISO timestamp i snapshot-it të të dhënave
}

// ─── 2. Tipet e pasuruara për popup ───

export type MetricStatus = 'strong' | 'neutral' | 'weak' | 'unknown';

export interface FundamentalMetric {
  key: string;
  label: string;            // shqip, për UI
  value?: number;           // raw — undefined kur mungon (kurrë 0 fallco)
  display: string;          // "+18.4% YoY" ose "N/A — data unavailable"
  change?: string;          // ndryshimi periodik (kur ka të dhënë)
  period: string;           // "YoY (tremujori i fundit)" / "TTM" / "Aktuale"
  source: string;           // "Yahoo Finance" / "JSON lokal (snapshot)"
  updated?: string;         // timestamp i të dhënës
  status: MetricStatus;     // strong / neutral / weak / unknown
  note?: string;            // sqarim opsional
}

export type SectionKey =
  | 'growth' | 'profitability' | 'cashFlow' | 'valuation'
  | 'earnings' | 'ownership' | 'risk';

export interface FundamentalSection {
  key: SectionKey;
  title: string;            // "Growth", "Profitability", ...
  label: string;            // "Positive" / "Strong" / "Expensive" / ...
  metrics: FundamentalMetric[];
}

export interface FundamentalReport {
  symbol: string;
  context: FundamentalContext;                    // për strategjinë / testin e ardhshëm
  contextLabel: 'Positive' | 'Neutral' | 'Negative' | 'Insufficient data';
  contextScore: number;                          // -1 .. +1 (pasqyron etiketën)
  coverage: number;                              // 0..1 — sa nga 13 treguesit bazë mbushen
  sections: FundamentalSection[];                 // 7 seksionet e spec-it
  riskFlags: RiskFlag[];
  dataInfo: {
    provider: string;                            // "Yahoo Finance (query1)" / "JSON lokal"
    providerDetail: string;                      // source i papërpunuar
    fetchedAt: string;                          // ISO
    metricsAvailable: number;
    metricsTotal: number;
  };
}

// ─── Helpers ───

/** 0/NaN/null → undefined. Metrika e vërtetë zero është e rrallë; mungesa po. */
function nz(v: number | undefined | null): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'number' || !isFinite(v) || v === 0) return undefined;
  return v;
}

/** Si nz(), por lejon zero KUR të dhënat janë sigurisht të pranishme (p.sh. D/E me cash në bilanc). */
function nzLenient(v: number | undefined | null, trustworthy: boolean): number | undefined {
  if (v === null || v === undefined || !isFinite(v)) return undefined;
  if (v === 0) return trustworthy ? 0 : undefined;
  return v;
}

const NA = 'N/A — data unavailable';

function pct(v: number | undefined, digits = 1): string {
  if (v === undefined) return NA;
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
}

function pctAbs(v: number | undefined, digits = 1): string {
  if (v === undefined) return NA;
  return `${(v * 100).toFixed(digits)}%`;
}

function usd(v: number | undefined): string {
  if (v === undefined) return NA;
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T$`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B$`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M$`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K$`;
  return `${v.toFixed(0)}$`;
}

function num(v: number | undefined, digits = 1): string {
  if (v === undefined) return NA;
  return v.toFixed(digits);
}

// ─── Normalizimi kryesor ───

export interface NormalizeExtras extends RiskFlagExtras {
  // asgjë ekstra për momentin; RiskFlagExtras sjell nextEarningsDate,
  // price60dChangePct, sharesYoYGrowthPct.
}

export function normalizeYahooFundamentals(
  symbol: string,
  fund: YahooFundamentals,
  extras: NormalizeExtras = {},
): FundamentalReport {
  const isLocal = fund.source.includes('local');
  const source = isLocal ? 'JSON lokal (snapshot)' : 'Yahoo Finance';
  const updated = fund.fetchedAt;

  // ── Treguesit bazë (kurrë zero fallco) ──
  const revenueGrowth = nz(fund.revenueGrowth);
  const epsGrowth = nz(fund.earningsGrowth);
  const grossMargin = nz(fund.grossMargins);
  const operatingMargin = nz(fund.operatingMargins);
  const netMargin = nz(fund.profitMargins);
  const freeCashFlow = fund.freeCashflow !== 0 && isFinite(fund.freeCashflow) ? fund.freeCashflow : undefined;
  // D/E = 0 është i vërtetë vetëm kur bilanci ka të dhëna (cash ose borxh të raportuar)
  const debtToEquity = nzLenient(fund.debtToEquity, fund.totalCash > 0 || fund.totalDebt > 0);
  const peRatio = nz(fund.trailingPE);
  const psRatio = nz(fund.priceToSales);
  const evToEbitda = nz(fund.enterpriseToEbitda);
  const earningsSurprise = nz(fund.earningsSurprisePct);
  // Revision: % e ndryshimit të estimate-it CY brenda 30 ditësh (burimi i qëndrueshëm:
  // epsTrend — Yahoo e ka degraduar epsRevisions). Kur mungon → undefined (kurrë zero).
  const epsTrend = fund.epsTrend30d;
  const estimateRevision = epsTrend && epsTrend.days30Ago !== 0
    ? ((epsTrend.current - epsTrend.days30Ago) / Math.abs(epsTrend.days30Ago)) * 100
    : undefined;
  const institutionalOwnership = fund.institutionalOwnershipPct != null && fund.institutionalOwnershipPct > 0
    ? Math.min(100, fund.institutionalOwnershipPct)
    : undefined;

  // Tregues shtesë (pasurojnë popup-in, nuk hyjnë në FundamentalContext bazë)
  const forwardPE = nz(fund.forwardPE);
  const pegRatio = nz(fund.pegRatio);
  const returnOnEquity = nz(fund.returnOnEquity);
  const totalRevenue = nz(fund.totalRevenue);
  const totalCash = nz(fund.totalCash);
  const totalDebt = nz(fund.totalDebt);
  const netCash = totalCash !== undefined && totalDebt !== undefined ? totalCash - totalDebt : undefined;
  const fcfMargin = freeCashFlow !== undefined && totalRevenue && totalRevenue > 0
    ? freeCashFlow / totalRevenue : undefined;
  const targetMean = nz(fund.targetMeanPrice);
  const price = nz(fund.currentPrice);
  const upside = targetMean !== undefined && price !== undefined && price > 0
    ? (targetMean - price) / price : undefined;
  const analysts = nz(fund.numberOfAnalystOpinions);
  const epsEstimateCY = nz(fund.epsEstimateCurrentYear);
  const revenueEstimateCY = nz(fund.revenueEstimateCurrentYear);
  const sharesOutstanding = nz(fund.sharesOutstanding);
  const qRevGrowth = nz(fund.revenueQuarterlyGrowth);
  const qEpsGrowth = nz(fund.earningsQuarterlyGrowth);

  // ── Konteksti (objekti minimal — për objektin e kandidatit + testin A/B) ──
  const context: FundamentalContext = {
    revenueGrowth,
    epsGrowth,
    grossMargin,
    operatingMargin,
    netMargin,
    freeCashFlow,
    debtToEquity,
    peRatio,
    psRatio,
    evToEbitda,
    earningsSurprise,
    estimateRevision,
    institutionalOwnership,
    riskFlags: [], // mbushet më poshtë me kodet
    asOf: updated,
  };

  // ── Ndërtimi i seksioneve (7, sipas spec-it të userit) ──
  const mk = (
    key: string, label: string, value: number | undefined,
    display: string, period: string,
    opts: { change?: string; note?: string; status?: MetricStatus } = {},
  ): FundamentalMetric => ({
    key, label, value, display, period, source, updated,
    status: opts.status ?? metricStatus(key, value),
    change: opts.change,
    note: opts.note,
  });

  const growth: FundamentalSection = {
    key: 'growth',
    title: 'Growth',
    label: '',
    metrics: [
      mk('revenueGrowth', 'Revenue growth', revenueGrowth,
        pct(revenueGrowth), 'YoY — tremujori i fundit kundrejt të njëjtit tremujor një vit më parë',
        qRevGrowth !== undefined
          ? { change: `Momentum tremujor: ${pct(qRevGrowth)}`, note: 'Ndryshimi periodik = momentum i tremujorit të fundit kundrejt mesatares vjetore — përshpejtim ose ngadalësim.' }
          : {}),
      mk('epsGrowth', 'EPS growth', epsGrowth,
        pct(epsGrowth), 'YoY — tremujori i fundit kundrejt të njëjtit tremujor një vit më parë',
        qEpsGrowth !== undefined
          ? { change: `Momentum tremujor: ${pct(qEpsGrowth)}`, note: 'Ndryshimi periodik = momentum EPS i tremujorit të fundit kundrejt mesatares vjetore.' }
          : {}),
    ],
  };

  const profitability: FundamentalSection = {
    key: 'profitability',
    title: 'Profitability',
    label: '',
    metrics: [
      mk('grossMargin', 'Gross margin', grossMargin, pctAbs(grossMargin), 'TTM (12 mujore e mbledhur)'),
      mk('operatingMargin', 'Operating margin', operatingMargin, pctAbs(operatingMargin), 'TTM'),
      mk('netMargin', 'Net margin', netMargin, pctAbs(netMargin), 'TTM'),
      mk('returnOnEquity', 'Return on equity (ROE)', returnOnEquity, pctAbs(returnOnEquity), 'Tremujori i fundit'),
    ],
  };

  // Statusi i FCF në dollarë nuk ka prag absolut (varet nga shkallë): derivohet nga FCF margin
  // ose nga shenja (pozitiv = neutral, negativ = weak).
  const fcfStatus: MetricStatus = fcfMargin !== undefined
    ? metricStatus('fcfMargin', fcfMargin)
    : freeCashFlow === undefined ? 'unknown' : freeCashFlow >= 0 ? 'neutral' : 'weak';
  const netCashStatus: MetricStatus = netCash === undefined ? 'unknown' : netCash >= 0 ? 'strong' : 'neutral';

  const cashFlow: FundamentalSection = {
    key: 'cashFlow',
    title: 'Cash Flow',
    label: '',
    metrics: [
      mk('freeCashFlow', 'Free cash flow (TTM)', freeCashFlow, usd(freeCashFlow), 'TTM',
        { status: fcfStatus, note: 'Paraja që mbetet pas operacionit dhe capex — mbështetja e blerjeve të ritura, rihapjeve dhe shlyerjes së borxhit.' }),
      mk('fcfMargin', 'FCF margin', fcfMargin, pctAbs(fcfMargin), 'TTM — FCF / Revenue'),
      mk('netCashPosition', 'Pozicioni neto i parasë', netCash, usd(netCash), 'Tremujori i fundit — Cash − Debt',
        { status: netCashStatus, note: netCash !== undefined ? (netCash >= 0 ? 'Kasa mbi borxhin — amortizues goditjesh tregu.' : 'Borxh mbi kasë — shërbimi i borxhit ha paratë e rritjes.') : undefined }),
      mk('debtToEquity', 'Debt / Equity', debtToEquity, debtToEquity !== undefined ? `${num(debtToEquity, 1)}%` : NA, 'Tremujori i fundit'),
    ],
  };

  const valuation: FundamentalSection = {
    key: 'valuation',
    title: 'Valuation',
    label: '',
    metrics: [
      mk('peRatio', 'P/E (trailing)', peRatio, peRatio !== undefined ? `${num(peRatio, 1)}x` : NA, 'Aktuale — çmimi i sotëm / EPS 12-mujore',
        forwardPE !== undefined && peRatio !== undefined
          ? { change: `Forward P/E: ${num(forwardPE, 1)}x (${forwardPE < peRatio ? 'presje pozitive — fitimet priten të rriten' : 'presje negative — fitimet priten të bien'})` }
          : {}),
      mk('psRatio', 'P/S (price to sales)', psRatio, psRatio !== undefined ? `${num(psRatio, 1)}x` : NA, 'Aktuale'),
      mk('evToEbitda', 'EV / EBITDA', evToEbitda, evToEbitda !== undefined ? `${num(evToEbitda, 1)}x` : NA, 'Aktuale'),
      mk('pegRatio', 'PEG ratio', pegRatio, pegRatio !== undefined ? num(pegRatio, 2) : NA, 'Aktuale — P/E pjesëtuar me rritjen'),
      mk('targetUpside', 'Upside vs. target i analistëve', upside, pct(upside), 'Target mesatar kundrejt çmimit aktual',
        { note: analysts !== undefined ? `Bazuar në ${analysts} analistë.` : undefined }),
    ],
  };

  const earnings: FundamentalSection = {
    key: 'earnings',
    title: 'Earnings & Estimates',
    label: '',
    metrics: [
      mk('earningsSurprise', 'Earnings surprise (i fundit)', earningsSurprise, pct(earningsSurprise),
        fund.lastEarningsPeriod ? `Tremujori i fundit — ${fund.lastEarningsPeriod}` : 'Tremujori i fundit i raportuar',
        { note: 'EPS aktual kundrejt konsensusit — tregon nëse kompania i mposht pritjet.' }),
      mk('epsEstimateCurrentYear', 'EPS estimate (viti aktual)', epsEstimateCY, epsEstimateCY !== undefined ? `$${num(epsEstimateCY, 2)}` : NA, 'Konsensusi i analistëve — viti aktual',
        epsTrend && epsEstimateCY !== undefined
          ? { change: `30 ditë më parë: $${num(epsTrend.days30Ago, 2)} · 60 ditë: $${num(epsTrend.days60Ago, 2)}`, note: 'Ndryshimi periodik tregon drejtimin e konsensusit — estimi që ngrihet është lideri më i besueshëm i fitimeve.' }
          : {}),
      mk('revenueEstimateCurrentYear', 'Revenue estimate (viti aktual)', revenueEstimateCY, usd(revenueEstimateCY), 'Konsensusi i analistëve — viti aktual'),
      mk('estimateRevision', 'Revision i estimate-ve (30 ditë)', estimateRevision,
        estimateRevision !== undefined
          ? `${estimateRevision > 0 ? '+' : ''}${estimateRevision.toFixed(2)}% ${fund.epsRevisions ? `· ${fund.epsRevisions.up30d} ngritën / ${fund.epsRevisions.down30d} ulën` : ''}`.trim()
          : NA,
        '30 ditët e fundit — estimi i vitit aktual kundrejt konsensusit të 30 ditësh më parë',
        { note: 'Revision-i është lideri më i besueshëm i fitimeve: arrin përpara numrave. Negativ = analistët po e presin fitimin poshtë.' }),
      mk('recommendation', 'Konsensusi i analistëve', undefined,
        fund.recommendationKey ? String(fund.recommendationKey).replace('_', ' ').toUpperCase() : NA,
        'Aktual',
        { note: analysts !== undefined ? `${analysts} analistë mbulojnë emrin.` : undefined }),
      mk('nextEarningsDate', 'Earnings i ardhshëm', undefined,
        extras.nextEarningsDate || fund.nextEarningsDate || NA,
        'Data e raportimit të ardhshëm',
        { note: 'Rregulli i skanerit: brenda 2 ditësh bllokohet te Catalyst Gate; 3-7 ditë e ul pozicionin në 50%.' }),
    ],
  };

  const ownership: FundamentalSection = {
    key: 'ownership',
    title: 'Ownership',
    label: '',
    metrics: [
      mk('institutionalOwnership', 'Institutional ownership', institutionalOwnership,
        institutionalOwnership !== undefined ? `${num(institutionalOwnership, 1)}%` : NA,
        'Top-institucione (13F/13G) — përshtypje nga lista e mbajtësve më të mëdhenj',
        { note: 'Mbajtës institucionalë = mbështetje afatgjatë e çmimit; shitje masive institucionale është sinjal i vonuar rënieje.' }),
      mk('institutionCount', 'Institucione mbajtëse (top)', fund.institutionCount,
        fund.institutionCount != null && fund.institutionCount > 0 ? String(fund.institutionCount) : NA, 'Top-lista e mbajtësve'),
      mk('sharesOutstanding', 'Aksione në qarkullim', sharesOutstanding, usd(sharesOutstanding), 'Aktual',
        extras.sharesYoYGrowthPct != null
          ? { change: `Ndryshimi V/V: ${extras.sharesYoYGrowthPct > 0 ? '+' : ''}${extras.sharesYoYGrowthPct.toFixed(1)}%`, note: extras.sharesYoYGrowthPct >= 5 ? 'Rritje e aksioneve ≥5% në vit = shpërbajtje (dilution).' : undefined }
          : {}),
    ],
  };

  // ── Risk flags (lista + kodet në kontekst) ──
  // nextEarningsDate vjen automatikisht nga Yahoo earningsTrend (0q) kur
  // thirrësi s'e jep ndonjë të eksplicit — flamuri "Earnings të afërta" duhet
  // të punojë edhe pa extras.
  const riskFlags = buildRiskFlags(context, {
    ...extras,
    nextEarningsDate: extras.nextEarningsDate || fund.nextEarningsDate || undefined,
  });
  context.riskFlags = riskFlags.map(f => f.code);

  const risk: FundamentalSection = {
    key: 'risk',
    title: 'Risk Flags',
    label: riskFlags.length === 0 ? 'Low' : riskFlags.length <= 2 ? 'Medium' : 'High',
    metrics: [],
  };

  const sections = [growth, profitability, cashFlow, valuation, earnings, ownership, risk];

  // Etiketat e seksioneve (Growth: Positive, Profitability: Strong, ...)
  for (const s of sections) {
    if (s.key === 'risk') continue;
    s.label = sectionLabel(s.key, s.metrics);
  }

  // ── Etiketa e përgjithshme e kontekstit ──
  const { label, score } = contextLabel(sections, riskFlags.length);

  // Mbulimi: 13 treguesit bazë të spec-it
  const baseMetrics = [revenueGrowth, epsGrowth, grossMargin, operatingMargin, netMargin,
    freeCashFlow, debtToEquity, peRatio, psRatio, evToEbitda, earningsSurprise,
    estimateRevision, institutionalOwnership];
  const metricsAvailable = baseMetrics.filter(v => v !== undefined).length;

  return {
    symbol,
    context,
    contextLabel: label,
    contextScore: score,
    coverage: metricsAvailable / baseMetrics.length,
    sections,
    riskFlags,
    dataInfo: {
      provider: isLocal ? 'JSON lokal (snapshot)' : 'Yahoo Finance quoteSummary',
      providerDetail: fund.source,
      fetchedAt: updated,
      metricsAvailable,
      metricsTotal: baseMetrics.length,
    },
  };
}
