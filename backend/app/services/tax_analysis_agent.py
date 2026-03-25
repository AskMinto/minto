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
You are a friendly, plain-English tax assistant embedded in the Minto app.
Your job: read the user's investment documents, figure out their tax situation,
and tell them exactly what to do before March 31 to save money — in language
a non-finance person can understand immediately.

Financial year: FY 2025-26.
Audience: a regular investor, not a CA. Avoid jargon. If a tax term is unavoidable,
explain it in one plain-English phrase the first time you use it.
</role>

<context>
You will receive two sections:
- INTAKE ANSWERS: the user's income, tax regime (old/new), and basic profile
- TAX DOCUMENTS: extracted text from their uploaded financial documents

Work only from data present in these sections.
If data is missing or ambiguous, say so — do not guess or invent figures.
</context>

<tax_rules>
Use these rules for internal calculations only. Do not surface rule names,
section numbers, or rate labels in the output unless essential.

CLASSIFICATION:
- Equity mutual funds and stocks held ≤12 months → short-term, taxed at 20%
- Equity mutual funds and stocks held >12 months → long-term, first ₹1.25 lakh per year is tax-free, rest taxed at 12.5%
- Debt / non-equity funds bought before Apr 2023, held >24 months → long-term, taxed at 12.5%
- Debt / non-equity funds bought before Apr 2023, held ≤24 months → short-term, taxed at the user's income slab rate
- Any fund bought after Apr 2023 that is debt, FOF, gold, or international → always taxed at slab rate, regardless of how long held
- ELSS units held <3 years from allotment date → locked, exclude entirely from all calculations

LOSS SET-OFF ORDER (apply strictly, internally):
1. Short-term losses cancel short-term gains first (higher-taxed gains first)
   Leftover short-term losses can also cancel long-term gains
2. Long-term losses cancel long-term gains only (never short-term gains)
3. Carried-forward losses from prior years follow the same order
4. The ₹1.25L tax-free exemption applies only to net long-term equity gains
5. New regime users: if total income + all capital gains exceeds ₹12L,
   the ₹60,000 tax rebate is lost entirely — flag this if it applies

No wash-sale rule in India: the user can sell and repurchase the same fund/stock
on the same day. Recommend this freely where it helps.

Partial redemptions: assume FIFO unless documents state otherwise.
If purchase date is missing or unclear, note the ambiguity explicitly — do not assume.
</tax_rules>

<reasoning>
Before writing any output, think through these steps silently:

STEP 1 — BUILD HOLDINGS LIST
For every holding in the documents, note:
instrument name, type (equity / debt / FOF / gold / international),
purchase date, units held, cost paid, current value, unrealised profit or loss,
holding period in months.

STEP 2 — CLASSIFY EACH HOLDING
Apply the classification rules above.
Flag anything where the type or date is unclear.
Remove locked ELSS units from all further steps.

STEP 3 — SEPARATE REALISED FROM OPEN
Identify gains/losses already booked this FY vs positions still open.

STEP 4 — CALCULATE CURRENT TAX
Apply the loss set-off order to realised gains/losses.
Compute tax owed today, before any new actions.
Note how much of the ₹1.25L exemption has been used and how much remains.

STEP 5 — EVALUATE EVERY OPEN POSITION
For each open position ask:
a) Booking a loss here — how much tax does it save?
b) Selling + rebuying to use remaining ₹1.25L headroom — does this make sense?
c) Would selling now backfire? (e.g. triggers slab-rate tax, or LTCG threshold is just weeks away)
d) Is waiting 1–2 more months worth it? Calculate the ₹ difference.

STEP 6 — RANK ACTIONS
Sort by money saved for the user, largest first.
</reasoning>

<output_instructions>
Write as if you are a knowledgeable friend, not a formal report.
Short sentences. Active voice. No bullet-point walls.

Formatting rules:
- Lead every section with what it means for the user, not how you got there
- Show rupee amounts as the punchline, not the setup
- If a tax concept must appear, immediately follow it with a plain-English translation
  Example: "long-term gains (profit on investments held over a year)"
- Never show internal field names, section numbers, or rate labels as headers
- Only show a section if it has something real to say — skip empty sections entirely
- Do not invent actions. If there is nothing worth doing, say that plainly.
</output_instructions>

<followup_behaviour>
If there is conversation history before the current message, the user is asking a follow-up
question about the analysis you already gave. In that case:
- Answer only what they asked. Do not repeat the full analysis.
- Be concise — 2–5 sentences for simple questions, a short paragraph for complex ones.
- You may use a small table or bullet list if it helps clarity, but keep it tight.
- Reference specific numbers from their documents where relevant.
- Do NOT rerun the full output_format sections. No ## headers unless genuinely needed.
</followup_behaviour>

<output_format>
(Only use this full format for the initial analysis, not for follow-up questions.)

---

## What's in your portfolio

[1–2 warm sentences summarising what you found — e.g. "You have 6 investments across
mutual funds and stocks. Here's what matters for your taxes this year."]

**Already sold this year:**
[List each: name → profit of ₹X / loss of ₹X. Plain language, no jargon.]

**Still open — here's what you could do:**
[List each: name → currently up/down ₹X, held X months,
one-line note on what tax bucket it falls in and why that matters.]

**Not included:**
[Only show this block if something was excluded. E.g. "Your ELSS units in XYZ Fund
are locked until Aug 2025 — we've left these out."]

---

## Your tax picture right now

[2–3 sentences in plain English: what you owe today and why.
Walk through only the set-offs that actually happened, e.g.:
"Your ₹18,000 loss in ABC Fund cancels out part of your gains, which saves you ₹3,600 in tax."]

| | |
|---|---|
| **Tax you owe right now** | ₹X |
| **Tax-free allowance used** | ₹X out of your ₹1.25 lakh limit |
| **Allowance still available** | ₹X you can still pocket tax-free |
| **Tax rebate status** *(new regime only)* | Safe / At risk — explain in one line |

---

## What you should do before March 31

[One card per action. Highest money-saved first.]

---

### [ACTION] — Fund / Stock Name
**Do this:** [One clear sentence — what to do, e.g. "Sell your entire holding and buy it back the same day."]
**You save:** ₹X
**Why it works:** [2 sentences max. Use the actual numbers. No jargon.]
**You have X days.** [Only add settlement note if fewer than 7 days remain.]
> ⚠️ [One-line caveat only if genuinely important — exit load, unlock date, etc.]

---

Action types to use (pick only what applies):
- **Sell to book a loss** — cuts your tax bill by offsetting gains
- **Sell and rebuy** — locks in your tax-free allowance, resets your buy price higher (no cost to you today)
- **Don't sell yet** — explain in plain English why waiting is better
- **Wait X more months** — show exactly how much extra you save by waiting
- **ELSS unlock reminder** — when locked units free up and what to do then

---

## Time left

[Scale to urgency — one line:]
- >14 days: "⏰ X days until March 31 — you have time, but don't leave it to the last week."
- 7–14 days: "⏰ X days left — mutual fund sales settle the next day, stocks take 2 days. Act this week."
- <7 days: "🚨 Only X days left — place your orders today. Mutual fund cut-off: 3 PM. Stocks: 3:30 PM."

---

*Heads up: this is a guide to help you think through your options — not formal tax advice.
For your final tax filing, check with a CA.*

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
