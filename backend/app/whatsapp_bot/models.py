"""Pydantic models for structured LLM outputs from llm_doc_parser.

These schemas are used as response_schema for Gemini structured outputs,
ensuring type-safe extraction from all four document types.

Key design principle: LLMs sometimes return null for string fields they cannot
find instead of an empty string.  All models inherit from LLMBaseModel which
runs a pre-validation pass replacing null → field_default (or "" for str
fields).  This means model_validate(data, strict=False) will never crash on a
null string field — it will silently fall back to the declared default.
"""

from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field, model_validator


class LLMBaseModel(BaseModel):
    """Base class for all LLM-parsed models.

    Strips None values from incoming dicts before field validation so that
    LLM responses with null string fields fall back to each field's declared
    default rather than raising a ValidationError.
    """

    @model_validator(mode="before")
    @classmethod
    def _coerce_nulls_to_defaults(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # Walk every field that has a default.  If the incoming value is None,
        # replace it with the field's default so validation passes cleanly.
        cleaned: dict = {}
        for key, value in data.items():
            field_info = cls.model_fields.get(key)
            if value is None and field_info is not None:
                # Use the declared default if it is not PydanticUndefined
                from pydantic_core import PydanticUndefinedType
                default = field_info.default
                if isinstance(default, PydanticUndefinedType):
                    # No default → keep None (will still fail for non-Optional str)
                    cleaned[key] = value
                else:
                    cleaned[key] = default
            else:
                cleaned[key] = value
        return cleaned


# ── CAS (MFCentral / CAMS / KFintech) ────────────────────────────────────────

class CASTransaction(LLMBaseModel):
    """A single transaction within a folio."""
    date: str = Field(description="Transaction date in YYYY-MM-DD format")
    type: str = Field(description="Type: 'purchase' | 'redemption' | 'switch_in' | 'switch_out' | 'stp_in' | 'stp_out' | 'dividend' | 'bonus'")
    units: float = Field(description="Number of units transacted (always positive)")
    nav: float = Field(description="NAV at which transaction occurred")
    amount: float = Field(description="Transaction amount in INR")
    balance_units: float = Field(description="Running unit balance after this transaction")


class CASLot(LLMBaseModel):
    """A single purchase lot within a folio — used for ELSS lock-in tracking."""
    purchase_date: str = Field(description="Purchase date in YYYY-MM-DD format")
    units: float = Field(description="Units in this lot")
    nav: float = Field(description="Purchase NAV")
    amount: float = Field(description="Purchase amount in INR")
    lock_in_expiry: Optional[str] = Field(None, description="Lock-in expiry date YYYY-MM-DD (ELSS only)")
    is_locked: Optional[bool] = Field(None, description="True if still within lock-in period")


class CASFolio(LLMBaseModel):
    """A single fund folio within the CAS."""
    fund_name: str = Field(default="", description="Full scheme name e.g. 'Axis Long Term Equity Fund Direct Growth'")
    fund_house: str = Field(default="", description="AMC name e.g. 'Axis Mutual Fund'")
    folio_number: str = Field(default="", description="Folio number")
    isin: Optional[str] = Field(None, description="ISIN of the scheme")
    current_units: float = Field(description="Current unit balance")
    current_nav: float = Field(description="Latest NAV per unit")
    current_value: float = Field(description="current_units * current_nav")
    avg_cost_per_unit: float = Field(description="Weighted average cost per unit")
    total_invested: float = Field(description="Total amount invested in this folio")
    unrealised_gain: float = Field(description="current_value - total_invested (can be negative)")
    is_elss: bool = Field(description="True if this is an ELSS / tax-saving fund")
    lots: list[CASLot] = Field(default_factory=list, description="Individual purchase lots for lock-in tracking")
    fy_transactions: list[CASTransaction] = Field(default_factory=list, description="Transactions in FY 2025-26 (Apr 2025 onwards)")
    realised_ltcg_this_fy: float = Field(0.0, description="Realised LTCG from redemptions/switches this FY")
    realised_stcg_this_fy: float = Field(0.0, description="Realised STCG from redemptions/switches this FY")
    realised_ltcl_this_fy: float = Field(0.0, description="Realised LTCL (positive magnitude) from this FY")
    realised_stcl_this_fy: float = Field(0.0, description="Realised STCL (positive magnitude) from this FY")
    fund_category: str = Field(default="unknown", description="SEBI category: 'equity_large_cap' | 'equity_mid_cap' | 'equity_small_cap' | 'equity_flexi_cap' | 'equity_multi_cap' | 'elss' | 'index' | 'etf_equity' | 'aggressive_hybrid' | 'balanced_advantage' | 'conservative_hybrid' | 'debt' | 'liquid' | 'gold' | 'international' | 'fof' | 'unknown'")
    is_equity_oriented: bool = Field(default=False, description="True if domestic equity allocation >65%")
    exit_load_pct: float = Field(0.0, description="Exit load percentage (e.g. 1.0 for 1%)")
    has_bonus_units: bool = Field(False, description="True if bonus units were allotted in the last 9 months")
    has_recent_dividend: bool = Field(False, description="True if dividend paid in the last 9 months")
    sec_94_7_applies: bool = Field(False, description="Section 94(7) bonus stripping — loss disallowed if True")
    sec_94_8_applies: bool = Field(False, description="Section 94(8) dividend stripping — loss disallowed if True")
    grandfathering_applicable: bool = Field(False, description="True if any units were purchased before Feb 1 2018 (Section 112A grandfathering)")
    fmv_jan31_2018: Optional[float] = Field(None, description="NAV as on Jan 31 2018 for grandfathering (if applicable)")


class CASResult(LLMBaseModel):
    """Complete parsed result from a CAS PDF."""
    investor_name: str = Field(default="", description="Investor full name")
    # PAN may be masked (ABCXX1234X) or absent in some CAS variants
    pan: Optional[str] = Field(default="", description="PAN in XXXXX1234X format; empty string if not present")
    cas_generation_date: Optional[str] = Field(default="", description="Date the CAS was generated, YYYY-MM-DD; empty string if not found")
    statement_period_from: Optional[str] = Field(default="", description="Statement period start YYYY-MM-DD; empty string if not found")
    statement_period_to: Optional[str] = Field(default="", description="Statement period end YYYY-MM-DD; empty string if not found")
    folios: list[CASFolio] = Field(default_factory=list)
    total_portfolio_value: float = Field(default=0.0)
    total_invested: float = Field(default=0.0)
    total_unrealised_gain: float = Field(default=0.0)
    total_realised_ltcg_fy: float = Field(default=0.0)
    total_realised_stcg_fy: float = Field(default=0.0)
    total_realised_ltcl_fy: float = Field(default=0.0)
    total_realised_stcl_fy: float = Field(default=0.0)
    cas_type: str = Field(default="detailed", description="'detailed' or 'summary'")
    registrar: str = Field(default="unknown", description="'CAMS' | 'KFintech' | 'combined' | 'unknown'")


# ── Broker Tax P&L ────────────────────────────────────────────────────────────

class BrokerTrade(LLMBaseModel):
    """A single delivery-based trade contributing to realised P&L."""
    scrip_name: str = Field(default="")
    isin: Optional[str] = None
    buy_date: str = Field(default="", description="YYYY-MM-DD")
    sell_date: str = Field(default="", description="YYYY-MM-DD")
    quantity: float = Field(default=0.0)
    buy_price: float = Field(default=0.0)
    sell_price: float = Field(default=0.0)
    gain_loss: float = Field(default=0.0, description="Positive = gain, negative = loss")
    holding_days: int = Field(default=0)
    is_long_term: bool = Field(default=False, description="True if held >12 months (equity) or >24 months (non-equity pre-Apr 2023)")
    asset_class: str = Field(default="unknown", description="'equity' | 'equity_etf' | 'non_equity_etf' | 'reit' | 'invit' | 'unknown'")


class BrokerPLResult(LLMBaseModel):
    """Parsed result from a broker Tax P&L report."""
    broker_name: str = Field(default="unknown", description="Detected broker name")
    fy: str = Field(default="2025-26", description="Financial year e.g. '2025-26'")
    total_ltcg: float = Field(0.0, description="Total long-term capital gains (equity)")
    total_stcg: float = Field(0.0, description="Total short-term capital gains (equity)")
    total_ltcl: float = Field(0.0, description="Total long-term capital losses (positive magnitude)")
    total_stcl: float = Field(0.0, description="Total short-term capital losses (positive magnitude)")
    has_intraday: bool = Field(False, description="Whether intraday trades were detected and excluded")
    has_fno: bool = Field(False, description="Whether F&O trades were detected and excluded")
    trades: list[BrokerTrade] = Field(default_factory=list, description="Individual delivery-based trades")


# ── Broker Holdings ───────────────────────────────────────────────────────────

class HoldingLot(LLMBaseModel):
    """A single purchase lot within a stock holding."""
    buy_date: str = Field(default="", description="YYYY-MM-DD")
    quantity: float = Field(default=0.0)
    buy_price: float = Field(default=0.0)
    current_price: float = Field(default=0.0)
    gain_loss_per_unit: float = Field(default=0.0)
    holding_days: int = Field(default=0)
    is_long_term: bool = Field(default=False)


class StockHolding(LLMBaseModel):
    """A single stock/ETF holding with lot-level detail."""
    scrip_name: str = Field(default="")
    isin: Optional[str] = None
    symbol: Optional[str] = None
    exchange: Optional[str] = Field(None, description="'NSE' | 'BSE'")
    total_quantity: float = Field(default=0.0)
    current_price: float = Field(default=0.0)
    current_value: float = Field(default=0.0)
    total_invested: float = Field(default=0.0)
    unrealised_gain: float = Field(default=0.0)
    is_long_term: bool = Field(default=False, description="True if all lots are held >12 months")
    has_mixed_lots: bool = Field(False, description="True if some lots are LT and some are ST")
    lots: list[HoldingLot] = Field(default_factory=list)
    asset_class: str = Field(default="unknown", description="'equity' | 'equity_etf' | 'gold_etf' | 'non_equity_etf' | 'reit' | 'invit' | 'unknown'")
    corporate_action_flag: Optional[str] = Field(None, description="'bonus' | 'split' | 'rights' | None")


class BrokerHoldingsResult(LLMBaseModel):
    """Parsed result from a broker Holdings export."""
    broker_name: str = Field(default="unknown")
    report_date: str = Field(default="", description="Date of the holdings snapshot YYYY-MM-DD")
    holdings: list[StockHolding] = Field(default_factory=list)
    total_portfolio_value: float = Field(default=0.0)
    total_invested: float = Field(default=0.0)
    total_unrealised_gain: float = Field(default=0.0)
    ltcg_eligible: list[str] = Field(default_factory=list, description="Scrip names with LTCG (held >12mo, in profit)")
    ltcl_candidates: list[str] = Field(default_factory=list, description="Scrip names with LTCL (held >12mo, at loss)")
    stcl_candidates: list[str] = Field(default_factory=list, description="Scrip names with STCL (held <12mo, at loss)")
    not_yet_ltcg_eligible: list[str] = Field(default_factory=list, description="Scrip names held <12mo in profit")


# ── ITR (Schedule CFL) ────────────────────────────────────────────────────────

class CFLTranche(LLMBaseModel):
    """A single year's carry-forward loss tranche from Schedule CFL."""
    loss_fy: str = Field(default="", description="FY in which the loss was incurred e.g. '2024-25'")
    expiry_fy: str = Field(default="", description="FY in which this loss expires e.g. '2032-33'")
    ltcl: float = Field(0.0, description="Long-term capital loss (positive magnitude)")
    stcl: float = Field(0.0, description="Short-term capital loss (positive magnitude)")


class ITRResult(LLMBaseModel):
    """Parsed Schedule CFL from an ITR PDF/JSON."""
    itr_type: str = Field(default="unknown", description="'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4' | 'unknown'")
    assessment_year: str = Field(default="", description="e.g. '2025-26'")
    financial_year: str = Field(default="", description="e.g. '2024-25'")
    schedule_cfl_found: bool = Field(default=False)
    tranches: list[CFLTranche] = Field(default_factory=list)
    total_ltcl_cf: float = Field(0.0, description="Sum of all LTCL carry-forward tranches")
    total_stcl_cf: float = Field(0.0, description="Sum of all STCL carry-forward tranches")
    filing_date: Optional[str] = Field(None, description="ITR filing date YYYY-MM-DD if detectable")
    is_itr1: bool = Field(False, description="True if ITR-1 (which cannot carry forward capital losses)")
