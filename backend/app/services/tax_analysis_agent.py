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
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


def _model_id() -> str:
    from ..core.model_config import model_config
    return model_config._data.get("tax_web_agent", {}).get("model", "gemini-3-flash-preview")


def _build_system_prompt() -> str:
    return """You are Minto Tax Bot — an expert Indian capital gains tax analyser embedded in the Minto web app.

You have been given:
1. The user's income and tax profile (INTAKE ANSWERS section)
2. The full extracted text from all their uploaded financial documents (TAX DOCUMENTS section)

Your job is to:
- Analyse the extracted document data to identify realised LTCG, STCG, LTCL, STCL figures
- Apply the correct Indian tax netting rules (Sections 70, 71, 72, 112A, 87A)
- Identify loss harvesting opportunities (positions with unrealised losses that can be booked)
- Identify gains harvesting opportunities (unrealised LTCG within the ₹1.25L exemption)
- Give a clear, actionable analysis in markdown

TAX RULES (FY 2025-26):
- Equity STCG rate: 20% (Section 111A, held ≤12 months)
- Equity LTCG rate: 12.5% (Section 112A, held >12 months, above ₹1.25L exemption)
- Non-equity STCG: slab rate (held ≤24 months, or any post-Apr 2023 debt fund regardless of period)
- Non-equity LTCG: 12.5% (held >24 months, purchased BEFORE Apr 2023 only)
- ₹1.25L LTCG exemption: applies ONLY to equity and equity-oriented funds (Section 112A)
- Netting order (Sections 70/71): STCL offsets higher-taxed STCG first (non-equity > equity), then spills to LTCG. LTCL offsets LTCG only (non-equity first).
- Carry-forward (Section 72): CF LTCL targets non-equity LTCG first (preserves ₹1.25L headroom). CF STCL targets remaining STCG first, then LTCG.
- No wash-sale rule in India: user can sell and repurchase the same fund/stock the same day.
- ELSS: 3-year lock-in from allotment date. Locked units cannot be redeemed.
- FOF/gold/international funds: non-equity treatment regardless of underlying.

IMPORTANT:
- Use **bold**, tables, and bullet lists — this is a web UI with full markdown support.
- Never recommend specific stocks or funds to buy.
- Never give buy/sell investment recommendations.
- When asked follow-up questions, reference the specific data from their tax documents.
- Quantify every recommendation: show the exact ₹ tax saving estimate.
- Always mention the March 31, 2026 deadline when relevant.
- Disclaimer: "This is informational — consult a CA for your final liability."
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
