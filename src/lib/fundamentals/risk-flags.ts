// ============================================================
// TASK 26 — RISK FLAGS FUNDAMENTALE
// ============================================================
// Paralajmërime të dukshme për kandidatët e skanerit IBKR.
//
// ⚠️ FAZA 1 (rregull i userit): risk flag NUK e bllokon tregtinë —
// vetëm e SHËNON kandidatin. Bllokimi dhe pesha vijnë vetëm pas
// testit rigoroz Technical-only vs Technical + Fundamental.
// ============================================================

import type { FundamentalContext } from './normalize';

export interface RiskFlag {
  code: string;                 // REVENUE_DECLINING, ...
  label: string;                // shqip — "Revenue në rënie"
  detail: string;              // vlera konkrete + rregulli
  severity: 'high' | 'medium';
}

/** Të dhëna shtesë nga konteksti i skanimit (jo nga Yahoo). */
export interface RiskFlagExtras {
  /** Data e earnings-it të ardhshëm (YYYY-MM-DD) — për flamurin "Earnings të afërta". */
  nextEarningsDate?: string;
  /** Ndryshimi i çmimit 60-ditor (%) — për flamurin e divergjencës çmim↔fundamente. */
  price60dChangePct?: number;
  /** Rritja V/V e aksioneve në qarkullim (%) — për flamurin e dilution-it. */
  sharesYoYGrowthPct?: number;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function buildRiskFlags(ctx: FundamentalContext, extras: RiskFlagExtras = {}): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const fp = (v: number, d = 1) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;

  // 1. Revenue në rënie
  if (ctx.revenueGrowth !== undefined && ctx.revenueGrowth < 0) {
    flags.push({
      code: 'REVENUE_DECLINING',
      label: 'Revenue në rënie',
      detail: `Revenue growth ${fp(ctx.revenueGrowth)} YoY — kompania po shet më pak se një vit më parë. Trendi teknik mund të jetë rebound i vdekur. (Rregulli: rritje < 0%.)`,
      severity: ctx.revenueGrowth < -10 ? 'high' : 'medium',
    });
  }

  // 2. EPS në rënie
  if (ctx.epsGrowth !== undefined && ctx.epsGrowth < 0) {
    flags.push({
      code: 'EPS_DECLINING',
      label: 'EPS në rënie',
      detail: `EPS growth ${fp(ctx.epsGrowth)} YoY — fitimet po bien. Me P/E në rritje kjo është kombinim i rrezikshëm (presion i dyfishtë). (Rregulli: rritje < 0%.)`,
      severity: ctx.epsGrowth < -15 ? 'high' : 'medium',
    });
  }

  // 3. Free cash flow negativ
  if (ctx.freeCashFlow !== undefined && ctx.freeCashFlow < 0) {
    flags.push({
      code: 'NEGATIVE_FCF',
      label: 'Free cash flow negativ',
      detail: `FCF TTM: $${(ctx.freeCashFlow / 1e9).toFixed(1)}B — operacioni konsumon para. Rritja duhet të financohet me borxh ose shpërbajtje. (Rregulli: FCF < 0.)`,
      severity: 'high',
    });
  }

  // 4. Debt/equity shumë i lartë
  if (ctx.debtToEquity !== undefined && ctx.debtToEquity > 150) {
    flags.push({
      code: 'HIGH_DEBT',
      label: 'Debt/Equity shumë i lartë',
      detail: `D/E ${ctx.debtToEquity.toFixed(0)}% — levieri financiar i rëndë: rritja e interesave ose një çekuillibër tregu e godet rëndë. (Rregulli: > 150% medium · > 250% high.)`,
      severity: ctx.debtToEquity > 250 ? 'high' : 'medium',
    });
  }

  // 5. Valuation ekstrem
  const extremeValuation: string[] = [];
  if (ctx.peRatio !== undefined && ctx.peRatio > 50) extremeValuation.push(`P/E ${ctx.peRatio.toFixed(0)}x`);
  if (ctx.psRatio !== undefined && ctx.psRatio > 12) extremeValuation.push(`P/S ${ctx.psRatio.toFixed(1)}x`);
  if (ctx.evToEbitda !== undefined && ctx.evToEbitda > 35) extremeValuation.push(`EV/EBITDA ${ctx.evToEbitda.toFixed(0)}x`);
  if (extremeValuation.length > 0) {
    flags.push({
      code: 'EXTREME_VALUATION',
      label: 'Valuation ekstrem',
      detail: `${extremeValuation.join(' · ')} — çmimi e ka paraprirë rritjen: çdo vonesë në fitime paguhet me drawdown. (Rregulli: P/E > 50 ose P/S > 12 ose EV/EBITDA > 35.)`,
      severity: (ctx.peRatio !== undefined && ctx.peRatio > 80) || extremeValuation.length >= 2 ? 'high' : 'medium',
    });
  }

  // 6. Earnings miss i fundit
  if (ctx.earningsSurprise !== undefined && ctx.earningsSurprise < -5) {
    flags.push({
      code: 'EARNINGS_MISS',
      label: 'Earnings miss i fundit',
      detail: `Surprise ${ctx.earningsSurprise.toFixed(1)}% nën konsensusin e tremujorit të fundit — kompania nuk i mban premtimet; kujdes për revisione në ulje. (Rregulli: < −5%.)`,
      severity: ctx.earningsSurprise < -15 ? 'high' : 'medium',
    });
  }

  // 7. Estimates në rënie (estimate-i i vitit aktual ra brenda 30 ditësh)
  if (ctx.estimateRevision !== undefined && ctx.estimateRevision < -1) {
    flags.push({
      code: 'ESTIMATES_FALLING',
      label: 'Estimates në rënie',
      detail: `Estimi EPS i vitit aktual ra ${Math.abs(ctx.estimateRevision).toFixed(2)}% brenda 30 ditëve — analistët po e presin fitimin poshtë dhe PEAD-i punon kundër. (Rregulli: < −1%.)`,
      severity: ctx.estimateRevision < -5 ? 'high' : 'medium',
    });
  }

  // 8. Dilution
  if (extras.sharesYoYGrowthPct !== undefined && extras.sharesYoYGrowthPct >= 5) {
    flags.push({
      code: 'DILUTION',
      label: 'Dilution — shpërbajtje aksionesh',
      detail: `Aksionet në qarkullim u rritën ${extras.sharesYoYGrowthPct.toFixed(1)}% V/V — pjesa jote e fitimit po zbehet. (Rregulli: ≥ 5% në vit.)`,
      severity: extras.sharesYoYGrowthPct >= 10 ? 'high' : 'medium',
    });
  }

  // 9. Earnings të afërta
  if (extras.nextEarningsDate) {
    const dte = daysBetween(new Date(extras.nextEarningsDate + 'T00:00:00Z'), new Date());
    if (dte >= -1 && dte <= 2) {
      flags.push({
        code: 'EARNINGS_NEAR',
        label: 'Earnings brenda 2 ditëve',
        detail: `Raporti i ardhshëm më ${extras.nextEarningsDate} (${dte >= 0 ? `${dte} ditë` : 'sot/dje'}) — gap risk 8-15% në mëngjesin pas raportit. (Rregulli: ≤ 2 ditë high · ≤ 5 ditë medium.)`,
        severity: 'high',
      });
    } else if (dte > 2 && dte <= 5) {
      flags.push({
        code: 'EARNINGS_NEAR',
        label: 'Earnings brenda 5 ditëve',
        detail: `Raporti i ardhshëm më ${extras.nextEarningsDate} (${dte} ditë) — hyrja do mbajë gap risk; Catalyst Gate e kufizon pozicionin. (Rregulli: ≤ 5 ditë.)`,
        severity: 'medium',
      });
    }
  }

  // 10. Mospërputhje mes çmimit dhe fundamentaleve
  const fundamentalsWeak = (ctx.revenueGrowth !== undefined && ctx.revenueGrowth < 0)
    || (ctx.epsGrowth !== undefined && ctx.epsGrowth < 0);
  const fundamentalsStrong = (ctx.revenueGrowth !== undefined && ctx.revenueGrowth > 0.15)
    && (ctx.epsGrowth !== undefined && ctx.epsGrowth > 0.15);
  if (extras.price60dChangePct !== undefined) {
    const p60 = extras.price60dChangePct;
    if (p60 > 15 && fundamentalsWeak) {
      flags.push({
        code: 'PRICE_FUNDAMENTALS_DIVERGENCE',
        label: 'Çmimi i ngritur, fundamentet të dobëta',
        detail: `Çmimi +${p60.toFixed(0)}% në 60 ditë ndërsa revenue/EPS bie — rally pa mbështetje: lëvizja e fundit e tregut, jo e fitimit. (Rregulli: > +15% çmim & rritje < 0%.)`,
        severity: 'high',
      });
    } else if (p60 < -20 && fundamentalsStrong) {
      flags.push({
        code: 'PRICE_FUNDAMENTALS_DIVERGENCE',
        label: 'Çmimi bie me fundamentet të forta',
        detail: `Çmimi ${p60.toFixed(0)}% në 60 ditë ndërsa rritja revenue+EPS > 15% — ose pikë hyrjeje me pretendim value, ose tregu di diçka që numrat ende s'e tregojnë. Verifiko arsyen e rënies. (Rregulli: < −20% & rritje > 15%.)`,
        severity: 'medium',
      });
    }
  }

  return flags;
}
