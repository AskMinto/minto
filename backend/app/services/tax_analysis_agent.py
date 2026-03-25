"""Tax analysis agent — single Gemini agent that analyses uploaded tax documents.

Receives:
  - intake_answers: income slab, tax regime, brokers, carry-forward flag
  - tax_docs: dict of doc_key → extracted text (CSV/tables from PDF/XLSX)
  - messages: conversation history (for follow-up chat)
  - user_message: the current user message

Returns an async generator that yields SSE-ready text tokens.

Architecture:
  - Single stateless Agno Agent (Gemini Flash) — no Team routing needed here
  - Context is built per-call from intake_answers + tax_docs + history
  - Uses the existing tax_engine.py for deterministic computation
  - Streams word-by-word for smooth UX
"""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncGenerator, Iterator

logger = logging.getLogger(__name__)


def _model_id() -> str:
    from ..core.model_config import model_config
    return model_config._data.get("tax_web_agent", {}).get("model", "gemini-3-flash-preview")


def stream_tax_analysis(
    user_message: str,
    intake_answers: dict,
    tax_docs: dict,
    messages: list[dict],
) -> Iterator[str]:
    """Run the tax analysis agent with true streaming — yields tokens as Gemini produces them.

    Uses the same agent.run(stream=True, stream_events=True) + RunEvent.run_content
    pattern as research_agent.py. No fake word-splitting; tokens arrive in real time.
    """
    from agno.agent import Agent, RunEvent
    from agno.models.google import Gemini
    from ..core.config import GEMINI_API_KEY

    context = _build_context(intake_answers, tax_docs)
    history = _build_history_context(messages)

    full_user_message = ""
    if history:
        full_user_message += history + "\n\n"
    full_user_message += "## CONTEXT\n" + context + "\n\n"
    full_user_message += "## USER MESSAGE\n" + user_message

    try:
        agent = Agent(
            model=Gemini(id=_model_id(), api_key=GEMINI_API_KEY),
            description=_build_system_prompt(),
            markdown=True,
            stream=True,
            add_datetime_to_context=True,
            timezone_identifier="Asia/Kolkata",
        )

        for chunk in agent.run(full_user_message, stream=True, stream_events=True):
            if chunk.event == RunEvent.run_content:
                token = chunk.content or ""
                if token:
                    yield token

    except Exception as e:
        logger.error(f"tax_analysis_agent: stream_tax_analysis error: {e}", exc_info=True)
        yield "I had trouble analysing your documents. This is usually a temporary issue — please try again."


def _build_system_prompt() -> str:
    return """You are a senior Indian CA's tax harvesting assistant embedded in the Minto web app (FY 2025-26).

You have been given:
1. The user's income and tax profile (INTAKE ANSWERS section)
2. The full extracted text from all their uploaded financial documents (TAX DOCUMENTS section)

═══════════════════════════════════════
SECTION 1 — TAX RULES (FY 2025-26)
═══════════════════════════════════════

Rates:
- Equity STCG: 20% (Section 111A, held ≤12 months)
- Equity LTCG: 12.5% above ₹1.25L exemption (Section 112A, held >12 months)
- Non-equity STCG: slab rate (held ≤24 months, OR any post-Apr 2023 debt/specified fund regardless of period)
- Non-equity LTCG: 12.5% (held >24 months, purchased BEFORE Apr 2023 only)
- FOF/Gold/International funds: always non-equity treatment, always slab rate if post-Apr 2023
- ELSS: 3-year lock-in from unit allotment date. Locked units excluded from all calculations.

Netting order (strict):
1. Current-year STCL vs STCG — target higher-taxed STCG first (non-equity slab > equity 20%)
   If STCL > total STCG, remainder spills to LTCG (non-equity LTCG first)
2. Current-year LTCL vs LTCG — non-equity LTCG first. LTCL never offsets STCG.
3. CF LTCL vs remaining LTCG — non-equity first (no ₹1.25L exemption on non-equity)
4. CF STCL vs remaining STCG, then LTCG (non-equity first)
5. ₹1.25L exemption on net equity LTCG only (Section 112A)
6. 87A rebate re-check (new regime): if total income incl. ALL capital gains > ₹12L, rebate forfeited

No wash-sale rule in India — user can sell and repurchase the same fund/stock the same day.

═══════════════════════════════════════
SECTION 2 — REQUIRED OUTPUT STRUCTURE
═══════════════════════════════════════

Always produce your analysis in this exact order:

**1. TAX SUMMARY**
Show a step-by-step netting table:
- Realised figures: equity_ltcg, equity_stcg, equity_ltcl, equity_stcl, non_equity_ltcg, non_equity_stcg
- Step 1: Current-year set-off (Sec 70/71) — show which losses offset which gains
- Step 2: Carry-forward set-off (Sec 72) — if CF losses present
- Step 3: ₹1.25L exemption applied to net equity LTCG
- Step 4: 87A rebate check (if user selected ≤₹12L income slab)
- Final: net_taxable_ltcg, net_taxable_stcg, ltcg_tax, stcg_tax, total_tax
- exemption_remaining: how much more LTCG can still be booked tax-free this year
- open_positions_ltcg_potential: estimated unrealised LTCG on eligible positions
- open_positions_loss_potential: estimated unrealised losses on harvestable positions

**2. ACTION PLAN**
For each open position evaluate all three questions:
  a) Should it be sold before 31 March to harvest a loss?
  b) Can LTCG exemption headroom be used by selling + repurchasing?
  c) Is there a minimum holding period worth waiting for?

Produce a prioritised list of actions. Each action must include:

| Field | Description |
|---|---|
| action_type | One of: HARVEST_LOSS / BOOK_LTCG_EXEMPTION / AVOID_SELL / UPGRADE_TERM / ELSS_REMINDER |
| priority | HIGH / MEDIUM / LOW |
| instrument_name | Fund or stock name |
| current_pnl | Unrealised P&L in ₹ (negative = loss) |
| tax_saving_estimate | Concrete ₹ amount saved by taking this action |
| rationale | 1-2 sentences explaining why |
| suggested_deadline | Days remaining pressure (e.g. "March 31 — X days away") |
| caveat | Risks, wash-sale note, exit load, lock-in, CA verification needed |

Action type rules:
- **HARVEST_LOSS**: Position has unrealised loss → sell to create tax-deductible loss. Reinvest same day (no wash-sale rule). Priority HIGH if tax_saving_estimate > ₹1,000; MEDIUM if > ₹200; LOW if building CF loss bank (no current tax liability).
- **BOOK_LTCG_EXEMPTION**: Equity/equity-MF position with unrealised LTCG ≤ exemption_remaining → sell + repurchase to reset cost basis tax-free. Priority HIGH if exemption_remaining > ₹10,000; MEDIUM otherwise.
- **AVOID_SELL**: Position is profitable but selling now is suboptimal — e.g. FOF < 24 months (would be slab rate), stock < 12 months (would be STCG not LTCG). Show exact tax cost of selling now vs waiting.
- **UPGRADE_TERM**: Position held 11-11.5 months with unrealised gain → wait for 12-month LTCG eligibility. Show ₹ saving from waiting. Priority HIGH if tax saving > ₹5,000.
- **ELSS_REMINDER**: Flag ELSS funds — show locked units with unlock dates, unlocked units available for harvesting.

Sort actions by tax_saving_estimate descending (highest saving first).

**3. DEADLINE BANNER**
Always end with: "⏰ **X days until March 31, 2026.** [Urgency note based on days remaining]"
- >14 days: standard note
- 7-14 days: "Act soon — redemption + repurchase settlement takes 2-3 business days"
- <7 days: "URGENT — equity MF redemptions settle T+1, stocks T+2. Place orders today."

═══════════════════════════════════════
SECTION 3 — FORMATTING RULES
═══════════════════════════════════════

- Use **bold**, tables, and bullet lists — full markdown supported.
- Lead every section with a header (##).
- Quantify everything: every recommendation must show a ₹ figure.
- Never say "you should buy X" — describe tax implications only.
- When a position appears in the documents, use its exact name.
- If a figure cannot be computed from the documents, say so explicitly rather than estimating.
- End with: "*This analysis is informational — consult a CA for your final tax liability.*"
"""


def _build_context(intake_answers: dict, tax_docs: dict) -> str:
    """Build the context block injected before the user message."""
    lines = []

    # Intake answers
    lines.append("## INTAKE ANSWERS")
    lines.append(f"- Income slab: {intake_answers.get('income_slab', 'not provided')}")
    lines.append(f"- Tax regime: {intake_answers.get('tax_regime', 'not provided')}")
    lines.append(f"- Financial year: {intake_answers.get('financial_year', '2025-26')}")
    brokers = intake_answers.get("brokers") or []
    lines.append(f"- Brokers/platforms: {', '.join(brokers) if brokers else 'not specified'}")
    has_cf = intake_answers.get("has_carry_forward")
    lines.append(f"- Has carry-forward losses: {has_cf}")

    # Tax documents
    lines.append("\n## TAX DOCUMENTS")
    if not tax_docs:
        lines.append("No documents uploaded yet.")
    else:
        uploaded = {k: v for k, v in tax_docs.items() if v is not None}
        pending = [k for k, v in tax_docs.items() if v is None]

        if pending:
            lines.append(f"Still waiting for: {', '.join(pending)}")

        for doc_key, content in uploaded.items():
            lines.append(f"\n### {doc_key}")
            lines.append(content or "(no content extracted)")

    return "\n".join(lines)


def _build_history_context(messages: list[dict], n: int = 10) -> str:
    """Build a plain-text history block from the last N turns."""
    recent = messages[-(n * 2):]
    if not recent:
        return ""
    lines = ["--- CONVERSATION HISTORY ---"]
    for m in recent:
        role = m.get("role", "unknown").upper()
        content = str(m.get("content", ""))[:800]
        lines.append(f"{role}: {content}")
    lines.append("--- END HISTORY ---")
    return "\n".join(lines)


async def run_tax_analysis_stream(
    user_message: str,
    intake_answers: dict,
    tax_docs: dict,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """Run the tax analysis agent and yield text tokens as an async generator.

    Yields plain text chunks (not SSE-formatted — the router wraps them).
    Always yields at least one chunk — even on error — so the SSE stream
    closes gracefully instead of crashing the connection.
    """
    from agno.agent import Agent
    from agno.models.google import Gemini
    from ..core.config import GEMINI_API_KEY

    context = _build_context(intake_answers, tax_docs)
    history = _build_history_context(messages)

    full_user_message = ""
    if history:
        full_user_message += history + "\n\n"
    full_user_message += "## CONTEXT\n" + context + "\n\n"
    full_user_message += "## USER MESSAGE\n" + user_message

    full_response = ""
    try:
        agent = Agent(
            model=Gemini(id=_model_id(), api_key=GEMINI_API_KEY),
            description=_build_system_prompt(),
            markdown=True,
            stream=False,
        )
        result = await agent.arun(full_user_message)
        if result and hasattr(result, "content") and result.content:
            full_response = str(result.content)
        if not full_response:
            full_response = "Analysis complete — no content was returned. Please try again."
    except Exception as e:
        logger.error(f"tax_analysis_agent: agent error: {e}", exc_info=True)
        full_response = (
            "I had trouble analysing your documents. This is usually a temporary issue — "
            "please try again in a moment."
        )

    # Stream word-by-word — always yields something so the SSE connection closes cleanly
    words = full_response.split(" ")
    chunk_size = 4
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i : i + chunk_size])
        if i + chunk_size < len(words):
            chunk += " "
        yield chunk
        await asyncio.sleep(0)
