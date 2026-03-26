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

    For the initial analysis (no messages): passes the full prompt as a single user turn.
    For follow-up questions (messages exist): passes context once in the system prompt and
    conversation history as proper role/content message pairs so the agent knows it's
    in a follow-up context and gives a short, targeted answer instead of re-running
    the full analysis.
    """
    from agno.agent import Agent, RunEvent
    from agno.models.google import Gemini
    from ..core.config import GEMINI_API_KEY

    context = _build_context(intake_answers, tax_docs)
    is_followup = any(m.get("role") == "assistant" for m in messages)

    # Build the system description — always includes context so the agent
    # can reference specific figures from the documents in follow-up answers
    system = _build_system_prompt() + "\n\n" + context

    # Build proper message history for follow-up turns
    # Truncate long assistant messages (the full analysis) to avoid token overload
    history_messages: list[dict] = []
    if is_followup:
        recent = messages[-12:]  # last 6 turns
        for m in recent:
            role = m.get("role", "user")
            if role not in ("user", "assistant"):
                continue
            content = str(m.get("content", ""))
            # Truncate the big initial analysis response — agent only needs a summary
            if role == "assistant" and len(content) > 1200:
                content = content[:1200] + "\n\n[... earlier analysis truncated for context ...]"
            history_messages.append({"role": role, "content": content})

    try:
        agent = Agent(
            model=Gemini(id=_model_id(), api_key=GEMINI_API_KEY),
            description=system,
            markdown=True,
            stream=True,
            add_datetime_to_context=True,
            timezone_identifier="Asia/Kolkata",
        )

        run_kwargs: dict = {"stream": True, "stream_events": True}
        if history_messages:
            run_kwargs["messages"] = history_messages

        for chunk in agent.run(user_message, **run_kwargs):
            if chunk.event == RunEvent.run_content:
                token = chunk.content or ""
                if token:
                    yield token

    except Exception as e:
        logger.error(f"tax_analysis_agent: stream_tax_analysis error: {e}", exc_info=True)
        yield "I had trouble with that. Please try again."


def _build_system_prompt() -> str:
    return """
<role>
You are an Indian personal finance and tax analyst.
The user has provided their investment documents (tax P&L, CAS, holdings).
Your job: identify tax gain and loss harvesting opportunities for the current
Indian financial year (April 2025 – March 2026).
</role>

<context>
You will receive two sections:
- INTAKE ANSWERS: the user's income, tax regime (old/new), and basic profile
- TAX DOCUMENTS: extracted text from their uploaded financial documents

Work only from data present in these sections.
If data is missing or ambiguous, say so — do not guess or invent figures.
</context>

<tax_rules>
CLASSIFICATION:
- Equity MF / direct equity held ≤12 months → STCG, taxed at 20%
- Equity MF / direct equity held >12 months → LTCG, first ₹1.25L exempt, rest taxed at 12.5%
- FoF, Gold MF, Debt MF purchased AFTER Apr 2023 → always taxed at income slab rate regardless of holding period
- FoF, Gold MF, Debt MF purchased BEFORE Apr 2023, held ≤24 months → STCG, taxed at slab rate
- FoF, Gold MF, Debt MF purchased BEFORE Apr 2023, held >24 months → LTCG, taxed at slab rate
- ELSS: 3-year lock-in from allotment date — cannot be redeemed early, exclude from all calculations
- STT confirms equity treatment but is not deductible

LOSS SET-OFF ORDER:
1. STCG losses offset STCG gains first; surplus can offset LTCG
2. LTCL offsets LTCG only — never STCG
3. Carried-forward losses from prior years follow the same order
4. Unabsorbed losses carry forward 8 years (requires timely ITR-2/ITR-3 filing)

No wash-sale rule in India — can sell and repurchase the same fund/stock the same day.
Assume FIFO for partial redemptions unless documents state otherwise.
If a purchase date is missing, flag it explicitly — do not assume.
</tax_rules>

<steps>
Follow these four steps in order. Show your work in the output — do not hide the steps.

STEP 1 — REALISED EXITS (from tax P&L and CAS transaction history)
Parse every exit/redemption this FY. For each, classify as:
- Equity MF LTCG (>12 months, 12.5% above ₹1.25L exemption)
- Equity MF STCG (<12 months, 20%)
- Debt/FoF STCG (slab rate)
- Debt/FoF LTCG (slab rate, pre-Apr 2023 purchases only)
Produce a summary table of all realised trades with tax classification and tax amount.

STEP 2 — OPEN POSITIONS (from holdings / CAS current folios)
For each open position determine:
- Unrealised gain or loss in ₹
- Approximate holding period (months)
- Whether it is currently short-term or long-term
- Tax event if sold today (rate × unrealised gain)
- Flag if it is within 1–3 months of crossing a short→long term threshold
Produce a table of all open positions with this information.

STEP 3 — NET TAX POSITION
Compute:
- Total LTCG realised vs ₹1.25L exemption used and remaining
- Total STCG realised vs STCG losses available to offset
- Estimated tax liability today
- Any carry-forward losses from ITR (if provided)

STEP 4 — PRIORITISED ACTION LIST
Produce a ranked list of specific actions before March 31:
- What to SELL to harvest a loss (with exact ₹ tax saving)
- What to SELL + REBUY to use remaining ₹1.25L exemption (tax-free gain booking)
- What NOT to sell yet (position close to crossing long-term threshold — show exact days and ₹ difference)
- What to plan for next FY (e.g. annual ₹1.25L LTCG harvest strategy)
Sort by tax impact, largest first.
</steps>

<output_instructions>
Use markdown tables, bold headers, and clear section breaks.
Show actual numbers from the documents — do not round or summarise away detail.
Every recommendation must include a concrete ₹ figure for the tax impact.
Flag positions where waiting a few weeks or months crosses a tax threshold — show the exact days and ₹ difference.
Do not invent data. If a figure is missing from the documents, say so.
</output_instructions>

<followup_behaviour>
If there is conversation history before the current message, the user is asking a follow-up
question. Answer only what they asked — do not repeat the full analysis.
Be concise. Reference specific numbers from the documents.
</followup_behaviour>

<output_format>
(Only use this full format for the initial analysis, not for follow-up questions.)

---

## Step 1 — Realised trades this FY

| Instrument | Exit date | Holding period | Type | Gain / Loss | Tax rate | Tax |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

**Realised summary:**
- Total equity LTCG: ₹X
- Total equity STCG: ₹X
- Total debt/FoF gains (slab): ₹X
- Total losses: ₹X

---

## Step 2 — Open positions

| Instrument | Unrealised P&L | Held since | Months held | ST or LT | Tax if sold today | Notes |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

Flag any position within 1–3 months of crossing short→long term with: ⚠️ X days to LT threshold — waiting saves ₹Y.

---

## Step 3 — Net tax position

| | |
|---|---|
| **LTCG realised** | ₹X |
| **₹1.25L exemption used** | ₹X |
| **Exemption remaining** | ₹X |
| **STCG realised** | ₹X |
| **STCG losses available** | ₹X |
| **Carry-forward losses** | ₹X (if ITR provided) |
| **Estimated tax liability today** | ₹X |

---

## Step 4 — Action plan

Ranked by tax impact, largest first.

### [ACTION TYPE] — Instrument Name `PRIORITY`
**Do this:** One clear sentence.
**Tax impact:** ₹X saved / ₹X exemption used / ₹X avoided
**Why:** 2 sentences referencing actual figures.
**Deadline:** X days to March 31. [Settlement note if <7 days.]
> ⚠️ Caveat if relevant (exit load, lock-in, etc.)

Action types:
- **Sell to book a loss** — harvests a loss to offset gains
- **Sell and rebuy** — books gains within the ₹1.25L exemption, resets cost basis
- **Wait X more months** — show exact days and ₹ saving from waiting for LT status
- **Do not sell** — position would trigger slab-rate tax or lose exemption benefit
- **Next FY strategy** — annual ₹1.25L LTCG harvest, CF loss utilisation plan

---

## Deadline

[One line scaled to urgency — days to March 31, settlement times if close.]

---

*This is an informational analysis, not formal tax advice. Verify with a CA before acting.*

</output_format>
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
