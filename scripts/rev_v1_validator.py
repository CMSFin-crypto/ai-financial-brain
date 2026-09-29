"""
REV v1 Validator — "Confirmed Short-Term Reversal"
====================================================================
E VEÇANTË nga ctc_v2_validator.py — familje e re hipotezash (REV_*), jo
version i CTC. Shih REV_v1_strategy_spec.md për rregullat e plota.

Baza teorike: Lehmann (1990), Jegadeesh (1990) — reversal 1-javor te
aksionet individuale; Nagel (2012) — edge më i fortë te likuiditeti mesatar
(jo mega-cap, ku CTC operon).

E njëjta disiplinë si CTC: parametrat janë të ngrirë, s'ndryshohen duke
parë rezultatet. Nëse REV del REJECT, s'e "rregullon" duke i shtrënguar
pragjet derisa PASS — kjo do të ishte i njëjti gabim si me v1 e CTC.

Përdorim:
    python scripts/rev_v1_validator.py

Kjo skript është self-contained (s'importon asgjë nga CTC) dhe përfaqëson
kontratën e validimit: pas një backtest-i real IS/OOS/WF, ushqej metrikat
në evaluate_rev_gates() dhe printo verdiktin me print_rev_report().
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass

# ============================================================================
# 1. HIPOTEZA E NGRIRË — REV v1 (familje krejt e re, jo v3 e CTC)
# ============================================================================

REV_HYPOTHESIS_VERSION = 1

REV_CHANGE_LOG = [
    (1, "2026-09-29",
     "REV v1 fillestare: reversal 1-javor me konfirmim 2-ditor kundër "
     "falling-knife, universe mesatar likuiditeti (20-80 percentile, jo "
     "top-kuintil si CTC), event-gate kundër lajmeve fondamentale reale, "
     "circuit-breaker kundër crash sistemik. E ndarë plotësisht nga CTC — "
     "s'e ndryshon, s'e prek funnel-in e saj."),
]


@dataclass(frozen=True)
class REVHypothesis:
    name: str = "confirmed_short_term_reversal_v1"

    # --- Universi & likuiditeti (zona e mesme, JO top-kuintil si CTC) ---
    liquidity_percentile_low: float = 0.20
    liquidity_percentile_high: float = 0.80
    liquidity_lookback_days: int = 20
    min_price: float = 10.0
    min_dollar_volume_floor: float = 10_000_000.0

    # --- Sinjali i hyrjes ---
    min_3day_cum_return_pct: float = -8.0      # ose RSI(2) < rsi2_oversold
    rsi2_oversold: float = 10.0
    idiosyncratic_vs_spy_required: bool = True  # rënia duhet MË E MADHE se SPY
    block_if_real_8k_within_days: int = 2       # event-gate real (EDGAR)
    block_if_spy_daily_move_pct_below: float = -3.0  # circuit-breaker crash

    # --- Konfirmimi (MBROJTJA kryesore kundër falling knife) ---
    require_green_candle_or_higher_low: bool = True
    require_volume_declining_on_confirmation: bool = True
    invalidate_if_new_low_on_confirmation_day: bool = True

    # --- Exit — më i shkurtër/konservativ se CTC ---
    stop_atr_multiple: float = 1.3
    target_r_multiple: float = 1.2
    time_stop_days: int = 3
    max_holding_days: int = 5
    min_holding_days: int = 1

    # --- Risk / sizing — më konservativ se CTC ---
    risk_per_trade_pct: float = 0.005
    max_open_positions: int = 3
    max_positions_per_sector: int = 1
    symbol_cooldown_days: int = 5

    # --- Kostot ---
    commission_per_share: float = 0.005
    commission_min: float = 1.0
    slippage_bps: float = 5.0            # pak më i lartë se CTC (likuiditet më i ulët)
    spread_bps_estimate: float = 10.0


REV_HYPOTHESIS = REVHypothesis()


# ============================================================================
# 2. PROFILI I PRITUR — KËTU aplikohet 60-70% WR i GLM-it
# ============================================================================

EXPECTED_PROFILE_REVERSAL = {
    "win_rate_range": (0.60, 0.70),
    "profit_factor_range": (1.1, 1.5),
    "profit_factor_suspicious_above": 2.0,
    "annual_cost_drag_pct_range": (3.0, 6.0),
    "avg_r_per_trade_range": (0.03, 0.12),   # më i vogël se CTC — shumë fitore të vogla
}

# Kujtesë: mos e krahaso REV kundër profilit CTC (35-45% WR) — janë familje
# strategjish të ndryshme me nënshkrime statistikore krejt të ndryshme.


# ============================================================================
# 3. GATE SHTESË SPECIFIK: FALLING-KNIFE CHECK
# ============================================================================

def falling_knife_rate(trades: list[dict]) -> float:
    """
    trades: listë me {'made_new_low_after_entry': bool, ...} nga backtest-i
    real. Mat sa % e tregtive vazhduan të bëjnë low të ri PAS hyrjes,
    përpara se të arrinin target — pra konfirmimi dështoi ta parandalonte
    "falling knife"-in.

    NËSE >40%: filtri i konfirmimit (Seksioni 3 i spec) nuk po funksionon
    mjaftueshëm — kjo është GJETJE SPECIFIKE, jo arsye për të ulur target-in
    apo për të shtrënguar stop-in; kërkon rishikim të vetë logjikës së
    konfirmimit (ndoshta nevojitet konfirmim 2-ditor në vend të 1-ditor).
    """
    if not trades:
        return 0.0
    knife_count = sum(1 for t in trades if t.get("made_new_low_after_entry"))
    return knife_count / len(trades)


FALLING_KNIFE_MAX_ACCEPTABLE = 0.40


# ============================================================================
# 4. GATES — strukturë njësoj si CTC, profil pritjesh ndryshe
# ============================================================================

@dataclass(frozen=True)
class REVValidationGates:
    min_is_trades: int = 30
    min_is_profit_factor: float = 1.3
    min_oos_profit_factor: float = 1.15
    min_oos_trades: int = 30
    min_wf_windows_positive_pct: float = 0.70
    min_trades_per_wf_window: int = 8
    max_drawdown_pct: float = 20.0
    max_top3_symbol_profit_share_pct: float = 60.0
    max_is_oos_winrate_deviation_pp: float = 10.0
    min_pf_at_10bp_extra_cost: float = 1.05
    max_falling_knife_rate: float = FALLING_KNIFE_MAX_ACCEPTABLE


REV_GATES = REVValidationGates()


@dataclass
class GateResult:
    gate_name: str
    passed: bool
    detail: str


def evaluate_rev_gates(
    is_metrics: dict, oos_metrics: dict, wf_results: list[dict],
    symbol_profit_concentration_pct: float,
    cost_sensitivity_results: dict[float, float],
    knife_rate: float,
    gates: REVValidationGates = REV_GATES,
) -> tuple[bool, list[GateResult]]:

    results = [
        GateResult("IS trades & PF",
                    is_metrics["trades"] >= gates.min_is_trades
                    and is_metrics["profit_factor"] >= gates.min_is_profit_factor,
                    f"trades={is_metrics['trades']}, PF={is_metrics['profit_factor']:.2f}"),

        GateResult("OOS PF & trades",
                    oos_metrics["trades"] >= gates.min_oos_trades
                    and oos_metrics["profit_factor"] >= gates.min_oos_profit_factor,
                    f"trades={oos_metrics['trades']}, PF={oos_metrics['profit_factor']:.2f}"),
    ]

    valid_windows = [w for w in wf_results if w["trades"] >= gates.min_trades_per_wf_window]
    wf_positive = sum(1 for w in valid_windows if w["net_profit"] > 0)
    wf_pct = wf_positive / len(valid_windows) if valid_windows else 0.0
    results.append(GateResult(
        "Walk-forward consistency", wf_pct >= gates.min_wf_windows_positive_pct,
        f"{wf_positive}/{len(valid_windows)} dritare pozitive ({wf_pct:.0%})"
    ))

    results.append(GateResult(
        "Max drawdown", oos_metrics["max_drawdown_pct"] <= gates.max_drawdown_pct,
        f"{oos_metrics['max_drawdown_pct']:.1f}%"
    ))

    results.append(GateResult(
        "Profit concentration",
        symbol_profit_concentration_pct <= gates.max_top3_symbol_profit_share_pct,
        f"top-3 = {symbol_profit_concentration_pct:.1f}%"
    ))

    wr_dev = abs(is_metrics["win_rate"] - oos_metrics["win_rate"])
    results.append(GateResult(
        "IS→OOS win-rate stability", wr_dev <= gates.max_is_oos_winrate_deviation_pp,
        f"devijim {wr_dev:.1f}pp"
    ))

    pf_at_10bp = cost_sensitivity_results.get(10.0, 0.0)
    results.append(GateResult(
        "Cost sensitivity (+10bp)", pf_at_10bp >= gates.min_pf_at_10bp_extra_cost,
        f"PF={pf_at_10bp:.2f} me +10bp/krah"
    ))

    results.append(GateResult(
        "Falling-knife rate (specifik REV)",
        knife_rate <= gates.max_falling_knife_rate,
        f"{knife_rate:.0%} e tregtive bënë low të ri pas hyrjes "
        f"(kufiri: {gates.max_falling_knife_rate:.0%})"
    ))

    all_passed = all(r.passed for r in results)
    return all_passed, results


def print_rev_report(all_passed: bool, gate_results: list[GateResult]):
    print("=" * 70)
    print(f"REV v1 — VERDIKTI: {'PASS' if all_passed else 'REJECT'}")
    print("=" * 70)
    for r in gate_results:
        print(f"  [{'PASS' if r.passed else 'FAIL'}] {r.gate_name}: {r.detail}")
    print()
    print("Kujtesë: krahaso win-rate/PF kundrejt EXPECTED_PROFILE_REVERSAL")
    print("(60-70% WR), JO kundrejt profilit të CTC (35-45% WR) — janë")
    print("familje strategjish të ndryshme me nënshkrime statistikore ndryshe.")
    if not all_passed:
        print("\nREJECT → mos vendos kapital real. Nëse >40% falling-knife,")
        print("problemi specifik është konfirmimi (Sec. 3 spec), jo target/stop.")


# ============================================================================
# 5. SKELETI I EKZEKUTIMIT
# ============================================================================

def run_rev_validation():
    print(f"Validim: {REV_HYPOTHESIS.name} (v{REV_HYPOTHESIS_VERSION})")
    print("E veçantë nga CTC — mos e përziej load_universe()/backtest me atë të CTC.")
    print()
    print("Rendi: 1) ndërto dritaret WF dendëse  2) ekzekuto backtest IS/OOS/WF")
    print("me sinjalin REV (Sec. 2-3 spec)  3) llogarit falling_knife_rate()")
    print("4) cost_sensitivity_test()  5) evaluate_rev_gates()  6) print_rev_report()")
    print()
    print("Parametrat e ngrirë (REV_HYPOTHESIS):")
    h = REV_HYPOTHESIS
    print(f"  Likuiditeti: {h.liquidity_percentile_low:.0%}-{h.liquidity_percentile_high:.0%} "
          f"percentile, ${h.min_dollar_volume_floor/1e6:.0f}M min, çmim ≥ ${h.min_price:.0f}")
    print(f"  Sinjali: ret3 ≤ {h.min_3day_cum_return_pct}% OSE RSI(2) < {h.rsi2_oversold}; "
          f"idiosinkratik vs SPY = {h.idiosyncratic_vs_spy_required}")
    print(f"  Gates: 8-K real brenda {h.block_if_real_8k_within_days}d → blloko; "
          f"SPY < {h.block_if_spy_daily_move_pct_below}%/ditë → blloko")
    print(f"  Konfirmimi: green candle / higher low + volum në rënie; low i ri → invalide")
    print(f"  Exit: stop {h.stop_atr_multiple}×ATR14, target {h.target_r_multiple}R, "
          f"time-stop {h.time_stop_days}d, max {h.max_holding_days}d")
    print(f"  Risk: {h.risk_per_trade_pct:.2%}/tregti, max {h.max_open_positions} pozicione, "
          f"1/sektor, cooldown {h.symbol_cooldown_days}d")
    print(f"  Kosto: komision ${h.commission_per_share}/aksion min ${h.commission_min}, "
          f"slippage {h.slippage_bps}bp, spread est. {h.spread_bps_estimate}bp")


if __name__ == "__main__":
    run_rev_validation()
