"""Pydantic output schemas for the three tax-specialist Agno agents.

Used as output_schema on the Agno Agent instances in tax_agents.py.
Gemini returns structured JSON matching these schemas exactly.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Tax Narrator output ───────────────────────────────────────────────────────

class NarrationStep(BaseModel):
    """One step in the tax netting computation, rendered as a card."""
    title: str = Field(description="Step heading e.g. 'Step 1 — Current-year loss set-off (Sec 70)'")
    body: str = Field(description="Plain-English explanation of this step's figures and outcome")
    figures: list[str] = Field(
        default_factory=list,
        description="Key figures as formatted strings e.g. ['STCL ₹10,128 used against non-equity STCG ₹6,500']",
    )


class TaxNarration(BaseModel):
    """Human-readable narration of the capital gains computation."""
    headline: str = Field(description="One-line summary e.g. 'Your tax liability is ₹0 ✓'")
    liability_summary: str = Field(
        description="1-2 sentences explaining the total liability and why"
    )
    steps: list[NarrationStep] = Field(
        description="Each computation step as a card (Steps 1-4 from the tax engine)"
    )
    exemption_note: str = Field(
        description="Short explanation of how much of the ₹1.25L exemption was used and what remains"
    )
    disclaimer: str = Field(
        default="This analysis covers capital gains only. Surcharge and 4% cess not included. Consult a CA for your final liability."
    )
    deadline_message: str = Field(
        description="e.g. '7 days left until March 31, 2026. Act now to ensure T+1 settlement.'"
    )


# ── Harvest Advisor output ────────────────────────────────────────────────────

class HarvestAction(BaseModel):
    """A single recommended action (redeem or hold)."""
    action_type: str = Field(description="'book_loss_mf' | 'book_loss_stock' | 'book_gain_mf'")
    instrument_name: str = Field(description="Fund name or scrip name")
    instrument_type: str = Field(description="'mutual_fund' | 'stock' | 'etf'")
    amount_inr: float = Field(description="Approximate gain/loss amount in INR (positive)")
    loss_type: Optional[str] = Field(None, description="'STCL' | 'LTCL' (for loss actions)")
    tax_saved_inr: float = Field(0.0, description="Tax saved this year (₹) by this action")
    cf_value_inr: float = Field(0.0, description="Carry-forward value (₹) for future years")
    exit_load_note: Optional[str] = Field(None, description="e.g. 'Nil exit load ✓' or '1% exit load — deducted'")
    deadline_note: Optional[str] = Field(None, description="e.g. 'Place order before 3:00 PM on March 31'")
    priority: int = Field(1, description="1 = highest priority, 5 = lowest")
    rationale: str = Field(description="1-sentence reason for this action")


class HarvestPlan(BaseModel):
    """Prioritised loss + gains harvesting action plan."""
    mode: str = Field(description="'tax_saving' if total_tax > 0 else 'carry_forward_building'")
    total_tax_saved_inr: float = Field(description="Total tax saved this year from all actions")
    total_cf_built_inr: float = Field(description="Total carry-forward losses built")
    gains_harvest_target_inr: float = Field(
        0.0,
        description="Target gains to book using remaining LTCG exemption (₹)"
    )
    actions: list[HarvestAction] = Field(description="Prioritised list of recommended actions")
    reinvestment_note: str = Field(
        description="When and how to reinvest: loss harvest = same day; gains harvest = April 1 2026"
    )
    itr_filing_reminder: str = Field(
        description="Reminder to file ITR-2/ITR-3 before July 31 2026 to carry forward losses"
    )
    gaar_caveat: Optional[str] = Field(
        None,
        description="GAAR note for stocks if relevant"
    )
