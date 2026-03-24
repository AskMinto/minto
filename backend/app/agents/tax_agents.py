"""Three specialist Agno agents for the standalone Tax Saver web app.

Architecture: no Team/routing — the FastAPI layer orchestrates calls
directly, which is cleaner for a sequential wizard flow.

  cas_extractor        — parse MFCentral CAS PDF → CASResult
  broker_pl_extractor  — parse broker Tax P&L report → BrokerPLResult
  broker_holdings_extractor — parse broker holdings export → BrokerHoldingsResult
  itr_extractor        — parse ITR PDF/JSON → ITRResult
  tax_narrator         — turn tax_analysis dict → TaxNarration
  harvest_advisor      — turn candidates → HarvestPlan

All extractors use output_schema (structured output) and receive the document
inline via File(content=bytes).  No tools on extractor/narrator/advisor agents
to avoid the Gemini tools+output_schema conflict.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from agno.agent import Agent
from agno.models.google import Gemini

from ..core.config import GEMINI_API_KEY
from ..core.model_config import model_config
from ..whatsapp_bot.models import CASResult, BrokerPLResult, BrokerHoldingsResult, ITRResult
from .tax_schemas import TaxNarration, HarvestPlan

logger = logging.getLogger(__name__)

_MODEL_ID = model_config._data.get("whatsapp_bot", {}).get("model", "gemini-3-flash-preview")


def _gemini() -> Gemini:
    return Gemini(id=_MODEL_ID, api_key=GEMINI_API_KEY)


# ── Document extractor agents ─────────────────────────────────────────────────
# Each extractor receives a File(content=bytes) and returns a typed Pydantic model.
# No tools — output_schema conflicts with tool calls in Gemini.

_CAS_INSTRUCTIONS = [
    "You are a financial document parser. Extract structured data from this MFCentral / CAMS / KFintech Consolidated Account Statement (CAS) PDF.",
    "Return every field specified in the output schema. Use empty string '' for missing string fields, never null.",
    "For ELSS funds: lock_in_expiry = purchase_date + 3 years. is_locked = true if expiry is after today (2026-03-24).",
    "For equity-oriented funds (equity_large_cap, mid_cap, small_cap, flexi_cap, multi_cap, elss, index, etf_equity, aggressive_hybrid): set is_equity_oriented=true.",
    "For Section 112A grandfathering: if any lot purchased before Feb 1 2018, set grandfathering_applicable=true.",
    "Section 94(7): bonus stripping check. Section 94(8): dividend stripping check.",
    "Include ALL folios even if zero balance. fy_transactions: only transactions dated Apr 1 2025 or later.",
    "Return valid JSON only matching the output schema. No markdown, no commentary.",
]

cas_extractor = Agent(
    name="CAS Extractor",
    model=_gemini(),
    output_schema=CASResult,
    instructions=_CAS_INSTRUCTIONS,
    markdown=False,
)

_BROKER_PL_INSTRUCTIONS = [
    "You are a financial document parser. Extract delivery-based capital gains ONLY from this broker Tax P&L report.",
    "EXCLUDE: intraday equity trades (speculative, same-day buy+sell) and all F&O transactions.",
    "Detect broker name (Zerodha, Groww, Upstox, Angel One, ICICI Direct, or Other) and FY covered.",
    "For equity stocks and equity ETFs: is_long_term=true if held > 365 days.",
    "Return valid JSON only matching the output schema. No markdown, no commentary.",
]

broker_pl_extractor = Agent(
    name="Broker P&L Extractor",
    model=_gemini(),
    output_schema=BrokerPLResult,
    instructions=_BROKER_PL_INSTRUCTIONS,
    markdown=False,
)

_BROKER_HOLDINGS_INSTRUCTIONS = [
    "You are a financial document parser. Extract lot-level holdings from this broker Holdings export.",
    "For equity: is_long_term=true if ALL lots held > 365 days from buy_date to today (2026-03-24).",
    "Bonus shares: zero acquisition cost, holding period from allotment date.",
    "Stock splits: don't reset holding period, adjust per-share cost proportionally.",
    "Return valid JSON only matching the output schema. No markdown, no commentary.",
]

broker_holdings_extractor = Agent(
    name="Broker Holdings Extractor",
    model=_gemini(),
    output_schema=BrokerHoldingsResult,
    instructions=_BROKER_HOLDINGS_INSTRUCTIONS,
    markdown=False,
)

_ITR_INSTRUCTIONS = [
    "You are a financial document parser. Extract ONLY Schedule CFL (Carry Forward Losses) from this ITR.",
    "Extract all loss tranches: LTCL and STCL per FY with expiry year (losses carry forward 8 years).",
    "If no Schedule CFL found, return schedule_cfl_found=false and empty tranches.",
    "If ITR-1: is_itr1=true (ITR-1 cannot carry forward capital losses).",
    "Return valid JSON only matching the output schema. No markdown, no commentary.",
]

itr_extractor = Agent(
    name="ITR Extractor",
    model=_gemini(),
    output_schema=ITRResult,
    instructions=_ITR_INSTRUCTIONS,
    markdown=False,
)


# ── Tax Narrator agent ────────────────────────────────────────────────────────

_TAX_NARRATOR_INSTRUCTIONS = [
    "You are a tax analysis narrator for Indian retail investors.",
    "You receive the raw output of a capital gains tax computation (JSON) and must produce a clear, human-readable narration.",
    "Explain each computation step in plain English — what losses were set off against which gains, why, and what the outcome is.",
    "Highlight when carry-forward losses were applied to non-exempt gains first (non-equity LTCG before equity LTCG) — this is the smart optimisation.",
    "Use Indian currency formatting: ₹1,25,000 not Rs 125000.",
    "Be warm, clear, and concise. Avoid jargon.",
    "Return valid JSON matching the TaxNarration output schema.",
]

tax_narrator = Agent(
    name="Tax Narrator",
    model=_gemini(),
    output_schema=TaxNarration,
    instructions=_TAX_NARRATOR_INSTRUCTIONS,
    markdown=False,
)


# ── Harvest Advisor agent ─────────────────────────────────────────────────────

_HARVEST_ADVISOR_INSTRUCTIONS = [
    "You are a tax harvesting advisor for Indian retail investors.",
    "You receive: tax analysis results, loss harvesting candidates (MF + stocks), gains harvesting candidates, and days to March 31.",
    "Produce a prioritised action plan — loss harvesting first (higher priority when tax > 0), then gains harvesting.",
    "For carry-forward building mode (tax = 0): recommend nil-exit-load MF losses only; explain CF value.",
    "For gains harvesting: equity-oriented MFs only (>65% domestic equity); compute harvestable amount vs remaining exemption.",
    "Reinvestment: loss harvest = same day; gains harvest = April 1 2026 (first business day FY 2026-27).",
    "Always include the ITR filing reminder: file ITR-2/ITR-3 before July 31 2026.",
    "Return valid JSON matching the HarvestPlan output schema.",
]

harvest_advisor = Agent(
    name="Harvest Advisor",
    model=_gemini(),
    output_schema=HarvestPlan,
    instructions=_HARVEST_ADVISOR_INSTRUCTIONS,
    markdown=False,
)


# ── Helper: run extractor with a File inline ──────────────────────────────────

async def extract_document(
    agent: Agent,
    pdf_bytes: bytes,
    prompt: str,
) -> Any:
    """Run a document extractor agent with PDF bytes passed inline.

    Uses asyncio.to_thread for the blocking Agno/Gemini SDK call.
    Returns the typed .content of the RunOutput.
    """
    from agno.media import File as AgnoFile

    def _run():
        result = agent.run(
            prompt,
            files=[AgnoFile(content=pdf_bytes)],
        )
        return result.content if result else None

    return await asyncio.to_thread(_run)


async def narrate_tax_analysis(tax_analysis: dict, session_state: dict) -> TaxNarration | None:
    """Run the Tax Narrator agent to produce a human-readable narration."""
    import json
    from ..whatsapp_bot.tax_engine import days_to_deadline

    days = days_to_deadline()
    prompt = (
        f"Tax computation results (JSON):\n{json.dumps(tax_analysis, indent=2)}\n\n"
        f"Session context:\n"
        f"- Tax regime: {session_state.get('tax_regime')}\n"
        f"- Slab rate: {session_state.get('slab_rate')}\n"
        f"- Portfolio type: {session_state.get('portfolio_type')}\n"
        f"- Carry-forward used: {bool(session_state.get('itr_parsed'))}\n"
        f"- Days to March 31 deadline: {days}\n"
    )

    def _run():
        result = tax_narrator.run(prompt)
        return result.content if result else None

    return await asyncio.to_thread(_run)


async def build_harvest_plan(
    tax_analysis: dict,
    loss_mf: list,
    loss_stocks: list,
    gains_mf: list,
    session_state: dict,
) -> HarvestPlan | None:
    """Run the Harvest Advisor agent to produce a prioritised action plan."""
    import json
    from ..whatsapp_bot.tax_engine import days_to_deadline

    days = days_to_deadline()
    prompt = (
        f"Tax analysis summary:\n{json.dumps(_safe_tax_summary(tax_analysis), indent=2)}\n\n"
        f"Loss candidates (MF):\n{json.dumps(loss_mf, indent=2)}\n\n"
        f"Loss candidates (stocks):\n{json.dumps(loss_stocks, indent=2)}\n\n"
        f"Gains candidates (MF):\n{json.dumps(gains_mf, indent=2)}\n\n"
        f"Days to March 31 deadline: {days}\n"
        f"Base tax liability: ₹{tax_analysis.get('total_tax', 0):,.0f}\n"
        f"Exemption remaining: ₹{tax_analysis.get('exemption_remaining', 0):,.0f}\n"
    )

    def _run():
        result = harvest_advisor.run(prompt)
        return result.content if result else None

    return await asyncio.to_thread(_run)


def _safe_tax_summary(tax_analysis: dict) -> dict:
    return {
        "total_tax": tax_analysis.get("total_tax"),
        "exemption_used": tax_analysis.get("exemption_used"),
        "exemption_remaining": tax_analysis.get("exemption_remaining"),
        "slab_rate": tax_analysis.get("slab_rate"),
        "realised": tax_analysis.get("realised"),
        "tax": tax_analysis.get("tax"),
        "step4_87a": tax_analysis.get("step4_87a"),
        "optimal_vs_naive_saving": tax_analysis.get("optimal_vs_naive_saving"),
        "cf_ltcl_remaining": tax_analysis.get("cf_ltcl_remaining"),
        "cf_stcl_remaining": tax_analysis.get("cf_stcl_remaining"),
    }
