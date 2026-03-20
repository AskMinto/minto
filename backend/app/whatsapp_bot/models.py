"""Pydantic models for structured LLM outputs from llm_doc_parser.

These schemas are used as response_schema for Gemini structured outputs,
ensuring type-safe extraction from all four document types.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── CAS (MFCentral / CAMS / KFintech) ────────────────────────────────────────

class CASTransaction(BaseModel):
    """A single transaction within a folio."""
    date: str = Field(description="Transaction date in YYYY-MM-DD format")
    type: str = Field(description="Type: 'purchase' | 'redemption' | 'switch_in' | 'switch_out' | 'stp_in' | 'stp_out' | 'dividend' | 'bonus'")
    units: float = Field(description="Number of units transacted (always positive)")
    nav: float = Field(description="NAV at which transaction occurred")
    amount: float = Field(description="Transaction amount in INR")
    balance_units: float = Field(description="Running unit balance after this transaction")


class CASLot(BaseModel):
    """A single purchase lot within a folio — used for ELSS lock-in tracking."""
    purchase_date: str = Field(description="Purchase date in YYYY-MM-DD format")
    units: float = Field(description="Units in this lot")
    nav: float = Field(description="Purchase NAV")
    amount: float = Field(description="Purchase amount in INR")
    lock_in_expiry: Optional[str] = Field(None, description="Lock-in expiry date YYYY-MM-DD (ELSS only)")
    is_locked: Optional[bool] = Field(None, description="True if still within lock-in period")


class CASFolio(BaseModel):
    """A single fund folio within the CAS."""
    fund_name: str = Field(description="Full scheme name e.g. 'Axis Long Term Equity Fund Direct Growth'")
    fund_house: str = Field(description="AMC name e.g. 'Axis Mutual Fund'")
    folio_number: str = Field(description="Folio number")
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
    fund_category: str = Field(description="SEBI category: 'equity_large_cap' | 'equity_mid_cap' | 'equity_small_cap' | 'equity_flexi_cap' | 'equity_multi_cap' | 'elss' | 'index' | 'etf_equity' | 'aggressive_hybrid' | 'balanced_advantage' | 'conservative_hybrid' | 'debt' | 'liquid' | 'gold' | 'international' | 'fof' | 'unknown'")
    is_equity_oriented: bool = Field(description="True if domestic equity allocation >65%")
    exit_load_pct: float = Field(0.0, description="Exit load percentage (e.g. 1.0 for 1%)")
    has_bonus_units: bool = Field(False, description="True if bonus units were allotted in the last 9 months")
    has_recent_dividend: bool = Field(False, description="True if dividend paid in the last 9 months")
    sec_94_7_applies: bool = Field(False, description="Section 94(7) bonus stripping — loss disallowed if True")
    sec_94_8_applies: bool = Field(False, description="Section 94(8) dividend stripping — loss disallowed if True")
    grandfathering_applicable: bool = Field(False, description="True if any units were purchased before Feb 1 2018 (Section 112A grandfathering)")
    fmv_jan31_2018: Optional[float] = Field(None, description="NAV as on Jan 31 2018 for grandfathering (if applicable)")


class CASResult(BaseModel):
    """Complete parsed result from a CAS PDF."""
    investor_name: str
    pan: str
    cas_generation_date: str = Field(description="Date the CAS was generated, YYYY-MM-DD")
    statement_period_from: str = Field(description="Statement period start YYYY-MM-DD")
    statement_period_to: str = Field(description="Statement period end YYYY-MM-DD")
    folios: list[CASFolio]
    total_portfolio_value: float
    total_invested: float
    total_unrealised_gain: float
    total_realised_ltcg_fy: float
    total_realised_stcg_fy: float
    total_realised_ltcl_fy: float
    total_realised_stcl_fy: float
    cas_type: str = Field(description="'detailed' or 'summary'")
    registrar: str = Field(description="'CAMS' | 'KFintech' | 'combined'")


# ── Broker Tax P&L ────────────────────────────────────────────────────────────

class BrokerTrade(BaseModel):
    """A single delivery-based trade contributing to realised P&L."""
    scrip_name: str
    isin: Optional[str] = None
    buy_date: str = Field(description="YYYY-MM-DD")
    sell_date: str = Field(description="YYYY-MM-DD")
    quantity: float
    buy_price: float
    sell_price: float
    gain_loss: float = Field(description="Positive = gain, negative = loss")
    holding_days: int
    is_long_term: bool = Field(description="True if held >12 months (equity) or >24 months (non-equity pre-Apr 2023)")
    asset_class: str = Field(description="'equity' | 'equity_etf' | 'non_equity_etf' | 'reit' | 'invit' | 'unknown'")


class BrokerPLResult(BaseModel):
    """Parsed result from a broker Tax P&L report."""
    broker_name: str = Field(description="Detected broker name")
    fy: str = Field(description="Financial year e.g. '2025-26'")
    total_ltcg: float = Field(0.0, description="Total long-term capital gains (equity)")
    total_stcg: float = Field(0.0, description="Total short-term capital gains (equity)")
    total_ltcl: float = Field(0.0, description="Total long-term capital losses (positive magnitude)")
    total_stcl: float = Field(0.0, description="Total short-term capital losses (positive magnitude)")
    has_intraday: bool = Field(False, description="Whether intraday trades were detected and excluded")
    has_fno: bool = Field(False, description="Whether F&O trades were detected and excluded")
    trades: list[BrokerTrade] = Field(default_factory=list, description="Individual delivery-based trades")


# ── Broker Holdings ───────────────────────────────────────────────────────────

class HoldingLot(BaseModel):
    """A single purchase lot within a stock holding."""
    buy_date: str = Field(description="YYYY-MM-DD")
    quantity: float
    buy_price: float
    current_price: float
    gain_loss_per_unit: float
    holding_days: int
    is_long_term: bool


class StockHolding(BaseModel):
    """A single stock/ETF holding with lot-level detail."""
    scrip_name: str
    isin: Optional[str] = None
    symbol: Optional[str] = None
    exchange: Optional[str] = Field(None, description="'NSE' | 'BSE'")
    total_quantity: float
    current_price: float
    current_value: float
    total_invested: float
    unrealised_gain: float
    is_long_term: bool = Field(description="True if all lots are held >12 months")
    has_mixed_lots: bool = Field(False, description="True if some lots are LT and some are ST")
    lots: list[HoldingLot] = Field(default_factory=list)
    asset_class: str = Field(description="'equity' | 'equity_etf' | 'gold_etf' | 'non_equity_etf' | 'reit' | 'invit' | 'unknown'")
    corporate_action_flag: Optional[str] = Field(None, description="'bonus' | 'split' | 'rights' | None")


class BrokerHoldingsResult(BaseModel):
    """Parsed result from a broker Holdings export."""
    broker_name: str
    report_date: str = Field(description="Date of the holdings snapshot YYYY-MM-DD")
    holdings: list[StockHolding]
    total_portfolio_value: float
    total_invested: float
    total_unrealised_gain: float
    ltcg_eligible: list[str] = Field(default_factory=list, description="Scrip names with LTCG (held >12mo, in profit)")
    ltcl_candidates: list[str] = Field(default_factory=list, description="Scrip names with LTCL (held >12mo, at loss)")
    stcl_candidates: list[str] = Field(default_factory=list, description="Scrip names with STCL (held <12mo, at loss)")
    not_yet_ltcg_eligible: list[str] = Field(default_factory=list, description="Scrip names held <12mo in profit")


# ── ITR (Schedule CFL) ────────────────────────────────────────────────────────

class CFLTranche(BaseModel):
    """A single year's carry-forward loss tranche from Schedule CFL."""
    loss_fy: str = Field(description="FY in which the loss was incurred e.g. '2024-25'")
    expiry_fy: str = Field(description="FY in which this loss expires e.g. '2032-33'")
    ltcl: float = Field(0.0, description="Long-term capital loss (positive magnitude)")
    stcl: float = Field(0.0, description="Short-term capital loss (positive magnitude)")


class ITRResult(BaseModel):
    """Parsed Schedule CFL from an ITR PDF/JSON."""
    itr_type: str = Field(description="'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4' | 'unknown'")
    assessment_year: str = Field(description="e.g. '2025-26'")
    financial_year: str = Field(description="e.g. '2024-25'")
    schedule_cfl_found: bool
    tranches: list[CFLTranche] = Field(default_factory=list)
    total_ltcl_cf: float = Field(0.0, description="Sum of all LTCL carry-forward tranches")
    total_stcl_cf: float = Field(0.0, description="Sum of all STCL carry-forward tranches")
    filing_date: Optional[str] = Field(None, description="ITR filing date YYYY-MM-DD if detectable")
    is_itr1: bool = Field(False, description="True if ITR-1 (which cannot carry forward capital losses)")
