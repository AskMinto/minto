"""Pure-Python capital gains tax computation engine.

Deterministic, no LLM, no I/O.  Called by tools.py after all documents are parsed.
Implements the full netting logic from US-19:
  - Section 70/71: current-year set-off (higher-taxed gains first)
  - Section 72: carry-forward set-off (non-exempt gains first)
  - Section 112A: Rs 1.25L LTCG exemption (equity only)
  - Section 87A: rebate re-check for new-regime users claiming 0% slab

All monetary amounts are in INR.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional


# ── Constants ─────────────────────────────────────────────────────────────────

LTCG_EXEMPTION = 125_000.0   # Rs 1.25L under Section 112A
EQUITY_STCG_RATE = 0.20      # Section 111A
EQUITY_LTCG_RATE = 0.125     # Section 112A (above exemption)
NON_EQUITY_LTCG_RATE = 0.125 # Section 112 (pre-Apr 2023 debt LTCG)
TAX_YEAR_END = date(2026, 3, 31)


def _today() -> date:
    return datetime.now().date()


def days_to_deadline() -> int:
    """Calendar days remaining until March 31, 2026 (IST)."""
    delta = TAX_YEAR_END - _today()
    return max(0, delta.days)


# ── Classification helpers ────────────────────────────────────────────────────

def _is_equity_oriented(fund_category: str) -> bool:
    """Return True if fund category implies >65% domestic equity."""
    equity_cats = {
        "equity_large_cap", "equity_mid_cap", "equity_small_cap",
        "equity_flexi_cap", "equity_multi_cap", "elss", "index",
        "etf_equity", "aggressive_hybrid",
    }
    return fund_category.lower() in equity_cats


# ── Core computation ──────────────────────────────────────────────────────────

def compute_tax_analysis(session_state: dict) -> dict:
    """Full FY 2025-26 capital gains netting.

    Reads CAS, broker P&L, holdings, and CF data from session_state.
    Returns a rich dict with every intermediate step so the agent can
    present a clear narrative (Step 1 → 2 → 3 → final liability).

    Returns dict with keys:
        realised: dict of raw gain/loss buckets before any set-off
        step1_stcl: dict showing STCL allocation vs STCG
        step1_ltcl: dict showing LTCL allocation vs LTCG
        step2_cf_ltcl: dict showing CF LTCL allocation
        step2_cf_stcl: dict showing CF STCL allocation
        step3_exemption: dict showing exemption application
        step4_87a: dict showing 87A re-check result
        tax: dict of final tax per category
        total_tax: float
        exemption_used: float
        exemption_remaining: float
        slab_rate: float
        tax_regime: str
        cf_ltcl_remaining: float (unused CF LTCL carried to next year)
        cf_stcl_remaining: float (unused CF STCL carried to next year)
        optimal_vs_naive_saving: float (tax saved by non-exempt-first allocation)
    """
    slab_rate: float = float(session_state.get("slab_rate") or 0.30)
    tax_regime: str = session_state.get("tax_regime") or "new"
    base_income: float = float(session_state.get("base_income") or 0)
    claimed_87a = (session_state.get("slab_rate") == 0.0 or slab_rate == 0.0)

    # ── 1. Gather realised gains from all parsed documents ──────────────────
    eq_stcg = 0.0
    eq_stcl = 0.0
    eq_ltcg = 0.0
    eq_ltcl = 0.0
    noneq_stcg = 0.0  # slab-rate gains
    noneq_ltcg = 0.0  # 12.5% gains (pre-Apr 2023 only)
    noneq_stcl = 0.0
    noneq_ltcl = 0.0

    cas = session_state.get("cas_parsed") or {}
    if cas:
        eq_ltcg += float(cas.get("total_realised_ltcg_fy") or 0)
        eq_stcg += float(cas.get("total_realised_stcg_fy") or 0)
        eq_ltcl += float(cas.get("total_realised_ltcl_fy") or 0)
        eq_stcl += float(cas.get("total_realised_stcl_fy") or 0)
        # Non-equity from CAS
        for folio in (cas.get("folios") or []):
            if not folio.get("is_equity_oriented", True):
                eq_ltcg -= float(folio.get("realised_ltcg_this_fy") or 0)
                eq_stcg -= float(folio.get("realised_stcg_this_fy") or 0)
                eq_ltcl -= float(folio.get("realised_ltcl_this_fy") or 0)
                eq_stcl -= float(folio.get("realised_stcl_this_fy") or 0)
                noneq_ltcg += float(folio.get("realised_ltcg_this_fy") or 0)
                noneq_stcg += float(folio.get("realised_stcg_this_fy") or 0)
                noneq_ltcl += float(folio.get("realised_ltcl_this_fy") or 0)
                noneq_stcl += float(folio.get("realised_stcl_this_fy") or 0)

    broker_pl = session_state.get("broker_pl_parsed") or {}
    if broker_pl:
        eq_ltcg += float(broker_pl.get("total_ltcg") or 0)
        eq_stcg += float(broker_pl.get("total_stcg") or 0)
        eq_ltcl += float(broker_pl.get("total_ltcl") or 0)
        eq_stcl += float(broker_pl.get("total_stcl") or 0)

    # Clamp to non-negative
    eq_stcg = max(0.0, eq_stcg)
    eq_stcl = max(0.0, eq_stcl)
    eq_ltcg = max(0.0, eq_ltcg)
    eq_ltcl = max(0.0, eq_ltcl)
    noneq_stcg = max(0.0, noneq_stcg)
    noneq_stcl = max(0.0, noneq_stcl)
    noneq_ltcg = max(0.0, noneq_ltcg)
    noneq_ltcl = max(0.0, noneq_ltcl)

    realised = {
        "equity_stcg": eq_stcg,
        "equity_stcl": eq_stcl,
        "equity_ltcg": eq_ltcg,
        "equity_ltcl": eq_ltcl,
        "non_equity_stcg": noneq_stcg,
        "non_equity_stcl": noneq_stcl,
        "non_equity_ltcg": noneq_ltcg,
        "non_equity_ltcl": noneq_ltcl,
    }

    # CF from ITR (or manual)
    itr = session_state.get("itr_parsed") or {}
    cf_ltcl = float(itr.get("total_ltcl_cf") or 0)
    cf_stcl = float(itr.get("total_stcl_cf") or 0)
    # Also check manual entries
    cf_ltcl = max(cf_ltcl, float(session_state.get("manual_cf_ltcl") or 0))
    cf_stcl = max(cf_stcl, float(session_state.get("manual_cf_stcl") or 0))

    # ── Step 1A: Current-year STCL set-off (Sec 70) ────────────────────────
    # Target higher-taxed STCG first: non-equity (slab rate) before equity (20%)
    remaining_stcl = eq_stcl + noneq_stcl
    step1_stcl: dict = {
        "total_stcl": remaining_stcl,
        "noneq_stcg_before": noneq_stcg,
        "eq_stcg_before": eq_stcg,
        "stcl_vs_noneq_stcg": 0.0,
        "stcl_vs_eq_stcg": 0.0,
        "stcl_spill_to_noneq_ltcg": 0.0,
        "stcl_spill_to_eq_ltcg": 0.0,
    }

    # Apply STCL vs non-equity STCG first
    applied = min(remaining_stcl, noneq_stcg)
    noneq_stcg -= applied
    remaining_stcl -= applied
    step1_stcl["stcl_vs_noneq_stcg"] = applied

    # Apply remaining STCL vs equity STCG
    applied = min(remaining_stcl, eq_stcg)
    eq_stcg -= applied
    remaining_stcl -= applied
    step1_stcl["stcl_vs_eq_stcg"] = applied

    # Any remaining STCL spills to LTCG (non-equity first)
    if remaining_stcl > 0:
        applied = min(remaining_stcl, noneq_ltcg)
        noneq_ltcg -= applied
        remaining_stcl -= applied
        step1_stcl["stcl_spill_to_noneq_ltcg"] = applied

    if remaining_stcl > 0:
        applied = min(remaining_stcl, eq_ltcg)
        eq_ltcg -= applied
        remaining_stcl -= applied
        step1_stcl["stcl_spill_to_eq_ltcg"] = applied

    step1_stcl["stcl_unused"] = remaining_stcl  # any leftover STCL (rare)

    # ── Step 1B: Current-year LTCL set-off (Sec 70) ────────────────────────
    # LTCL only vs LTCG; target non-equity LTCG first
    remaining_ltcl = eq_ltcl + noneq_ltcl
    step1_ltcl: dict = {
        "total_ltcl": remaining_ltcl,
        "ltcl_vs_noneq_ltcg": 0.0,
        "ltcl_vs_eq_ltcg": 0.0,
    }

    applied = min(remaining_ltcl, noneq_ltcg)
    noneq_ltcg -= applied
    remaining_ltcl -= applied
    step1_ltcl["ltcl_vs_noneq_ltcg"] = applied

    applied = min(remaining_ltcl, eq_ltcg)
    eq_ltcg -= applied
    remaining_ltcl -= applied
    step1_ltcl["ltcl_vs_eq_ltcg"] = applied
    step1_ltcl["ltcl_unused"] = remaining_ltcl

    # ── Step 2: Carry-forward set-off (Sec 72) ─────────────────────────────
    # CF LTCL first (can only offset LTCG), targeting non-equity LTCG first
    step2_cf_ltcl: dict = {
        "cf_ltcl_available": cf_ltcl,
        "cf_ltcl_vs_noneq_ltcg": 0.0,
        "cf_ltcl_vs_eq_ltcg": 0.0,
    }

    # Compute naive alternative for showing optimisation benefit
    naive_eq_ltcg_after_cf = eq_ltcg
    naive_noneq_ltcg_after_cf = noneq_ltcg
    # Naive: apply CF LTCL to equity LTCG first
    naive_cf_vs_eq = min(cf_ltcl, naive_eq_ltcg_after_cf)
    naive_eq_ltcg_after_cf -= naive_cf_vs_eq
    naive_cf_remaining = cf_ltcl - naive_cf_vs_eq
    naive_cf_vs_noneq = min(naive_cf_remaining, naive_noneq_ltcg_after_cf)
    naive_noneq_ltcg_after_cf -= naive_cf_vs_noneq

    # Optimal: apply CF LTCL to non-equity LTCG first
    applied = min(cf_ltcl, noneq_ltcg)
    noneq_ltcg -= applied
    cf_ltcl -= applied
    step2_cf_ltcl["cf_ltcl_vs_noneq_ltcg"] = applied

    applied = min(cf_ltcl, eq_ltcg)
    eq_ltcg -= applied
    cf_ltcl -= applied
    step2_cf_ltcl["cf_ltcl_vs_eq_ltcg"] = applied
    step2_cf_ltcl["cf_ltcl_remaining_unused"] = cf_ltcl

    # CF STCL: vs remaining STCG first (higher-taxed), then vs remaining LTCG
    step2_cf_stcl: dict = {
        "cf_stcl_available": cf_stcl,
        "cf_stcl_vs_noneq_stcg": 0.0,
        "cf_stcl_vs_eq_stcg": 0.0,
        "cf_stcl_vs_noneq_ltcg": 0.0,
        "cf_stcl_vs_eq_ltcg": 0.0,
    }

    applied = min(cf_stcl, noneq_stcg)
    noneq_stcg -= applied
    cf_stcl -= applied
    step2_cf_stcl["cf_stcl_vs_noneq_stcg"] = applied

    applied = min(cf_stcl, eq_stcg)
    eq_stcg -= applied
    cf_stcl -= applied
    step2_cf_stcl["cf_stcl_vs_eq_stcg"] = applied

    applied = min(cf_stcl, noneq_ltcg)
    noneq_ltcg -= applied
    cf_stcl -= applied
    step2_cf_stcl["cf_stcl_vs_noneq_ltcg"] = applied

    applied = min(cf_stcl, eq_ltcg)
    eq_ltcg -= applied
    cf_stcl -= applied
    step2_cf_stcl["cf_stcl_vs_eq_ltcg"] = applied
    step2_cf_stcl["cf_stcl_remaining_unused"] = cf_stcl

    # ── Step 3: Rs 1.25L exemption on net equity LTCG (Sec 112A) ───────────
    exemption_used = min(LTCG_EXEMPTION, eq_ltcg)
    taxable_eq_ltcg = max(0.0, eq_ltcg - exemption_used)
    exemption_remaining = LTCG_EXEMPTION - exemption_used
    step3_exemption = {
        "net_eq_ltcg_before_exemption": eq_ltcg,
        "exemption_applied": exemption_used,
        "taxable_eq_ltcg": taxable_eq_ltcg,
        "exemption_remaining": exemption_remaining,
    }

    # ── Step 4: 87A rebate re-check (new regime only) ───────────────────────
    actual_slab_rate = slab_rate
    rebate_forfeited = False
    if claimed_87a and tax_regime in ("new", "not_sure"):
        total_income_for_87a = (
            base_income
            + taxable_eq_ltcg   # taxed at 12.5%
            + eq_stcg            # taxed at 20%
            + noneq_stcg         # slab rate
            + noneq_ltcg         # taxed at 12.5%
        )
        if total_income_for_87a > 1_200_000:
            rebate_forfeited = True
            # Determine actual marginal slab rate from total income
            if total_income_for_87a <= 1_600_000:
                actual_slab_rate = 0.15
            elif total_income_for_87a <= 2_000_000:
                actual_slab_rate = 0.20
            elif total_income_for_87a <= 2_400_000:
                actual_slab_rate = 0.25
            else:
                actual_slab_rate = 0.30

    step4_87a = {
        "claimed_87a": claimed_87a,
        "rebate_forfeited": rebate_forfeited,
        "updated_slab_rate": actual_slab_rate,
        "total_income_for_87a_check": (
            base_income + taxable_eq_ltcg + eq_stcg + noneq_stcg + noneq_ltcg
            if claimed_87a else None
        ),
    }

    # ── Step 5: Compute final tax ───────────────────────────────────────────
    tax_eq_stcg = eq_stcg * EQUITY_STCG_RATE
    tax_eq_ltcg = taxable_eq_ltcg * EQUITY_LTCG_RATE
    tax_noneq_stcg = noneq_stcg * actual_slab_rate
    tax_noneq_ltcg = noneq_ltcg * NON_EQUITY_LTCG_RATE

    total_tax = tax_eq_stcg + tax_eq_ltcg + tax_noneq_stcg + tax_noneq_ltcg

    # Compute tax saving from optimal CF allocation vs naive
    naive_taxable_noneq_ltcg = max(0.0, naive_noneq_ltcg_after_cf)
    naive_tax_noneq = naive_taxable_noneq_ltcg * NON_EQUITY_LTCG_RATE
    naive_taxable_eq_ltcg = max(0.0, naive_eq_ltcg_after_cf - LTCG_EXEMPTION)
    naive_tax_eq = naive_taxable_eq_ltcg * EQUITY_LTCG_RATE
    naive_total = naive_tax_noneq + naive_tax_eq + tax_eq_stcg + tax_noneq_stcg
    optimal_vs_naive_saving = max(0.0, naive_total - total_tax)

    return {
        "realised": realised,
        "step1_stcl": step1_stcl,
        "step1_ltcl": step1_ltcl,
        "step2_cf_ltcl": step2_cf_ltcl,
        "step2_cf_stcl": step2_cf_stcl,
        "step3_exemption": step3_exemption,
        "step4_87a": step4_87a,
        "tax": {
            "equity_stcg": tax_eq_stcg,
            "equity_ltcg": tax_eq_ltcg,
            "non_equity_stcg": tax_noneq_stcg,
            "non_equity_ltcg": tax_noneq_ltcg,
        },
        "total_tax": total_tax,
        "exemption_used": exemption_used,
        "exemption_remaining": exemption_remaining,
        "slab_rate": actual_slab_rate,
        "tax_regime": tax_regime,
        "cf_ltcl_remaining": step2_cf_ltcl["cf_ltcl_remaining_unused"],
        "cf_stcl_remaining": step2_cf_stcl["cf_stcl_remaining_unused"],
        "optimal_vs_naive_saving": optimal_vs_naive_saving,
    }


# ── Loss harvesting ───────────────────────────────────────────────────────────

def get_loss_harvest_candidates_mf(session_state: dict) -> list[dict]:
    """Return MF folios eligible for loss harvesting.

    Applies:
    - Sec 94(7) bonus stripping check
    - Sec 94(8) dividend stripping check
    - ELSS lock-in exclusion
    - Exit load viability (nil exit load preferred; non-nil excluded unless user overrides)
    - Threshold: Rs 200 tax saving OR carry-forward value for nil-exit-load funds

    Returns list of dicts with keys:
        fund_name, unrealised_gain (negative = loss), loss_type (STCL/LTCL),
        exit_load_pct, tax_saved, cf_value, excluded, exclude_reason, eligible_after_date
    """
    cas = session_state.get("cas_parsed") or {}
    tax_analysis = session_state.get("tax_analysis") or {}
    base_tax = float(tax_analysis.get("total_tax") or 0)
    folios = cas.get("folios") or []
    candidates = []

    for folio in folios:
        unrealised = float(folio.get("unrealised_gain") or 0)
        if unrealised >= 0:
            continue  # profit, not a loss candidate

        if folio.get("is_elss"):
            locked = any(lot.get("is_locked") for lot in (folio.get("lots") or []))
            if locked:
                candidates.append({
                    "fund_name": folio.get("fund_name"),
                    "unrealised_gain": unrealised,
                    "excluded": True,
                    "exclude_reason": "ELSS units still within 3-year lock-in period",
                    "eligible_after_date": None,
                })
                continue

        # Sec 94(7)/(8) check
        if folio.get("sec_94_7_applies") or folio.get("sec_94_8_applies"):
            sec = "94(7) bonus stripping" if folio.get("sec_94_7_applies") else "94(8) dividend stripping"
            candidates.append({
                "fund_name": folio.get("fund_name"),
                "unrealised_gain": unrealised,
                "excluded": True,
                "exclude_reason": f"Section {sec} — loss disallowed",
                "eligible_after_date": folio.get("sec_94_eligible_after"),
            })
            continue

        # Determine loss type
        holding_days = _estimate_holding_days(folio)
        is_equity = folio.get("is_equity_oriented", True)
        # Post-Apr 2023 non-equity purchases are always STCL
        if not is_equity:
            purchase_before_apr23 = _has_pre_apr23_lots(folio)
            if purchase_before_apr23 and holding_days > 730:
                loss_type = "LTCL"
            else:
                loss_type = "STCL"
        else:
            loss_type = "LTCL" if holding_days > 365 else "STCL"

        exit_load = float(folio.get("exit_load_pct") or 0)
        loss_magnitude = abs(unrealised)

        # Tax saved against remaining taxable gains
        tax_saved = _compute_loss_tax_saved(loss_type, loss_magnitude, tax_analysis)
        net_benefit = tax_saved - (loss_magnitude * exit_load / 100)

        # Viability
        if base_tax > 0:
            if net_benefit < 200 and exit_load > 0:
                candidates.append({
                    "fund_name": folio.get("fund_name"),
                    "unrealised_gain": unrealised,
                    "loss_type": loss_type,
                    "exit_load_pct": exit_load,
                    "tax_saved": tax_saved,
                    "cf_value": loss_magnitude,
                    "excluded": True,
                    "exclude_reason": f"Net benefit after exit load (Rs {net_benefit:.0f}) under Rs 200 threshold",
                    "eligible_after_date": None,
                })
                continue
        else:
            # Carry-forward building mode: exclude non-nil exit load
            if exit_load > 0:
                candidates.append({
                    "fund_name": folio.get("fund_name"),
                    "unrealised_gain": unrealised,
                    "loss_type": loss_type,
                    "exit_load_pct": exit_load,
                    "tax_saved": 0,
                    "cf_value": loss_magnitude,
                    "excluded": True,
                    "exclude_reason": "Exit load applies — not recommended for carry-forward building",
                    "eligible_after_date": None,
                })
                continue

        candidates.append({
            "fund_name": folio.get("fund_name"),
            "fund_category": folio.get("fund_category"),
            "unrealised_gain": unrealised,
            "loss_type": loss_type,
            "exit_load_pct": exit_load,
            "tax_saved": tax_saved,
            "cf_value": loss_magnitude,
            "holding_days": holding_days,
            "excluded": False,
            "exclude_reason": None,
            "eligible_after_date": None,
        })

    return candidates


def get_loss_harvest_candidates_stocks(session_state: dict) -> list[dict]:
    """Return stock/ETF positions eligible for loss harvesting.

    Uses broker_holdings_parsed from session_state.
    Returns list of dicts with loss type, tax saved, and GAAR caveat flag.
    """
    holdings = session_state.get("broker_holdings_parsed") or {}
    tax_analysis = session_state.get("tax_analysis") or {}
    positions = holdings.get("holdings") or []
    candidates = []

    for pos in positions:
        unrealised = float(pos.get("unrealised_gain") or 0)
        if unrealised >= 0:
            continue

        loss_magnitude = abs(unrealised)
        is_lt = pos.get("is_long_term", False)
        loss_type = "LTCL" if is_lt else "STCL"
        tax_saved = _compute_loss_tax_saved(loss_type, loss_magnitude, tax_analysis)

        # Basic threshold check
        if tax_saved < 200 and float(tax_analysis.get("total_tax") or 0) > 0:
            candidates.append({
                "scrip_name": pos.get("scrip_name"),
                "unrealised_gain": unrealised,
                "loss_type": loss_type,
                "tax_saved": tax_saved,
                "cf_value": loss_magnitude,
                "excluded": True,
                "exclude_reason": f"Tax saving (Rs {tax_saved:.0f}) under Rs 200 threshold",
            })
            continue

        candidates.append({
            "scrip_name": pos.get("scrip_name"),
            "unrealised_gain": unrealised,
            "loss_type": loss_type,
            "holding_days": _estimate_stock_holding_days(pos),
            "tax_saved": tax_saved,
            "cf_value": loss_magnitude,
            "excluded": False,
            "gaar_caveat": True,  # Always flag for transparency
        })

    return candidates


def get_gains_harvest_candidates_mf(remaining_exemption: float, session_state: dict) -> list[dict]:
    """Return equity MF folios eligible for LTCG exemption harvesting.

    Only equity-oriented funds (>65% domestic equity) with holding period >12 months.
    ELSS: unlocked units only.
    Accounts for exit load impact on net gain.
    Returns sorted list (largest unrealised LTCG first).
    """
    cas = session_state.get("cas_parsed") or {}
    folios = cas.get("folios") or []
    candidates = []

    for folio in folios:
        if not folio.get("is_equity_oriented", False):
            continue

        unrealised = float(folio.get("unrealised_gain") or 0)
        if unrealised <= 0:
            continue

        holding_days = _estimate_holding_days(folio)
        if holding_days <= 365:
            continue  # Not yet LTCG eligible

        if folio.get("is_elss"):
            unlocked_gain = _compute_elss_unlocked_gain(folio)
            if unlocked_gain <= 0:
                continue
            unrealised = unlocked_gain

        exit_load = float(folio.get("exit_load_pct") or 0)
        exit_load_cost = unrealised * (exit_load / 100) if exit_load else 0
        net_gain = unrealised - exit_load_cost

        if net_gain <= 200:
            continue

        candidates.append({
            "fund_name": folio.get("fund_name"),
            "fund_category": folio.get("fund_category"),
            "unrealised_ltcg": unrealised,
            "net_ltcg_after_exit_load": net_gain,
            "exit_load_pct": exit_load,
            "holding_days": holding_days,
            "is_elss": folio.get("is_elss", False),
            "harvestable_up_to": min(net_gain, remaining_exemption),
        })

    # Sort: largest net LTCG first
    candidates.sort(key=lambda x: x["net_ltcg_after_exit_load"], reverse=True)
    return candidates


def compute_cf_strategy(tax_analysis: dict) -> dict:
    """Explain CF allocation rationale and compute tax saved vs naive allocation.

    Returns dict for display in US-24.
    """
    step2 = tax_analysis.get("step2_cf_ltcl") or {}
    step2s = tax_analysis.get("step2_cf_stcl") or {}
    saving = float(tax_analysis.get("optimal_vs_naive_saving") or 0)

    return {
        "cf_ltcl_vs_noneq_ltcg": step2.get("cf_ltcl_vs_noneq_ltcg", 0),
        "cf_ltcl_vs_eq_ltcg": step2.get("cf_ltcl_vs_eq_ltcg", 0),
        "cf_stcl_vs_stcg": (
            float(step2s.get("cf_stcl_vs_noneq_stcg") or 0)
            + float(step2s.get("cf_stcl_vs_eq_stcg") or 0)
        ),
        "cf_stcl_vs_ltcg": (
            float(step2s.get("cf_stcl_vs_noneq_ltcg") or 0)
            + float(step2s.get("cf_stcl_vs_eq_ltcg") or 0)
        ),
        "cf_ltcl_unused": step2.get("cf_ltcl_remaining_unused", 0),
        "cf_stcl_unused": step2s.get("cf_stcl_remaining_unused", 0),
        "optimal_vs_naive_saving": saving,
        "explanation": (
            f"By applying CF LTCL against non-equity LTCG first (which has no Rs 1.25L exemption), "
            f"this strategy saved Rs {saving:,.0f} compared to applying them against equity LTCG first."
            if saving > 0 else
            "CF losses were applied optimally — equity LTCG exceeded the Rs 1.25L exemption in either case."
        ),
    }


# ── Private helpers ───────────────────────────────────────────────────────────

def _estimate_holding_days(folio: dict) -> int:
    """Estimate average holding period in days for a folio."""
    lots = folio.get("lots") or []
    if lots:
        try:
            today = _today()
            days_list = [
                (today - datetime.strptime(lot["purchase_date"], "%Y-%m-%d").date()).days
                for lot in lots if lot.get("purchase_date")
            ]
            return int(sum(days_list) / len(days_list)) if days_list else 0
        except Exception:
            pass
    return 400  # default >12 months for equity folios


def _estimate_stock_holding_days(pos: dict) -> int:
    """Estimate holding period for a stock position."""
    lots = pos.get("lots") or []
    if lots:
        try:
            today = _today()
            days_list = [
                (today - datetime.strptime(lot["buy_date"], "%Y-%m-%d").date()).days
                for lot in lots if lot.get("buy_date")
            ]
            return int(sum(days_list) / len(days_list)) if days_list else 0
        except Exception:
            pass
    return 0


def _has_pre_apr23_lots(folio: dict) -> bool:
    """Check if any lot was purchased before April 1 2023."""
    apr23 = date(2023, 4, 1)
    for lot in (folio.get("lots") or []):
        try:
            d = datetime.strptime(lot["purchase_date"], "%Y-%m-%d").date()
            if d < apr23:
                return True
        except Exception:
            pass
    return False


def _compute_loss_tax_saved(loss_type: str, loss_magnitude: float, tax_analysis: dict) -> float:
    """Compute tax saved by booking a specific loss, given current remaining taxable gains."""
    if not tax_analysis:
        return 0.0
    tax = tax_analysis.get("tax") or {}
    actual_slab = float(tax_analysis.get("slab_rate") or 0.30)
    if loss_type == "STCL":
        # Can offset non-equity STCG (slab rate) first, then equity STCG (20%)
        remaining_noneq_stcg = float((tax_analysis.get("step2_cf_stcl") or {}).get("cf_stcl_vs_noneq_stcg") or 0)
        remaining_eq_stcg = float(tax.get("equity_stcg") or 0) / 0.20 if tax.get("equity_stcg") else 0
        noneq_offset = min(loss_magnitude, remaining_noneq_stcg)
        remaining = loss_magnitude - noneq_offset
        eq_offset = min(remaining, remaining_eq_stcg)
        return noneq_offset * actual_slab + eq_offset * EQUITY_STCG_RATE
    elif loss_type == "LTCL":
        # Can offset LTCG; target non-equity first
        remaining_noneq_ltcg = float(tax.get("non_equity_ltcg") or 0) / NON_EQUITY_LTCG_RATE if tax.get("non_equity_ltcg") else 0
        remaining_eq_ltcg_taxable = float(tax.get("equity_ltcg") or 0) / EQUITY_LTCG_RATE if tax.get("equity_ltcg") else 0
        noneq_offset = min(loss_magnitude, remaining_noneq_ltcg)
        remaining = loss_magnitude - noneq_offset
        eq_offset = min(remaining, remaining_eq_ltcg_taxable)
        return noneq_offset * NON_EQUITY_LTCG_RATE + eq_offset * EQUITY_LTCG_RATE
    return 0.0


def _compute_elss_unlocked_gain(folio: dict) -> float:
    """Compute unrealised gain on unlocked ELSS lots only."""
    total_gain = 0.0
    current_nav = float(folio.get("current_nav") or 0)
    for lot in (folio.get("lots") or []):
        if lot.get("is_locked"):
            continue
        units = float(lot.get("units") or 0)
        buy_nav = float(lot.get("nav") or 0)
        if current_nav and buy_nav:
            total_gain += units * (current_nav - buy_nav)
    return total_gain
