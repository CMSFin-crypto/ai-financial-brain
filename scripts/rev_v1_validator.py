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

AMENDIMI 1.1 (para-testimit, 2026-09-30 — asnjë rezultat i parë, arsyetim
vetëm teorik, pra i ligjshëm para regjistrimit final):
  1. EDGAR FAIL-CLOSED — event-gate 8-K te REV është kusht SIGURIE (te
     CTC është bonus PEAD): vetëm US-domestic filers; emrat pa timeline
     EDGAR të plotë (ADR me 6-K/20-F, ose pa filing të freskët)
     EKSKLUDOHEN krejtësisht, jo "event-neutral".
  2. SHTRESA MID-CAP — Nagel (2012): edge-i te mid-cap i vërtetë ($2-20B);
     zona 20-80p duhet ≥40% mid-cap (gate i re i përbërjes).
  3. DOBËSI SEKTORIALE — rënia duhet dukshëm negative edhe kundrejt
     sektorit të vet (jo vetëm SPY); pa ≥3 peers → fail-closed.

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

REV_HYPOTHESIS_VERSION = 1.1

REV_CHANGE_LOG = [
    (1, "2026-09-29",
     "REV v1 fillestare: reversal 1-javor me konfirmim 2-ditor kundër "
     "falling-knife, universe mesatar likuiditeti (20-80 percentile, jo "
     "top-kuintil si CTC), event-gate kundër lajmeve fondamentale reale, "
     "circuit-breaker kundër crash sistemik. E ndarë plotësisht nga CTC — "
     "s'e ndryshon, s'e prek funnel-in e saj."),
    (1.1, "2026-09-30",
     "AMENDIM PARA-TESTIMIT (asnjë rezultat i parë — arsyetim vetëm "
     "teorik, pra i ligjshëm para regjistrimit final): (1) EDGAR "
     "FAIL-CLOSED — vetëm US-domestic filers; emrat pa timeline EDGAR "
     "të plotë (p.sh. ADR me 6-K/20-F) EKSKLUDOHEN krejtësisht, jo "
     "'event-neutral' — event-gate te REV është kusht sigurie, jo "
     "cilësi e dhënash si te CTC; (2) SHTRESA MID-CAP dedikuese — "
     "Nagel (2012) e gjen edge-in te mid-cap i vërtetë ($2-20B), jo "
     "'jo-mega-cap brenda liste large-cap'; zona 20-80p duhet ≥40% "
     "mid-cap, përndryshe hipoteza testohet mbi zonën e gabuar "
     "(gate i re); (3) DOBËSI SEKTORIALE — rënia duhet dukshëm negative "
     "edhe kundrejt sektorit të vet (jo vetëm SPY), që sinjali të kapë "
     "dobësi specifike të kompanisë, jo shock të gjithë grupit."),
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

    # --- Universi — shtresa mid-cap dedikuese (amendimi 1.1; Nagel 2012) ---
    universe_source: str = "rev_dedicated"        # pool REV = baza + shtresa mid-cap, JO vetëm lista large-cap
    require_midcap_layer: bool = True
    midcap_mktcap_min: float = 2_000_000_000.0    # $2B
    midcap_mktcap_max: float = 20_000_000_000.0   # $20B
    rev_pool_midcap_min_share_pct: float = 40.0   # min % mid-cap brenda ZONËS 20-80p (zona reale e testit)

    # --- Sinjali i hyrjes ---
    min_3day_cum_return_pct: float = -8.0      # ose RSI(2) < rsi2_oversold
    rsi2_oversold: float = 10.0
    idiosyncratic_vs_spy_required: bool = True  # rënia duhet MË E MADHE se SPY
    sector_relative_required: bool = True       # DHE dukshëm negative kundrejt sektorit (amendimi 1.1)
    sector_relative_underperformance_pct: float = 0.0  # margjina e nënperformimit (0 = çdo nënperformim)
    min_sector_peers: int = 3                   # peers minimalë; nëse më pak → fail-closed
    block_if_real_8k_within_days: int = 2       # event-gate real (EDGAR)
    block_if_spy_daily_move_pct_below: float = -3.0  # circuit-breaker crash

    # --- EDGAR fail-closed (amendimi 1.1) — KUSHT SIGURIE, jo cilësi e dhënash ---
    us_domestic_filers_only: bool = True        # ADR / foreign private issuers (6-K, 20-F) JASHTË
    edgar_coverage_probe_days: int = 120        # dritarja e sondazhit të timeline-it EDGAR
    exclude_incomplete_edgar_coverage: bool = True  # pa timeline të plotë → EKSKLUZOHET nga REV krejtësisht

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
# 3b. EDGAR FAIL-CLOSED + SHTRESA MID-CAP + SEKTORI (amendimi 1.1)
# ============================================================================

# Formularët e foreign private issuers — këta s'depozitojnë 8-K, prandaj
# event-gate-i REV do të ishte i verbër për ta → EKSKLUZOHEN.
FOREIGN_FILER_FORMS = {"6-K", "6-K/A", "20-F", "20-F/A", "40-F", "40-F/A"}

# Formularët që tërhiqen për kontrollin e eligjibilitetit (domestic vs
# foreign + sondazhi i aktivitetit të timeline-it).
EDGAR_ELIGIBILITY_FORMS = [
    "8-K", "8-K/A", "10-K", "10-K/A", "10-Q", "10-Q/A",
    "6-K", "6-K/A", "20-F", "20-F/A", "40-F", "40-F/A",
]


def edgar_eligibility_check(filings, as_of_date, h=REV_HYPOTHESIS) -> dict:
    """
    filings: listë me {'filingDate': 'YYYY-MM-DD', 'form': '8-K'|'6-K'|...}
             ose None/[] — FAIL-CLOSED: pa të dhëna → JO-eligible.

    Kthen {'eligible': bool, 'reason': None|'FOREIGN_FILER'|'NO_EDGAR_TIMELINE', 'detail': str}.

    PSE fail-closed (kusht sigurie, jo cilësi e dhënash): te CTC event-gate
    është bonus (PEAD) — te REV ai BLLOKON hyrjen. Nëse mbulimi EDGAR
    mungon për një emër, gate-i do të dështonte në heshtje dhe REV mund
    të hynte pikërisht në rënie me arsye fondamentale reale — humbja e
    mbrojtjes kryesore kundër falling-knife.
    """
    if not h.exclude_incomplete_edgar_coverage and not h.us_domestic_filers_only:
        return {"eligible": True, "reason": None, "detail": "EDGAR gate jo aktiv"}

    # 1. Pa të dhëna fare → gate-i do të ishte i verbër
    if not filings:
        return {"eligible": False, "reason": "NO_EDGAR_TIMELINE",
                "detail": "Pa timeline EDGAR — event-gate 8-K do të dështonte në heshtje; ekskluzohet"}

    # 2. Detektim foreign private issuer / ADR
    if h.us_domestic_filers_only:
        foreign = [f for f in filings if str(f.get("form", "")).upper() in FOREIGN_FILER_FORMS]
        if foreign:
            return {"eligible": False, "reason": "FOREIGN_FILER",
                    "detail": f"Filing {foreign[0]['form']} (foreign private issuer / ADR) — 8-K s'ekziston; ekskluzohet"}

    # 3. Sondazhi i timeline-it: të paktën një filing brenda dritares
    if h.exclude_incomplete_edgar_coverage:
        try:
            t = pd.Timestamp(as_of_date)
        except Exception:
            return {"eligible": False, "reason": "NO_EDGAR_TIMELINE", "detail": "as_of_date i pavlefshëm"}
        has_recent = False
        for f in filings:
            try:
                ft = pd.Timestamp(f["filingDate"])
            except Exception:
                continue
            delta = (t - ft).total_seconds()
            if 0 <= delta <= h.edgar_coverage_probe_days * 86400:
                has_recent = True
                break
        if not has_recent:
            return {"eligible": False, "reason": "NO_EDGAR_TIMELINE",
                    "detail": f"Pa filing brenda {h.edgar_coverage_probe_days} ditëve deri {as_of_date}; ekskluzohet"}

    return {"eligible": True, "reason": None, "detail": "Domestic filer me timeline EDGAR aktive"}


# SHTRESA MID-CAP — kandidatë likuidë S&P 400 / Russell Midcap-stil ($2-20B),
# të shtuar posaçërisht për REV (pasqyrë e REV_MIDCAP_TIER në src/lib/rev/signal.ts).
REV_MIDCAP_TIER = [
    "NTNX", "GTLB", "DBX", "DOCN", "WIX", "TER", "ZBRA", "JBL", "FLEX", "ONTO", "IPGP", "CGNX",
    "KTOS", "FIX", "STRL", "ACM", "BLD", "SITE", "WMS",
    "EWBC", "CMA", "FHN", "SNV", "ONB", "GBCI", "WAL",
    "LNTH", "CORT", "INSP", "RGEN", "MEDP", "TXG", "EHC",
    "WING", "CAVA", "DKS", "SHAK", "BOOT", "BFAM", "TPX", "NWL", "CROX", "YETI",
    "MTDR", "VNOM", "CIVI",
    "MOS", "CF",
    "UDR", "MAA", "CPT", "INVH", "AMH",
    "ATO", "NJR", "SR", "POWL",
    "CARG", "TDS",
]


def rev_is_midcap(symbol: str, mktcap=None, h=REV_HYPOTHESIS) -> bool:
    """Nëse market cap është i disponueshëm → pragjet $2-20B; përndryshe anëtarësia në shtresë."""
    if mktcap is not None and np.isfinite(mktcap) and mktcap > 0:
        return h.midcap_mktcap_min <= mktcap <= h.midcap_mktcap_max
    return h.require_midcap_layer and symbol in REV_MIDCAP_TIER


def rev_universe_composition(zone_symbols, mktcaps=None, h=REV_HYPOTHESIS) -> dict:
    """
    Përbërja e ZONËS 20-80p (jo e gjithë pool-it!) — sa % e emrave që REV
    vërtet do të testonte janë mid-cap. Nëse zona është plot large-caps,
    hipoteza testohet mbi zonën e gabuar të spektrit të likuiditetit.

    zone_symbols: lista e simboleve në zonë
    mktcaps: dict opsional {symbol: market_cap}
    """
    mktcaps = mktcaps or {}
    total = len(zone_symbols)
    midcap = sum(1 for s in zone_symbols if rev_is_midcap(s, mktcaps.get(s), h))
    share = (midcap / total * 100) if total else 0.0
    ok = share >= h.rev_pool_midcap_min_share_pct
    return {
        "zone_total": total,
        "midcap_count": midcap,
        "midcap_share_pct": round(share, 1),
        "ok": ok,
        "note": (f"Zona përmban {share:.0f}% mid-cap — hipoteza testohet në zonën e duhur"
                 if ok else
                 f"Zona ka vetëm {share:.0f}% mid-cap (< {h.rev_pool_midcap_min_share_pct}%) — "
                 "zgjero shtresën mid-cap ose pranoje se teston zonën e gabuar"),
    }


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
    min_pool_midcap_share_pct: float = 40.0  # gate i amendimit 1.1 — përbërja e zonës REV


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
    pool_midcap_share_pct: float | None = None,
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

    # Gate 9 (amendimi 1.1): përbërja e zonës REV — shtresa mid-cap.
    # FAIL-CLOSED: nëse përbërja s'u raportua, s'mund të pretendojmë që
    # hipoteza u testua në zonën e duhur të spektrit të likuiditetit.
    midcap_reported = pool_midcap_share_pct is not None
    results.append(GateResult(
        "Shtresa mid-cap në zonën REV (amendimi 1.1)",
        midcap_reported and pool_midcap_share_pct >= gates.min_pool_midcap_share_pct,
        (f"{pool_midcap_share_pct:.1f}% e zonës 20-80p është mid-cap $2-20B "
         f"(kufiri ≥{gates.min_pool_midcap_share_pct}%)")
        if midcap_reported else
        "s'u raportua — fail-closed (përbërja e universit duhet matur)"
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
          f"percentile mbi pool-in dedikuar ({h.universe_source}: baza + shtresa mid-cap "
          f"${h.midcap_mktcap_min/1e9:.0f}-{h.midcap_mktcap_max/1e9:.0f}B), ${h.min_dollar_volume_floor/1e6:.0f}M min, "
          f"çmim ≥ ${h.min_price:.0f}")
    print(f"  Përbërja: zona 20-80p duhet ≥ {h.rev_pool_midcap_min_share_pct}% mid-cap "
          f"(gate i përbërjes, amendimi 1.1)")
    print(f"  Sinjali: ret3 ≤ {h.min_3day_cum_return_pct}% OSE RSI(2) < {h.rsi2_oversold}; "
          f"idiosinkratik vs SPY = {h.idiosyncratic_vs_spy_required}; "
          f"vs sektor = {h.sector_relative_required} (min {h.min_sector_peers} peers, fail-closed)")
    print(f"  Gates: 8-K real brenda {h.block_if_real_8k_within_days}d → blloko; "
          f"SPY < {h.block_if_spy_daily_move_pct_below}%/ditë → blloko; "
          f"EDGAR fail-closed (vetëm domestic, sondazh {h.edgar_coverage_probe_days}d) → ekskluzo")
    print(f"  Konfirmimi: green candle / higher low + volum në rënie; low i ri → invalide")
    print(f"  Exit: stop {h.stop_atr_multiple}×ATR14, target {h.target_r_multiple}R, "
          f"time-stop {h.time_stop_days}d, max {h.max_holding_days}d")
    print(f"  Risk: {h.risk_per_trade_pct:.2%}/tregti, max {h.max_open_positions} pozicione, "
          f"1/sektor, cooldown {h.symbol_cooldown_days}d")
    print(f"  Kosto: komision ${h.commission_per_share}/aksion min ${h.commission_min}, "
          f"slippage {h.slippage_bps}bp, spread est. {h.spread_bps_estimate}bp")


if __name__ == "__main__":
    run_rev_validation()
