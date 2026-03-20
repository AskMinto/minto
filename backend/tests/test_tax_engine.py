"""Tests for the WhatsApp Tax Bot tax engine.

Covers:
- US-19 complete netting example (the exact scenario from the PRD)
- Section 112A Rs 1.25L exemption
- Section 87A rebate re-check
- CF loss allocation order (non-exempt gains first)
- LTCL never offsetting STCG
- days_to_deadline
"""

from __future__ import annotations

import pytest

from app.whatsapp_bot.tax_engine import (
    LTCG_EXEMPTION,
    compute_cf_strategy,
    compute_tax_analysis,
    days_to_deadline,
    get_gains_harvest_candidates_mf,
    get_loss_harvest_candidates_mf,
)


def _make_ss(
    eq_ltcg=0, eq_stcg=0, eq_ltcl=0, eq_stcl=0,
    noneq_ltcg=0, noneq_stcg=0, noneq_ltcl=0, noneq_stcl=0,
    cf_ltcl=0, cf_stcl=0,
    slab_rate=0.30, tax_regime="new", base_income=2_400_001,
    folios=None,
) -> dict:
    """Build a minimal session_state for tax engine tests."""
    ss: dict = {
        "slab_rate": slab_rate,
        "tax_regime": tax_regime,
        "base_income": base_income,
        "cas_parsed": {
            "total_realised_ltcg_fy": eq_ltcg,
            "total_realised_stcg_fy": eq_stcg,
            "total_realised_ltcl_fy": eq_ltcl,
            "total_realised_stcl_fy": eq_stcl,
            "folios": folios or [],
        },
        "broker_pl_parsed": None,
        "itr_parsed": {
            "total_ltcl_cf": cf_ltcl,
            "total_stcl_cf": cf_stcl,
        },
    }
    # Add non-equity from folios directly (avoid double counting)
    return ss


def _make_ss_with_noneq(
    eq_ltcg=0, eq_stcg=0, eq_ltcl=0, eq_stcl=0,
    noneq_ltcg=0, noneq_stcg=0, noneq_ltcl=0, noneq_stcl=0,
    cf_ltcl=0, cf_stcl=0,
    slab_rate=0.30, tax_regime="new", base_income=2_400_001,
) -> dict:
    """Build session_state with non-equity folios to test non-equity netting."""
    folios = []
    if noneq_ltcg or noneq_stcg or noneq_ltcl or noneq_stcl:
        folios.append({
            "fund_name": "HDFC Corporate Bond Fund",
            "is_equity_oriented": False,
            "current_units": 100,
            "current_nav": 100,
            "current_value": 10000,
            "avg_cost_per_unit": 90,
            "total_invested": 9000,
            "unrealised_gain": 1000,
            "is_elss": False,
            "lots": [],
            "realised_ltcg_this_fy": noneq_ltcg,
            "realised_stcg_this_fy": noneq_stcg,
            "realised_ltcl_this_fy": noneq_ltcl,
            "realised_stcl_this_fy": noneq_stcl,
            "exit_load_pct": 0,
            "sec_94_7_applies": False,
            "sec_94_8_applies": False,
            "fund_category": "debt",
        })

    return {
        "slab_rate": slab_rate,
        "tax_regime": tax_regime,
        "base_income": base_income,
        "cas_parsed": {
            "total_realised_ltcg_fy": eq_ltcg + noneq_ltcg,
            "total_realised_stcg_fy": eq_stcg + noneq_stcg,
            "total_realised_ltcl_fy": eq_ltcl + noneq_ltcl,
            "total_realised_stcl_fy": eq_stcl + noneq_stcl,
            "folios": folios,
        },
        "broker_pl_parsed": None,
        "itr_parsed": {
            "total_ltcl_cf": cf_ltcl,
            "total_stcl_cf": cf_stcl,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# US-19 complete example from the PRD
# ─────────────────────────────────────────────────────────────────────────────

class TestUS19CompleteExample:
    """Exact netting scenario from the PRD (US-19) — result should be Rs 0 tax."""

    def _make_us19_ss(self) -> dict:
        # From the PRD:
        # Equity LTCG (MF+stocks):  Rs 87,388
        # Equity STCG (stocks):      Rs 8,200
        # Equity STCL (MF):         -Rs 3,940 (CAS)
        # Equity STCL (stocks):     -Rs 6,188 (broker)
        # Non-equity STCG:           Rs 6,500 (post-Apr 2023 debt @ 30%)
        # Non-equity LTCG:           Rs 14,200 (pre-Apr 2023 debt @ 12.5%)
        # CF LTCL (FY 24-25):       -Rs 45,000
        # CF STCL (FY 24-25):       -Rs 12,000
        noneq_folio = {
            "fund_name": "HDFC Corporate Bond",
            "is_equity_oriented": False,
            "current_units": 100,
            "current_nav": 100,
            "current_value": 10000,
            "avg_cost_per_unit": 90,
            "total_invested": 9000,
            "unrealised_gain": 1000,
            "is_elss": False,
            "lots": [],
            "realised_ltcg_this_fy": 14200,
            "realised_stcg_this_fy": 6500,
            "realised_ltcl_this_fy": 0,
            "realised_stcl_this_fy": 0,
            "exit_load_pct": 0,
            "sec_94_7_applies": False,
            "sec_94_8_applies": False,
            "fund_category": "debt",
        }
        return {
            "slab_rate": 0.30,
            "tax_regime": "new",
            "base_income": 2_400_001,  # Above Rs 12L so no 87A
            "cas_parsed": {
                "total_realised_ltcg_fy": 87388 + 14200,
                "total_realised_stcg_fy": 8200 + 6500,
                "total_realised_ltcl_fy": 0,
                "total_realised_stcl_fy": 3940,
                "folios": [noneq_folio],
            },
            "broker_pl_parsed": {
                "total_ltcg": 0,
                "total_stcg": 0,
                "total_ltcl": 0,
                "total_stcl": 6188,
            },
            "itr_parsed": {
                "total_ltcl_cf": 45000,
                "total_stcl_cf": 12000,
            },
        }

    def test_total_tax_is_zero(self):
        ss = self._make_us19_ss()
        result = compute_tax_analysis(ss)
        assert result["total_tax"] == 0.0

    def test_exemption_used_49160(self):
        """After CF losses, equity LTCG should be Rs 49,160 — within Rs 1.25L exemption."""
        ss = self._make_us19_ss()
        result = compute_tax_analysis(ss)
        exemption_used = result["exemption_used"]
        assert 40000 < exemption_used < 60000, f"Expected ~Rs 49,160, got {exemption_used}"

    def test_stcl_targets_noneq_stcg_first(self):
        """STCL should be applied against non-equity STCG (30%) before equity STCG (20%)."""
        ss = self._make_us19_ss()
        result = compute_tax_analysis(ss)
        step1 = result["step1_stcl"]
        # Non-equity STCG was Rs 6,500; all of it should be absorbed by STCL
        assert step1["stcl_vs_noneq_stcg"] == 6500, f"Expected 6500, got {step1['stcl_vs_noneq_stcg']}"
        # Some STCL should also hit equity STCG
        assert step1["stcl_vs_eq_stcg"] > 0

    def test_cf_ltcl_targets_noneq_ltcg_first(self):
        """CF LTCL should be applied against non-equity LTCG (no exemption) before equity LTCG."""
        ss = self._make_us19_ss()
        result = compute_tax_analysis(ss)
        step2 = result["step2_cf_ltcl"]
        # Non-equity LTCG was Rs 14,200; CF LTCL should zero it out first
        assert step2["cf_ltcl_vs_noneq_ltcg"] == 14200, f"Expected 14200, got {step2['cf_ltcl_vs_noneq_ltcg']}"
        # Remaining Rs 30,800 should go against equity LTCG
        assert step2["cf_ltcl_vs_eq_ltcg"] == 30800, f"Expected 30800, got {step2['cf_ltcl_vs_eq_ltcg']}"

    def test_optimal_allocation_saves_tax(self):
        """Optimal CF allocation should save tax vs naive (applying CF LTCL to equity first)."""
        ss = self._make_us19_ss()
        result = compute_tax_analysis(ss)
        # Saving should be Rs 14,200 * 12.5% = Rs 1,775
        saving = result["optimal_vs_naive_saving"]
        assert saving > 0, f"Expected positive tax saving, got {saving}"
        assert abs(saving - 1775) < 50, f"Expected ~Rs 1,775 saving, got {saving}"


# ─────────────────────────────────────────────────────────────────────────────
# Section 112A — Rs 1.25L exemption
# ─────────────────────────────────────────────────────────────────────────────

class TestLTCGExemption:
    def test_exemption_applies_to_equity_ltcg_only(self):
        """Rs 1.25L exemption applies to equity LTCG, not non-equity LTCG."""
        ss = _make_ss_with_noneq(eq_ltcg=50000, noneq_ltcg=20000)
        result = compute_tax_analysis(ss)
        # Equity LTCG Rs 50,000 < Rs 1.25L → fully exempt
        assert result["tax"]["equity_ltcg"] == 0.0
        # Non-equity LTCG Rs 20,000 → taxed at 12.5% = Rs 2,500
        assert result["tax"]["non_equity_ltcg"] == pytest.approx(20000 * 0.125)

    def test_exemption_above_threshold(self):
        """Equity LTCG above Rs 1.25L should be taxed on the excess."""
        ss = _make_ss(eq_ltcg=200000)
        result = compute_tax_analysis(ss)
        expected_taxable = 200000 - LTCG_EXEMPTION
        expected_tax = expected_taxable * 0.125
        assert result["tax"]["equity_ltcg"] == pytest.approx(expected_tax, rel=0.01)
        assert result["exemption_used"] == LTCG_EXEMPTION

    def test_exemption_below_threshold(self):
        """Equity LTCG below Rs 1.25L should result in zero tax."""
        ss = _make_ss(eq_ltcg=100000)
        result = compute_tax_analysis(ss)
        assert result["tax"]["equity_ltcg"] == 0.0
        assert result["exemption_used"] == 100000
        assert result["exemption_remaining"] == LTCG_EXEMPTION - 100000

    def test_ltcl_never_offsets_stcg(self):
        """LTCL (long-term capital loss) must never be applied against STCG."""
        ss = _make_ss(eq_stcg=50000, eq_ltcl=30000)
        result = compute_tax_analysis(ss)
        # LTCL should not reduce STCG
        step1_ltcl = result["step1_ltcl"]
        assert step1_ltcl["ltcl_vs_noneq_ltcg"] == 0
        assert step1_ltcl["ltcl_vs_eq_ltcg"] == 0
        # STCG should be fully taxable
        assert result["tax"]["equity_stcg"] == pytest.approx(50000 * 0.20)


# ─────────────────────────────────────────────────────────────────────────────
# Section 87A rebate re-check
# ─────────────────────────────────────────────────────────────────────────────

class TestSection87A:
    def test_87a_forfeited_when_total_income_exceeds_12l(self):
        """If total income (base + all gains) > Rs 12L, 87A rebate is forfeited."""
        ss = {
            "slab_rate": 0.0,  # User claimed 87A (0% slab)
            "tax_regime": "new",
            "base_income": 1_000_000,  # Rs 10L base
            "cas_parsed": {
                "total_realised_ltcg_fy": 0,
                "total_realised_stcg_fy": 300_000,  # Rs 3L STCG pushes total to Rs 13L
                "total_realised_ltcl_fy": 0,
                "total_realised_stcl_fy": 0,
                "folios": [],
            },
            "broker_pl_parsed": None,
            "itr_parsed": None,
        }
        result = compute_tax_analysis(ss)
        assert result["step4_87a"]["rebate_forfeited"] is True
        # Slab rate should be updated from 0% to actual marginal rate
        assert result["slab_rate"] > 0

    def test_87a_not_forfeited_when_total_income_within_12l(self):
        """If total income <= Rs 12L, 87A rebate is preserved."""
        ss = {
            "slab_rate": 0.0,  # User claimed 87A
            "tax_regime": "new",
            "base_income": 900_000,  # Rs 9L base
            "cas_parsed": {
                "total_realised_ltcg_fy": 100_000,  # Total < Rs 12L
                "total_realised_stcg_fy": 0,
                "total_realised_ltcl_fy": 0,
                "total_realised_stcl_fy": 0,
                "folios": [],
            },
            "broker_pl_parsed": None,
            "itr_parsed": None,
        }
        result = compute_tax_analysis(ss)
        assert result["step4_87a"]["rebate_forfeited"] is False

    def test_87a_not_checked_for_old_regime(self):
        """87A rebate check only runs for new regime users who claimed 0% slab."""
        ss = _make_ss(eq_stcg=300000, slab_rate=0.20, tax_regime="old", base_income=900000)
        result = compute_tax_analysis(ss)
        assert result["step4_87a"]["claimed_87a"] is False


# ─────────────────────────────────────────────────────────────────────────────
# Carry-forward ordering
# ─────────────────────────────────────────────────────────────────────────────

class TestCFOrdering:
    def test_cf_ltcl_cannot_offset_stcg(self):
        """CF LTCL must never be applied against STCG."""
        ss = _make_ss(eq_stcg=50000, cf_ltcl=30000)
        result = compute_tax_analysis(ss)
        step2 = result["step2_cf_ltcl"]
        assert step2["cf_ltcl_vs_noneq_ltcg"] == 0
        assert step2["cf_ltcl_vs_eq_ltcg"] == 0
        # CF LTCL should remain unused since there is no LTCG
        assert step2["cf_ltcl_remaining_unused"] == 30000
        # STCG should still be fully taxable
        assert result["tax"]["equity_stcg"] == pytest.approx(50000 * 0.20)

    def test_cf_ltcl_targets_noneq_ltcg_before_eq_ltcg(self):
        """CF LTCL should zero out non-equity LTCG (no exemption) before touching equity LTCG."""
        ss = _make_ss_with_noneq(eq_ltcg=100000, noneq_ltcg=20000, cf_ltcl=30000)
        result = compute_tax_analysis(ss)
        step2 = result["step2_cf_ltcl"]
        # Should apply all 20,000 CF LTCL vs non-equity LTCG first
        assert step2["cf_ltcl_vs_noneq_ltcg"] == 20000
        # Remaining 10,000 should go vs equity LTCG
        assert step2["cf_ltcl_vs_eq_ltcg"] == 10000

    def test_cf_stcl_targets_higher_taxed_stcg_first(self):
        """CF STCL should target non-equity STCG (slab rate) before equity STCG (20%)."""
        ss = _make_ss_with_noneq(eq_stcg=50000, noneq_stcg=30000, cf_stcl=20000)
        result = compute_tax_analysis(ss)
        step2 = result["step2_cf_stcl"]
        # Should apply CF STCL vs non-equity STCG first
        assert step2["cf_stcl_vs_noneq_stcg"] == 20000
        assert step2["cf_stcl_vs_eq_stcg"] == 0  # Non-equity STCG not fully absorbed


# ─────────────────────────────────────────────────────────────────────────────
# Edge cases
# ─────────────────────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_empty_session_state(self):
        """Empty session state should return all zeros without raising."""
        result = compute_tax_analysis({})
        assert result["total_tax"] == 0.0
        assert result["exemption_used"] == 0.0

    def test_no_documents(self):
        """No documents parsed should produce zero tax."""
        ss = {"slab_rate": 0.30, "tax_regime": "new", "base_income": 0}
        result = compute_tax_analysis(ss)
        assert result["total_tax"] == 0.0

    def test_stcl_spill_to_ltcg_noneq_first(self):
        """When STCL exceeds all STCG, remainder spills to LTCG (non-equity first)."""
        ss = _make_ss_with_noneq(eq_stcg=1000, noneq_stcg=1000, noneq_ltcg=5000, eq_ltcg=10000,
                                  eq_stcl=8000)  # 8K STCL > 2K STCG → 6K spills to LTCG
        result = compute_tax_analysis(ss)
        step1 = result["step1_stcl"]
        # STCL applied vs non-equity STCG first (1000), then equity STCG (1000) = 2000 used
        assert step1["stcl_vs_noneq_stcg"] == 1000
        assert step1["stcl_vs_eq_stcg"] == 1000
        # Remaining 6000 spills to LTCG — non-equity first (5000), then equity (1000)
        assert step1["stcl_spill_to_noneq_ltcg"] == 5000
        assert step1["stcl_spill_to_eq_ltcg"] == 1000

    def test_days_to_deadline_returns_int(self):
        days = days_to_deadline()
        assert isinstance(days, int)
        assert days >= 0

    def test_pure_stcg_no_exemption(self):
        """STCG gets no Rs 1.25L exemption — only equity LTCG benefits from it."""
        ss = _make_ss(eq_stcg=200000)
        result = compute_tax_analysis(ss)
        # Exemption should not be used for STCG
        assert result["exemption_used"] == 0.0
        # Full STCG taxed at 20%
        assert result["tax"]["equity_stcg"] == pytest.approx(200000 * 0.20)


# ─────────────────────────────────────────────────────────────────────────────
# Loss harvest candidates
# ─────────────────────────────────────────────────────────────────────────────

class TestLossHarvestCandidates:
    def _make_folio(self, name, unrealised, is_equity=True, is_elss=False, locked=False,
                    exit_load=0, holding_days=400, sec_94_7=False, sec_94_8=False):
        from datetime import date, timedelta
        purchase_date = (date.today() - timedelta(days=holding_days)).isoformat()
        return {
            "fund_name": name,
            "is_equity_oriented": is_equity,
            "unrealised_gain": unrealised,
            "current_units": 100,
            "current_nav": 100,
            "current_value": 10000,
            "avg_cost_per_unit": 100 + unrealised / 100,
            "total_invested": 10000 - unrealised,
            "is_elss": is_elss,
            "lots": [{"purchase_date": purchase_date, "units": 100, "nav": 90, "amount": 9000,
                       "is_locked": locked, "lock_in_expiry": None}],
            "fy_transactions": [],
            "realised_ltcg_this_fy": 0,
            "realised_stcg_this_fy": 0,
            "realised_ltcl_this_fy": 0,
            "realised_stcl_this_fy": 0,
            "fund_category": "equity_large_cap" if is_equity else "debt",
            "exit_load_pct": exit_load,
            "sec_94_7_applies": sec_94_7,
            "sec_94_8_applies": sec_94_8,
        }

    def test_excludes_sec_94_7_violation(self):
        """Folios with Section 94(7) bonus stripping should be excluded."""
        folio = self._make_folio("Fund A", -5000, sec_94_7=True)
        ss = {"cas_parsed": {"folios": [folio]}, "tax_analysis": {"total_tax": 1000}}
        candidates = get_loss_harvest_candidates_mf(ss)
        excluded = [c for c in candidates if c.get("excluded")]
        assert len(excluded) == 1
        assert "94(7)" in excluded[0]["exclude_reason"]

    def test_excludes_locked_elss(self):
        """Locked ELSS units should be excluded from loss harvesting."""
        folio = self._make_folio("ELSS Fund", -3000, is_elss=True, locked=True)
        ss = {"cas_parsed": {"folios": [folio]}, "tax_analysis": {"total_tax": 0}}
        candidates = get_loss_harvest_candidates_mf(ss)
        excluded = [c for c in candidates if c.get("excluded")]
        assert len(excluded) == 1
        assert "lock-in" in excluded[0]["exclude_reason"].lower()

    def test_excludes_nonnil_exit_load_in_cf_mode(self):
        """In CF-building mode (tax=0), non-nil exit load funds should be excluded."""
        folio = self._make_folio("Fund B", -8000, exit_load=1.0)
        ss = {"cas_parsed": {"folios": [folio]}, "tax_analysis": {"total_tax": 0}}
        candidates = get_loss_harvest_candidates_mf(ss)
        excluded = [c for c in candidates if c.get("excluded")]
        assert len(excluded) == 1
        assert "exit load" in excluded[0]["exclude_reason"].lower()

    def test_nil_exit_load_included_in_cf_mode(self):
        """In CF-building mode (tax=0), nil exit load funds should be included."""
        folio = self._make_folio("Fund C", -6000, exit_load=0)
        ss = {"cas_parsed": {"folios": [folio]}, "tax_analysis": {"total_tax": 0}}
        candidates = get_loss_harvest_candidates_mf(ss)
        eligible = [c for c in candidates if not c.get("excluded")]
        assert len(eligible) == 1
        assert eligible[0]["fund_name"] == "Fund C"


# ─────────────────────────────────────────────────────────────────────────────
# CF strategy
# ─────────────────────────────────────────────────────────────────────────────

class TestCFStrategy:
    def test_cf_strategy_shows_saving(self):
        """compute_cf_strategy should surface the tax saving from optimal allocation."""
        # Use the full US-19 scenario
        noneq_folio = {
            "fund_name": "Bond Fund",
            "is_equity_oriented": False,
            "current_units": 100, "current_nav": 100, "current_value": 10000,
            "avg_cost_per_unit": 90, "total_invested": 9000, "unrealised_gain": 1000,
            "is_elss": False, "lots": [],
            "realised_ltcg_this_fy": 14200, "realised_stcg_this_fy": 6500,
            "realised_ltcl_this_fy": 0, "realised_stcl_this_fy": 0,
            "exit_load_pct": 0, "sec_94_7_applies": False, "sec_94_8_applies": False,
            "fund_category": "debt",
        }
        ss = {
            "slab_rate": 0.30, "tax_regime": "new", "base_income": 2_400_001,
            "cas_parsed": {
                "total_realised_ltcg_fy": 87388 + 14200,
                "total_realised_stcg_fy": 8200 + 6500,
                "total_realised_ltcl_fy": 0,
                "total_realised_stcl_fy": 3940,
                "folios": [noneq_folio],
            },
            "broker_pl_parsed": {"total_ltcg": 0, "total_stcg": 0, "total_ltcl": 0, "total_stcl": 6188},
            "itr_parsed": {"total_ltcl_cf": 45000, "total_stcl_cf": 12000},
        }
        tax = compute_tax_analysis(ss)
        cf = compute_cf_strategy(tax)
        assert cf["optimal_vs_naive_saving"] > 0
        assert cf["cf_ltcl_vs_noneq_ltcg"] == 14200
