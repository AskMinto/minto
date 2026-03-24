"""Tax Harvest multi-agent team using Agno route-mode Team.

Architecture (PRD §4):
  OrchestratorAgent (route mode, gemini-3.1-pro-preview as router)
  ├── IntakeAgent          — conversation, collects context
  ├── DocumentRouterAgent  — detects file type, parses documents
  ├── NormalisationAgent   — confirms data, explains what was found
  ├── TaxComputationAgent  — runs LTCG/STCG/FOF/ELSS rules engine
  └── HarvestingAgent      — generates actionable recommendations

All agents — including the orchestrator/router — use gemini-3.1-pro-preview.
Session state is loaded before the team runs and saved back afterwards.
All specialist agents share the same tools (closure-bound to session_state).
The team leader uses route mode: exactly ONE specialist handles each turn.
"""

from __future__ import annotations

import asyncio
import logging

from agno.agent import Agent
from agno.models.google import Gemini
from agno.team import Team
from agno.team.mode import TeamMode

from ..core.config import GEMINI_API_KEY
from ..core.model_config import model_config
from ..core.prompts import prompts
from .tax_harvest_tools import make_tax_harvest_tools

logger = logging.getLogger(__name__)

# ── Model helper ──────────────────────────────────────────────────────────────

def _pro_model(temperature: float = 0.2) -> Gemini:
    """gemini-3.1-pro-preview — used for ALL agents including the team router."""
    cfg = model_config._data.get("tax_harvest_agent", {})
    model_id = cfg.get("model", "gemini-3.1-pro-preview")
    return Gemini(id=model_id, api_key=GEMINI_API_KEY, temperature=temperature)


# ── History helper ────────────────────────────────────────────────────────────

def _build_history_context(messages: list[dict], n: int = 10) -> str:
    recent = messages[-(n * 2):]
    if not recent:
        return ""
    lines = ["--- CONVERSATION HISTORY ---"]
    for m in recent:
        role = m.get("role", "unknown").upper()
        content = str(m.get("content", ""))[:600]
        lines.append(f"{role}: {content}")
    lines.append("--- END HISTORY ---")
    return "\n".join(lines)


# ── Agent builders ────────────────────────────────────────────────────────────

def _build_intake_agent(tools: tuple, session_state: dict) -> Agent:
    (
        save_intake_answer,
        get_days_to_tax_deadline,
        get_document_checklist,
        parse_uploaded_document,
        run_tax_computation,
        get_loss_harvest_plan,
        get_gains_harvest_plan,
        get_session_summary,
    ) = tools

    instructions = prompts.raw.get("tax_harvest_agent", {}).get("intake_agent_instructions", "")
    if not instructions:
        instructions = _DEFAULT_INTAKE_INSTRUCTIONS

    return Agent(
        name="IntakeAgent",
        role="Friendly conversational intake — collects income slab, tax regime, broker list, and other context before document collection",
        description=(
            "You are the Intake specialist for the Minto Tax Harvest system. "
            "Your job is to collect all required context fields from the user through friendly conversation before any documents are requested. "
            "You ask natural questions, present options as numbered lists, and call save_intake_answer after each confirmed answer."
        ),
        instructions=instructions,
        model=_pro_model(),
        tools=[save_intake_answer, get_days_to_tax_deadline, get_session_summary],
        session_state=session_state,
        add_session_state_to_context=True,
        add_history_to_context=False,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
        markdown=True,
    )


def _build_document_agent(tools: tuple, session_state: dict) -> Agent:
    (
        save_intake_answer,
        get_days_to_tax_deadline,
        get_document_checklist,
        parse_uploaded_document,
        run_tax_computation,
        get_loss_harvest_plan,
        get_gains_harvest_plan,
        get_session_summary,
    ) = tools

    instructions = prompts.raw.get("tax_harvest_agent", {}).get("document_agent_instructions", "")
    if not instructions:
        instructions = _DEFAULT_DOCUMENT_INSTRUCTIONS

    return Agent(
        name="DocumentRouterAgent",
        role="Generates personalised document checklist, handles document uploads, detects password-protected files, and confirms parsed content",
        description=(
            "You are the Document specialist. You generate a personalised document checklist based on the user's brokers, "
            "guide them through uploading each file, handle password-protected PDFs transparently, "
            "and confirm what data was extracted after each upload."
        ),
        instructions=instructions,
        model=_pro_model(),
        tools=[get_document_checklist, parse_uploaded_document, get_session_summary, get_days_to_tax_deadline],
        session_state=session_state,
        add_session_state_to_context=True,
        add_history_to_context=False,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
        markdown=True,
    )


def _build_normalisation_agent(tools: tuple, session_state: dict) -> Agent:
    (
        save_intake_answer,
        get_days_to_tax_deadline,
        get_document_checklist,
        parse_uploaded_document,
        run_tax_computation,
        get_loss_harvest_plan,
        get_gains_harvest_plan,
        get_session_summary,
    ) = tools

    instructions = prompts.raw.get("tax_harvest_agent", {}).get("normalisation_agent_instructions", "")
    if not instructions:
        instructions = _DEFAULT_NORMALISATION_INSTRUCTIONS

    return Agent(
        name="NormalisationAgent",
        role="Cross-validates uploaded documents, confirms data quality, and prompts for missing information (e.g. cost basis, partial FY)",
        description=(
            "You are the Normalisation specialist. After documents are uploaded, you review the extracted data for completeness and accuracy. "
            "You highlight any missing cost basis, partial FY data, or data quality issues, and ask the user to confirm or provide missing information."
        ),
        instructions=instructions,
        model=_pro_model(),
        tools=[get_session_summary, get_days_to_tax_deadline],
        session_state=session_state,
        add_session_state_to_context=True,
        add_history_to_context=False,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
        markdown=True,
    )


def _build_tax_computation_agent(tools: tuple, session_state: dict) -> Agent:
    (
        save_intake_answer,
        get_days_to_tax_deadline,
        get_document_checklist,
        parse_uploaded_document,
        run_tax_computation,
        get_loss_harvest_plan,
        get_gains_harvest_plan,
        get_session_summary,
    ) = tools

    instructions = prompts.raw.get("tax_harvest_agent", {}).get("tax_computation_agent_instructions", "")
    if not instructions:
        instructions = _DEFAULT_TAX_COMPUTATION_INSTRUCTIONS

    return Agent(
        name="TaxComputationAgent",
        role="Runs the full LTCG/STCG capital gains computation per Indian tax rules (Sec 70/71/72/112A/87A) and presents a clear breakdown",
        description=(
            "You are the Tax Computation specialist. You trigger the capital gains computation engine and present the results "
            "in a clear, step-by-step format. You explain each netting step, highlight carry-forward allocations, "
            "and show the final tax liability in plain English."
        ),
        instructions=instructions,
        model=_pro_model(),
        tools=[run_tax_computation, get_days_to_tax_deadline, get_session_summary],
        session_state=session_state,
        add_session_state_to_context=True,
        add_history_to_context=False,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
        markdown=True,
    )


def _build_harvesting_agent(tools: tuple, session_state: dict) -> Agent:
    (
        save_intake_answer,
        get_days_to_tax_deadline,
        get_document_checklist,
        parse_uploaded_document,
        run_tax_computation,
        get_loss_harvest_plan,
        get_gains_harvest_plan,
        get_session_summary,
    ) = tools

    instructions = prompts.raw.get("tax_harvest_agent", {}).get("harvesting_agent_instructions", "")
    if not instructions:
        instructions = _DEFAULT_HARVESTING_INSTRUCTIONS

    return Agent(
        name="HarvestingAgent",
        role="Generates a ranked loss harvesting and gains harvesting action plan with concrete ₹ savings estimates",
        description=(
            "You are the Harvesting Advisor specialist. You produce a prioritised, actionable tax harvesting plan. "
            "Loss harvesting first (Sec 94(7)/(8) checks, exit load assessment), then gains harvesting against remaining ₹1.25L exemption. "
            "Every recommendation includes a concrete ₹ tax saving estimate and a rationale."
        ),
        instructions=instructions,
        model=_pro_model(),
        tools=[get_loss_harvest_plan, get_gains_harvest_plan, get_days_to_tax_deadline, get_session_summary],
        session_state=session_state,
        add_session_state_to_context=True,
        add_history_to_context=False,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
        markdown=True,
    )


# ── Team builder ──────────────────────────────────────────────────────────────

def build_tax_harvest_team(session_state: dict, messages: list[dict], user_id: str) -> Team:
    """Build the OrchestratorAgent route-mode team for the current request."""
    tools = make_tax_harvest_tools(session_state, user_id)
    history_context = _build_history_context(messages)

    intake = _build_intake_agent(tools, session_state)
    doc_router = _build_document_agent(tools, session_state)
    normalisation = _build_normalisation_agent(tools, session_state)
    tax_comp = _build_tax_computation_agent(tools, session_state)
    harvesting = _build_harvesting_agent(tools, session_state)

    router_instructions = prompts.raw.get("tax_harvest_agent", {}).get(
        "orchestrator_instructions", ""
    )
    if not router_instructions:
        router_instructions = _DEFAULT_ORCHESTRATOR_INSTRUCTIONS

    return Team(
        name="TaxHarvestOrchestrator",
        mode=TeamMode.route,
        model=_pro_model(temperature=0.1),
        members=[intake, doc_router, normalisation, tax_comp, harvesting],
        instructions=router_instructions,
        additional_context=history_context or None,
        show_members_responses=False,
        markdown=True,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
    )


# ── Streaming runner ──────────────────────────────────────────────────────────

async def run_tax_harvest_team(
    user_message: str,
    session_state: dict,
    messages: list[dict],
    user_id: str,
) -> tuple[str, dict]:
    """Run the tax harvest team synchronously and return (content, updated_session_state).

    The caller (router event_generator) is responsible for word-by-word streaming
    of the returned content — keeping the chunk loop inside StreamingResponse's
    generator so Starlette flushes each chunk immediately as it is yielded.
    """
    def _run_sync():
        team = build_tax_harvest_team(session_state, messages, user_id)
        return team.run(user_message)

    try:
        result = await asyncio.to_thread(_run_sync)
    except Exception as e:
        logger.error(f"run_tax_harvest_team: team run failed: {e}", exc_info=True)
        return "Something went wrong. Please try again.", session_state

    full_content = str(result.content) if result and result.content else ""

    # The tools mutate session_state in-place via the closure, so session_state
    # already contains all save_intake_answer() updates after team.run() returns.
    # Also merge any session_state from member_responses as a belt-and-braces.
    if result and hasattr(result, "member_responses"):
        for mr in (result.member_responses or []):
            if hasattr(mr, "session_state") and mr.session_state:
                session_state.update(mr.session_state)

    return full_content, session_state


def _tool_status_message(tool_name: str) -> str:
    """Return a user-friendly status message for a tool call."""
    STATUS_MESSAGES = {
        "save_intake_answer": "",
        "get_days_to_tax_deadline": "",
        "get_document_checklist": "Generating your personalised document checklist...",
        "parse_uploaded_document": "Parsing your document with AI...",
        "run_tax_computation": "Running capital gains computation...",
        "get_loss_harvest_plan": "Calculating loss harvesting opportunities...",
        "get_gains_harvest_plan": "Calculating gains harvesting plan...",
        "get_session_summary": "",
    }
    return STATUS_MESSAGES.get(tool_name, f"Processing: {tool_name}...")


def _build_analysis_payload(session_state: dict) -> dict:
    """Build a structured analysis payload from session_state for the frontend."""
    analysis = session_state.get("tax_analysis") or {}
    return {
        "tax_year": session_state.get("financial_year", "2025-26"),
        "income_slab": session_state.get("income_slab"),
        "tax_regime": session_state.get("tax_regime"),
        "realised": analysis.get("realised"),
        "tax": analysis.get("tax"),
        "total_tax": analysis.get("total_tax"),
        "exemption_used": analysis.get("exemption_used"),
        "exemption_remaining": analysis.get("exemption_remaining"),
        "optimal_vs_naive_saving": analysis.get("optimal_vs_naive_saving"),
        "loss_harvest_mf": session_state.get("loss_harvest_mf") or [],
        "loss_harvest_stocks": session_state.get("loss_harvest_stocks") or [],
        "gains_harvest_mf": session_state.get("gains_harvest_mf") or [],
        "cf_ltcl_remaining": analysis.get("cf_ltcl_remaining"),
        "cf_stcl_remaining": analysis.get("cf_stcl_remaining"),
    }


# ── Default prompts (fallback if not in prompts.yaml) ────────────────────────

_DEFAULT_ORCHESTRATOR_INSTRUCTIONS = """
You are the Minto Tax Harvest Orchestrator. Route each user message to exactly one specialist.

ROUTING RULES:
1. Route to 'IntakeAgent' when:
   - User is answering intake questions (income, regime, brokers, FY, F&O status)
   - Intake is not complete yet (check session_state: income_slab, tax_regime, brokers must all be set)
   - User is asking clarifying questions about the intake fields

2. Route to 'DocumentRouterAgent' when:
   - Intake is complete AND documents haven't all been uploaded
   - User is asking what documents to upload
   - User has just uploaded a file (message contains [UPLOAD_READY])
   - User is providing a password for an encrypted file
   - User needs guidance on where to download documents

3. Route to 'NormalisationAgent' when:
   - All required documents are uploaded (documents_done matches documents_needed)
   - User has data quality questions about uploaded documents
   - Missing cost basis or partial FY data needs to be addressed

4. Route to 'TaxComputationAgent' when:
   - Normalisation is complete and user wants to see the tax analysis
   - User asks "what is my tax liability?" or "run the analysis" or similar
   - User wants to understand the computation steps

5. Route to 'HarvestingAgent' when:
   - Tax computation is complete (session_state.tax_analysis is set)
   - User asks about loss harvesting, gains harvesting, or recommendations
   - User asks "what should I sell?" or "how do I save tax?" or similar

IMPORTANT:
- NEVER answer the user yourself — always route to a specialist.
- Check session_state carefully before routing to avoid unnecessary re-collection.
- If intake is done, go straight to documents. If documents are done, go to analysis.
"""

_DEFAULT_INTAKE_INSTRUCTIONS = """
You are the Intake specialist for the Minto Tax Harvest system.
Collect the following fields through natural back-and-forth conversation — one question per message.

FIELDS TO COLLECT:
- income_slab ("<5L", "5-10L", "10-15L", "15-30L", ">30L")
- tax_regime ("old" or "new")
- resident_status ("resident" or "nri")
- brokers (list: Zerodha, Groww, Upstox, Angel One, ICICI Direct, HDFC Sec, Other)
- has_fno (true/false — do they trade F&O?)
- has_mf_outside_demat (true/false — do they hold MFs via CAMS/KFintech outside demat?)

DO NOT collect financial_year — silently save "2025-26" with save_intake_answer on your first turn.

MANDATORY RULES:
- ONE question per message. Never bundle multiple questions.
- Write naturally — no numbered lists, no "reply with 1/2/3" instructions.
- Call save_intake_answer immediately after the user answers each question, then ask the next.
- Check session_state first — skip any field already saved.
- Keep messages short: 2-3 sentences then the question.
- Do NOT show deadline banners or urgency warnings.
- Do NOT ask for documents — DocumentRouterAgent handles that.
- Once all fields saved: say "Perfect, let me pull together your document checklist." and stop.
"""

_DEFAULT_DOCUMENT_INSTRUCTIONS = """
You are the Document specialist. 

FLOW:
1. When intake is complete, call get_document_checklist to generate the personalised list.
2. Present the checklist clearly with download instructions for each document.
3. Tell the user to use the upload button (📎) to upload each file.
4. When you see [UPLOAD_READY] in the message, call parse_uploaded_document to process it.
5. If the file is password-protected, prompt for the password and retry with parse_uploaded_document(password=...).
6. After each successful parse, confirm what was found and what's still missing.
7. When all documents are uploaded, signal that the user is ready for analysis.

IMPORTANT:
- CAS PDF password is typically PAN (e.g. ABCDE1234F) or date of birth (DDMMYYYY).
- Detailed CAS is needed, not Summary CAS (Summary has no transaction history).
- Do not proceed to analysis — that is TaxComputationAgent's job.
"""

_DEFAULT_NORMALISATION_INSTRUCTIONS = """
You are the Normalisation specialist. Review the uploaded document data for quality:

1. Check session_state for all parsed documents.
2. Identify any issues: missing cost basis, partial FY data, ELSS lock-in dates.
3. If cost basis is missing for any position: ask the user to provide it manually.
4. If partial FY data is detected: flag it with a note "partial year — verify with broker".
5. Once data quality is confirmed, tell the user they're ready for the tax computation.
"""

_DEFAULT_TAX_COMPUTATION_INSTRUCTIONS = """
You are the Tax Computation specialist. 

1. Call get_days_to_deadline first — show urgency if <7 days remaining.
2. Call run_tax_computation to compute the full capital gains analysis.
3. Present results using this structure:

**Step 1 — Realised Gains (FY 2025-26)**
Show LTCG, STCG, LTCL, STCL from all uploaded documents.

**Step 2 — Set-Off (Sec 70/71)**
Explain how current-year losses offset current-year gains (STCL first, non-equity gains first).

**Step 3 — Carry-Forward Set-Off (Sec 72)**
If CF losses exist, show how they're applied (non-equity LTCG first to preserve exemption).

**Step 4 — ₹1.25L Exemption (Sec 112A)**
Show how much of the exemption is used and what remains.

**Final Tax Liability**
Total tax = equity STCG@20% + equity LTCG@12.5% (above exemption) + non-equity STCG@slab + non-equity LTCG@12.5%.

Format all INR amounts as ₹X,XX,XXX (Indian numbering). Never give buy/sell instructions.
"""

_DEFAULT_HARVESTING_INSTRUCTIONS = """
You are the Harvesting Advisor. Produce a ranked action plan:

TAX RULES (FY 2025-26):
- STCG equity rate: 20% (Sec 111A)
- LTCG equity rate: 12.5% above ₹1.25L (Sec 112A)
- FOF/Gold MFs purchased after Apr 2023: slab rate regardless of holding period
- ELSS lock-in: 3 years from allotment date
- No wash-sale rule in India: can buy back same day (loss harvest) or April 1 (gains harvest)

PLAN STRUCTURE:
1. Call get_loss_harvest_plan — show loss harvesting first (higher priority when tax > 0).
   - Prioritise: highest tax saving first
   - Apply Sec 94(7)/(8) checks (show exclusions with reason)
   - Check exit load (prefer nil exit load funds)
   - Show: fund name, loss amount, STCL/LTCL, tax saved, reinvest same day
   
2. Call get_gains_harvest_plan — show gains harvesting using remaining ₹1.25L exemption.
   - Only equity-oriented MFs (>65% domestic equity)
   - Show: fund name, harvestable LTCG, harvestable amount, reinvest April 1 2026
   
3. Show ITR filing reminder: file ITR-2/ITR-3 before July 31, 2026 (required to carry forward losses).

4. Call get_days_to_deadline — show urgency and T+1 settlement notes.

Format as a clear, ranked action plan using markdown tables and bold headings.
"""
