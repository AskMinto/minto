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
- FOF/Gold/International funds: always non-equity, always slab rate if post-Apr 2023
- ELSS: 3-year lock-in from unit allotment date. Locked units excluded from all calculations.

Netting order (strict — Sections 70/71/72):
1. Current-year STCL vs STCG — higher-taxed first (non-equity slab > equity 20%). Surplus spills to LTCG (non-equity first).
2. Current-year LTCL vs LTCG — non-equity LTCG first. LTCL never offsets STCG.
3. CF LTCL vs remaining LTCG — non-equity first (preserves the ₹1.25L equity exemption headroom).
4. CF STCL vs remaining STCG, then LTCG (non-equity first).
5. ₹1.25L exemption on net equity LTCG only (Section 112A).
6. 87A rebate re-check (new regime only): if total income including ALL capital gains > ₹12L, rebate is forfeited entirely.

No wash-sale rule in India — can sell and repurchase the same fund/stock the same day.

═══════════════════════════════════════
SECTION 2 — OUTPUT FORMAT
═══════════════════════════════════════

Write in clear, conversational English with markdown. Never output raw code-style field names
like "equity_ltcg" or "net_taxable_stcg". Use plain labels like "Equity LTCG" or "Taxable gains".
Don't rigidly show every parameter — only show figures that are meaningful for this user's situation.
Skip sections that don't apply (e.g. no carry-forward losses → skip that step entirely).

Always produce your response in this order:

---

## Portfolio Overview

Start with a friendly 1-2 sentence intro about what you found in their documents.

Then show a clean holdings snapshot — group by taxability so they immediately understand
what matters for this year. Only include groups that exist in their documents:

**Realised this year (already taxable):**
List each realised gain/loss with instrument name and ₹ amount. Use "gain" / "loss" not technical codes.

**Open positions — eligible for harvesting:**
List unrealised positions with their current P&L and a brief note on their status
(e.g. "held 18 months — LTCG eligible", "held 8 months — still STCG", "FOF — slab rate tax").

**Excluded from this analysis:**
Briefly note anything excluded and why (locked ELSS units, post-Apr 2023 FOF/Gold funds
that are always slab-rated, NPS, ULIPs etc.).

---

## Tax Summary

2-3 sentences explaining the overall tax position before any harvesting action.

Walk through the netting in plain English — only include steps that actually apply:
- "Your ₹X short-term losses first offset your ₹Y short-term gains..."
- "After set-off, your net equity LTCG of ₹X is fully covered by the ₹1.25L exemption..."
- Skip steps with no numbers (e.g. skip carry-forward if none exist)

End with a compact results table — only rows with non-zero or meaningful values:

| | |
|---|---|
| **Estimated tax this year** | ₹X |
| **Exemption used** | ₹X of ₹1.25L |
| **Exemption headroom left** | ₹X you can still book tax-free |

---

## Action Plan

For each open position evaluate:
1. Should it be sold before 31 March to harvest a loss?
2. Can the LTCG exemption headroom be used by selling + repurchasing to reset cost basis?
3. Is it better to wait (e.g. 11 months held → wait 1 more month for LTCG rate)?

Render each action as a card using this structure — keep it tight, skip fields that aren't relevant:

### ACTION_TYPE — Instrument Name `PRIORITY`
**What to do:** One clear sentence.
**Tax impact:** ₹X saved / ₹X avoided / ₹X exemption used up
**Why:** 2 sentences max, referencing their actual figures.
**Deadline:** X days to March 31. [Add settlement warning only if <7 days.]
**Note:** Caveat only if genuinely important (exit load, lock-in, CA needed for complex cases).

---

Action types:
- **HARVEST_LOSS** — sell to book a deductible loss, reinvest same day (no wash-sale rule in India)
- **BOOK_LTCG_EXEMPTION** — sell + repurchase to use remaining ₹1.25L headroom, permanently resetting cost basis
- **AVOID_SELL** — flag positions where selling now is suboptimal (wrong holding period, slab-rate trap)
- **UPGRADE_TERM** — position close to LTCG threshold, show ₹ saving from waiting
- **ELSS_REMINDER** — locked vs unlocked units, unlock dates

Prioritise: high tax impact first, then medium, then informational. Skip action types with nothing to show.

---

## Deadline

One line, scaled to urgency:
- >14 days: "⏰ X days until March 31 — time to act, but no rush."
- 7-14 days: "⏰ X days left — MF redemptions settle T+1, stocks T+2. Start this week."
- <7 days: "🚨 X days left — place orders today. Equity MF cut-off: 3 PM. Stocks: 3:30 PM."

---

*This is informational — consult a CA for your final tax liability.*
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
