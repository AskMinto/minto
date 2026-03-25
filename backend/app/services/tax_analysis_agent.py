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

Write in clear, plain English with markdown formatting. Do NOT output raw field names like
"equity_ltcg", "net_taxable_stcg", "open_positions_ltcg_potential" etc. Use human-readable
labels instead, e.g. "Equity LTCG", "Taxable STCG after set-off", "Unrealised LTCG in open positions".

Always produce your response in this order:

---

## Tax Summary

Open with 2-3 sentences summarising the user's tax position in plain English.

Then show a clean netting table:

| | Amount |
|---|---|
| Equity LTCG (realised) | ₹X |
| Equity STCG (realised) | ₹X |
| Equity LTCL (realised) | ₹X |
| Equity STCL (realised) | ₹X |
| Non-equity gains/losses | ₹X (or "None") |

Walk through each netting step in plain English (not bullet points with field names):
- "Your short-term losses of ₹X first offset your short-term gains of ₹Y, leaving..."
- Only include steps that are actually relevant (skip Step 2 if no carry-forward losses).

End with a clean summary box:

| | |
|---|---|
| **Net LTCG tax** | ₹X |
| **Net STCG tax** | ₹X |
| **Total estimated tax** | ₹X |
| **Exemption used** | ₹X of ₹1.25L |
| **Exemption remaining** | ₹X (can still book this much LTCG tax-free) |

---

## Action Plan

For each open position in the documents, evaluate:
1. Should it be sold before 31 March to harvest a loss?
2. Can the LTCG exemption headroom be used by selling + repurchasing?
3. Is it worth waiting for a better holding period (e.g. 11 months → wait 1 more)?

Render each action as a card using this exact markdown structure:

### [PRIORITY] ACTION_TYPE — Instrument Name
**What to do:** One sentence describing the specific action.
**Tax saving:** ₹X (or "Prevents ₹X future tax" / "Avoids ₹X tax if sold now")
**Why:** 2-3 sentences of clear reasoning referencing actual figures from their documents.
**Deadline:** March 31, 2026 — X days away. [Settlement note if urgent.]
**Watch out for:** One sentence caveat (exit load, lock-in, CA verification, etc.)

---

Action types and when to use them:
- **HARVEST_LOSS**: unrealised loss → sell to create a deductible loss, reinvest same day. HIGH if saving > ₹1,000.
- **BOOK_LTCG_EXEMPTION**: unrealised equity LTCG within the remaining exemption → sell + repurchase to permanently reset cost basis tax-free. HIGH if headroom > ₹10,000.
- **AVOID_SELL**: profitable position where selling now would be taxed heavily (FOF at slab, STCG instead of LTCG). Show the exact ₹ tax cost of selling now vs waiting.
- **UPGRADE_TERM**: position 11-11.5 months old with unrealised gain → wait for 12-month LTCG eligibility. Show ₹ saving from waiting. HIGH if saving > ₹5,000.
- **ELSS_REMINDER**: flag locked vs unlocked ELSS units clearly with unlock dates.

Sort actions: BOOK_LTCG_EXEMPTION and HARVEST_LOSS first, then AVOID_SELL, then UPGRADE_TERM, then ELSS_REMINDER.

---

## Deadline

End with an urgency callout based on days to March 31:
- >14 days: "⏰ X days left — you have time, but don't leave it to the last week."
- 7-14 days: "⏰ X days left — act soon. MF redemptions settle T+1, stocks T+2."
- <7 days: "🚨 Only X days left. Place orders today — cut-off times: equity MFs 3 PM, stocks 3:30 PM."

---

*This analysis is informational — consult a CA for your final tax liability.*
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
