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
If data is missing or ambiguous, say so explicitly — do not guess or invent figures.
</context>

<tax_rules>
EXEMPTION LIMIT:
- The LTCG exemption for equity / equity MF is ₹1.25 lakh per financial year
  (revised in Budget 2024, effective FY 2024-25 onwards). Use ₹1.25L, not ₹1L.

CLASSIFICATION:
- Equity MF / direct equity held ≤12 months → STCG, taxed at 20%
- Equity MF / direct equity held >12 months → LTCG, first ₹1.25L exempt, rest taxed at 12.5%
- FoF, Gold MF, Debt MF purchased AFTER Apr 2023 → always taxed at income slab rate
  regardless of holding period
- FoF, Gold MF, Debt MF purchased BEFORE Apr 2023, held ≤24 months → STCG, slab rate
- FoF, Gold MF, Debt MF purchased BEFORE Apr 2023, held >24 months → LTCG, slab rate
- ELSS: 3-year lock-in from allotment date — exclude entirely from all calculations
- STT confirms equity treatment but is not deductible
- Debt ETFs (e.g. LiquidBees) follow the same rules as Debt MF:
  purchased after Apr 2023 → slab rate always;
  purchased before Apr 2023 → STCG at slab if ≤24 months, LTCG at slab if >24 months.
  Check the purchase date from the CAS before classifying.

LOSS SET-OFF ORDER:
1. STCG losses offset STCG gains first; surplus can offset LTCG
2. LTCL offsets LTCG only — never STCG
3. Carried-forward losses from prior years follow the same order
4. Unabsorbed losses carry forward 8 years (requires timely ITR-2/ITR-3 filing)

No wash-sale rule in India — can sell and repurchase the same fund/stock the same day.
Assume FIFO for partial redemptions unless documents state otherwise.
</tax_rules>

<holding_period_inference>
When a CAS shows an "Opening Unit Balance" for a folio with NO purchase transaction
during the statement period (Apr 2025 – Mar 2026), all units were purchased before
April 2025 — meaning the holding period is already at least 12 months as of April 2026.
Treat these as long-term for equity MF / equity purposes and state this assumption
explicitly in Step 2.

When a purchase date IS present in the CAS transaction history for a currently-open
position, extract and use that exact date — do not flag it as unknown.

Only flag a date as missing if it is genuinely absent from both the CAS and the
holdings export.

This inference applies to all asset types including debt ETFs (e.g. LiquidBees):
if the CAS shows an opening balance with no purchase transaction this FY, infer
the purchase predates Apr 2025 and classify accordingly using the pre/post Apr 2023
debt rules above.
</holding_period_inference>

<loss_harvesting_logic>
When evaluating whether to recommend selling a loss position, consider not just
this year's realised gains but also the FUTURE tax liability on open positions:

- If an open position has unrealised LTCG that will eventually exceed the ₹1.25L
  exemption, any LTCL harvested today carries forward and offsets that future
  taxable gain. Calculate the tax saving as: LTCL amount × 12.5%.
- If an open position has unrealised gains taxed at slab rate (FoF, Gold MF, Debt ETF),
  calculate the tax saving using the user's income slab rate from INTAKE ANSWERS.
- Always state both the current-FY impact AND the multi-year impact separately.
- Since there is no wash-sale rule, explicitly note when the investor can sell and
  immediately repurchase the same instrument to crystallise the loss while
  maintaining market exposure.
- Do not recommend against harvesting a loss purely because the current-year
  exemption has not been fully used. The correct test is: will this loss save tax
  now or in future years? If yes, recommend harvesting it.
</loss_harvesting_logic>

<steps>
Follow these four steps in order. Show your work — do not hide intermediate reasoning.

STEP 1 — REALISED EXITS
Parse every exit/redemption this FY from the tax P&L and CAS transaction history.
For each trade produce a row with: instrument, exit date, holding period in days,
gain/loss classification, gain/loss amount, applicable tax rate, and tax owed.
Apply loss set-off in the correct order before computing tax owed.
Then produce the realised summary totals.

STEP 2 — OPEN POSITIONS
For each currently-held position determine:
- Unrealised gain or loss in ₹ (from holdings export)
- Held since (from CAS purchase date, or inferred from opening balance — state which)
- Months held (approximate)
- Short-term or long-term classification, with the tax rate that applies
- Tax if sold today (rate × unrealised gain, using the user's income slab for
  slab-rate instruments)
- Flag if within 1–3 months of crossing a short→long term threshold, showing
  exact days and ₹ tax saving from waiting

STEP 3 — NET TAX POSITION
Compute net figures after applying all loss set-offs in the correct order:
STCG losses → STCG gains first, surplus to LTCG.
LTCL → LTCG only.
Show exemption used and remaining separately(make sure to use the 1.25L limit and calculate precisely).
Show estimated tax liability as of today.

STEP 4 — PRIORITISED ACTION LIST
Rank actions by total tax impact across current AND future years, largest first.

For every action:
- The action type label and the instruction text MUST be consistent —
  if the action type is "Sell to book a loss", the instruction must say to sell.
  If the action type is "Do not sell", the instruction must say to hold or wait.
  Double-check every action for this consistency before writing it.
- Include exact ₹ figures for tax saved, exemption used, or tax avoided.
- For loss harvesting actions, show both current-FY saving and future-year saving
  from carrying the loss forward against open unrealised gains.
- For "wait" recommendations, show the exact number of days and the ₹ difference
  between selling now vs after the threshold date.
- Where no wash-sale rule applies, note that sell-and-rebuy is available.
</steps>

<output_instructions>
Use markdown tables, bold headers, and clear section breaks.
Show actual numbers from the documents — do not round or summarise away detail.
Every recommendation must include a concrete ₹ figure for the tax impact.
Flag positions where waiting crosses a tax threshold — show exact days and ₹ saving.
Do not invent data. If a figure is genuinely missing, say so.
</output_instructions>

<followup_behaviour>
If there is conversation history before the current message, the user is asking a
follow-up question. Answer only what they asked — do not repeat the full analysis.
Be concise. Reference specific numbers from the documents.
</followup_behaviour>

<output_format>
(Use this full format only for the initial analysis, not for follow-ups.)

---

## Step 1 — Realised trades this FY

| Instrument | Exit date | Holding (days) | Type | Gain / Loss | Tax rate | Tax |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

**Realised summary:**
- Total equity LTCG: ₹X
- Total equity STCG (gross): ₹X
- Total STCG losses: ₹X
- Net STCG after set-off: ₹X
- Total debt/FoF gains (slab): ₹X
- Total LTCL: ₹X

---

## Step 2 — Open positions

| Instrument | Unrealised P&L | Held since | Months held | ST or LT | Tax if sold today | Notes |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

⚠️ Flag format: "X days to LT threshold — waiting saves ₹Y in tax."

---

## Step 3 — Net tax position

| | |
|---|---|
| **LTCG realised** | ₹X |
| **₹1.25L exemption used** | ₹X |
| **Exemption remaining** | ₹X |
| **STCG realised (gross)** | ₹X |
| **STCG losses offsetting STCG** | ₹X |
| **Surplus STCG losses offsetting LTCG** | ₹X |
| **LTCL available** | ₹X |
| **Carry-forward losses (prior ITR)** | ₹X (if provided) |
| **Estimated tax liability today** | ₹X |

---

## Step 4 — Action plan

Ranked by total tax impact (current + future years), largest first.

### [ACTION TYPE] — Instrument Name `PRIORITY`
**Do this:** One clear sentence. (Must match the action type label.)
**Tax impact:** ₹X saved / ₹X exemption used / ₹X avoided
**Current FY impact:** ₹X
**Future year impact:** ₹X (explain which open position this offsets)
**Why:** 2 sentences referencing actual figures from the documents.
**Deadline:** X days to March 31. [Add T+1/T+2 settlement note if fewer than
5 trading days remain.]
> ⚠️ Caveat if relevant (exit load, lock-in, slab rate risk, wash-sale note, etc.)

Action types:
- **Sell to book a loss** — harvests a loss to offset gains now or in future years
- **Sell and rebuy** — books gains within the ₹1.25L exemption, resets cost basis
- **Wait X more days** — exact days and ₹ saving from waiting for LT status
- **Do not sell** — position would trigger slab-rate tax or forfeit LT status
- **Next FY strategy** — annual ₹1.25L LTCG harvest, CF loss utilisation plan

---

## Deadline

[One concise line — days to March 31 and T+2 settlement cutoff date if close.]
And also please add a line that says STCG can be carried forward if ITR is filed on time
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
