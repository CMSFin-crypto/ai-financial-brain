// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / cost-model.ts
// Model realist kostot e transaksionit — pa këtë, backtest-i
// fryhet: çdo fitim bruto zbritet me komisione + spread + slippage.
//
//   Fitimi bruto:  100 USD
//   Komisione:      -5 USD   (IBKR Fixed: $0.005/aksion, min $1, max 1%)
//   Spread:         -8 USD   (bid/ask i paguar në hyrje + dalje)
//   Slippage:       -7 USD   (rrëshqitja e ekzekutimit + gap)
//   ────────────────────────
//   Fitimi neto:    80 USD
// ═══════════════════════════════════════════════════════════════

export interface CostAssumptions {
  /** Komision për aksion — IBKR Fixed tiered-lite US equities */
  commissionPerShare: number;
  /** Komision minimal për urdhër */
  minCommission: number;
  /** Komisioni max si % e vlerës së urdhrit (rregull IBKR) */
  maxCommissionPct: number;
  /** Slippage bazë në % (urdhra limit mbi emra likuidë) */
  baseSlippagePct: number;
  /** Faktor shtesë slippage për ATR 1% (volatiliteti → rrëshqitje) */
  slippagePerAtrPct: number;
  /** Market impact kur positionValue/ADV rritet */
  impactFactor: number;
}

export const DEFAULT_COSTS: CostAssumptions = {
  commissionPerShare: 0.005,
  minCommission: 1.0,
  maxCommissionPct: 0.01,   // IBKR cap: 1% e trade value
  baseSlippagePct: 0.04,    // 4 bps bazë
  slippagePerAtrPct: 0.012, // +1.2 bps për çdo 1% ATR
  impactFactor: 0.10,       // impact% = 10% × (orderValue / ADV)
};

export interface TradeCostBreakdown {
  commissionEntry: number;
  commissionExit: number;
  spreadCost: number;
  slippageCost: number;
  marketImpact: number;
  totalCost: number;
  /** Kosto si % e vlerës së pozicionit */
  totalCostPct: number;
}

/**
 * Llogarit kostot e një tregtie të plotë (hyrje + dalje).
 * spreadPct vjen nga estimimi i scanner-it: min(0.5, 1.5/sqrt(ADV_M$)).
 */
export function computeTradeCosts(params: {
  shares: number;
  entryPrice: number;
  exitPrice: number;
  /** spread i estimuar në % (0.15 = 15 bps) */
  spreadPct: number;
  /** ATR% e aksionit në momentin e hyrjes */
  atrPct: number;
  /** 20d dollar-volume mesatar */
  avgDolVol: number;
  costs?: Partial<CostAssumptions>;
}): TradeCostBreakdown {
  const c = { ...DEFAULT_COSTS, ...params.costs };
  const positionValue = params.shares * params.entryPrice;
  const exitValue = params.shares * Math.max(params.exitPrice, 0.01);

  // ── Komisione (IBKR Fixed: në hyrje dhe në dalje veç e veç) ──
  const rawComm = params.shares * c.commissionPerShare;
  const cappedComm = Math.min(rawComm, positionValue * c.maxCommissionPct);
  const commissionEntry = Math.max(cappedComm, Math.min(c.minCommission, positionValue * c.maxCommissionPct));
  const commissionExit = Math.max(cappedComm, Math.min(c.minCommission, exitValue * c.maxCommissionPct));

  // ── Bid/Ask spread — paguhet në round trip (gjysma në çdo anë) ──
  const spreadCost = positionValue * (params.spreadPct / 100);

  // ── Slippage — bazë + kontribut i volatilitetit (ATR%) ──
  const slippagePct = c.baseSlippagePct + c.slippagePerAtrPct * params.atrPct;
  const slippageCost = positionValue * (slippagePct / 100);

  // ── Market impact — urdhri jonë nëse është i madh krahasuar me ADV ──
  const participation = params.avgDolVol > 0 ? positionValue / params.avgDolVol : 0;
  const impactPct = c.impactFactor * participation * 100;
  const marketImpact = positionValue * (impactPct / 100);

  const totalCost = commissionEntry + commissionExit + spreadCost + slippageCost + marketImpact;

  return {
    commissionEntry,
    commissionExit,
    spreadCost,
    slippageCost,
    marketImpact,
    totalCost,
    totalCostPct: positionValue > 0 ? (totalCost / positionValue) * 100 : 0,
  };
}
