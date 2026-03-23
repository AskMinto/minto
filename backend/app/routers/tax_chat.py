"""Tax Saver chat router — /tax/* endpoints.

Provides the backend for the web /tax-saver page.
Mirrors the WhatsApp bot's session/agent pattern but:
  - keyed by user_id (Supabase auth UUID) instead of phone number
  - uses web_agent.py (markdown enabled) instead of agent.py
  - file uploads come as multipart (not Twilio media URLs)
  - responses are SSE streamed (not sent via Twilio)
  - DPDPA: uploaded file bytes are never stored long-term; parsed in memory only

Endpoints (chat interface):
  GET  /tax/messages       — load message history (last 30)
  POST /tax/message/stream — SSE streaming chat
  POST /tax/upload         — multipart file upload + LLM parse
  DELETE /tax/session      — DPDPA right to erasure

Endpoints (wizard interface):
  GET  /tax/session             — return current session_state summary
  POST /tax/onboarding          — save a single onboarding answer
  POST /tax/analyse             — run deterministic tax computation
  GET  /tax/holdings-context    — summarise existing portfolio holdings
  POST /tax/sync-holdings       — upsert parsed broker holdings into holdings table
  GET  /tax/documents           — list uploaded documents (tax_documents table)
  DELETE /tax/documents/{id}    — soft-delete a document record
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from ..whatsapp_bot.web_session_store import (
    delete_tax_session,
    load_tax_session,
    save_tax_session,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tax", tags=["tax"])

_HISTORY_TURNS = 10  # Number of recent turns to inject as additional_context


# ── Models ────────────────────────────────────────────────────────────────────

class TaxMessageRequest(BaseModel):
    content: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_history_context(messages: list[dict], n: int = _HISTORY_TURNS) -> str:
    """Build a plain-text history block from the last N turns for additional_context."""
    recent = messages[-(n * 2):]
    if not recent:
        return ""
    lines = ["--- CONVERSATION HISTORY ---"]
    for m in recent:
        role = m.get("role", "unknown").upper()
        content = str(m.get("content", ""))[:500]
        lines.append(f"{role}: {content}")
    lines.append("--- END HISTORY ---")
    return "\n".join(lines)


def _safe_session_summary(ss: dict) -> dict:
    """Return a sanitised session_state summary for the SSE done event.

    Omits large parsed document blobs to keep the event small.
    """
    return {
        "step": ss.get("step"),
        "documents_needed": ss.get("documents_needed"),
        "documents_done": ss.get("documents_done"),
        "has_tax_analysis": bool(ss.get("tax_analysis")),
        "has_cas": bool(ss.get("cas_parsed")),
        "has_broker_pl": bool(ss.get("broker_pl_parsed")),
        "has_broker_holdings": bool(ss.get("broker_holdings_parsed")),
        "has_itr": bool(ss.get("itr_parsed")),
        "exemption_remaining": (ss.get("tax_analysis") or {}).get("exemption_remaining"),
        "total_tax": (ss.get("tax_analysis") or {}).get("total_tax"),
        "ulip_disclaimer_active": ss.get("ulip_disclaimer_active", False),
        "reminder_opted_in": ss.get("reminder_opted_in", False),
    }


def _build_parse_summary_message(doc_type: str, parsed: dict, broker_name: Optional[str]) -> str:
    """Build a [DOC_PARSED] sentinel message the agent receives after an upload."""
    if doc_type == "cas":
        name = parsed.get("investor_name", "Unknown")
        pan = parsed.get("pan", "—")
        folios = len(parsed.get("folios") or [])
        ltcg = parsed.get("total_realised_ltcg_fy", 0)
        stcg = parsed.get("total_realised_stcg_fy", 0)
        ltcl = parsed.get("total_realised_ltcl_fy", 0)
        stcl = parsed.get("total_realised_stcl_fy", 0)
        return (
            f"[DOC_PARSED] doc_type=cas status=parsed "
            f"investor={name!r} pan={pan} folios={folios} "
            f"ltcg={ltcg:.0f} stcg={stcg:.0f} ltcl={ltcl:.0f} stcl={stcl:.0f}"
        )
    elif doc_type == "broker_pl":
        broker = broker_name or parsed.get("broker_name", "broker")
        ltcg = parsed.get("total_ltcg", 0)
        stcg = parsed.get("total_stcg", 0)
        ltcl = parsed.get("total_ltcl", 0)
        stcl = parsed.get("total_stcl", 0)
        return (
            f"[DOC_PARSED] doc_type=broker_pl status=parsed broker={broker!r} "
            f"ltcg={ltcg:.0f} stcg={stcg:.0f} ltcl={ltcl:.0f} stcl={stcl:.0f}"
        )
    elif doc_type == "broker_holdings":
        broker = broker_name or parsed.get("broker_name", "broker")
        total = parsed.get("total_portfolio_value", 0)
        count = len(parsed.get("holdings") or [])
        return (
            f"[DOC_PARSED] doc_type=broker_holdings status=parsed broker={broker!r} "
            f"holdings={count} total_value={total:.0f}"
        )
    elif doc_type == "itr":
        ltcl = parsed.get("total_ltcl_cf", 0)
        stcl = parsed.get("total_stcl_cf", 0)
        return (
            f"[DOC_PARSED] doc_type=itr status=parsed "
            f"ltcl_cf={ltcl:.0f} stcl_cf={stcl:.0f}"
        )
    return f"[DOC_PARSED] doc_type={doc_type} status=parsed"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/messages")
def get_tax_messages(user: UserContext = Depends(get_user_context)):
    """Return the stored messages list for the current user (last 30)."""
    _, messages = load_tax_session(user.user_id)
    return {"messages": messages[-30:]}


@router.post("/message/stream")
async def tax_message_stream(
    body: TaxMessageRequest,
    user: UserContext = Depends(get_user_context),
):
    """SSE streaming tax chat endpoint.

    Loads session state, runs the web_tax_agent, streams tokens, saves state.
    """
    session_state, messages = load_tax_session(user.user_id)
    history_context = _build_history_context(messages)

    async def event_generator():
        from ..whatsapp_bot.web_agent import web_tax_agent

        full_content = ""
        updated_ss = session_state

        try:
            # arun with stream=True not directly supported in all Agno versions;
            # use run_response and stream token by token from .content
            result = await web_tax_agent.arun(
                body.content,
                user_id=user.user_id,
                session_id=user.user_id,
                session_state=session_state,
                additional_context=history_context or None,
            )

            if result and hasattr(result, "session_state") and result.session_state:
                updated_ss = result.session_state

            if result and hasattr(result, "content") and result.content:
                full_content = str(result.content)

            # Stream the full content token-by-token (simulated — Agno runs synchronously)
            # Split by words for a smooth streaming effect
            if full_content:
                words = full_content.split(" ")
                chunk_size = 3
                for i in range(0, len(words), chunk_size):
                    chunk = " ".join(words[i:i + chunk_size])
                    if i + chunk_size < len(words):
                        chunk += " "
                    data = json.dumps({"type": "token", "content": chunk})
                    yield f"data: {data}\n\n"
                    await asyncio.sleep(0)  # yield to event loop

        except Exception as e:
            logger.error(f"tax_message_stream: agent error for {user.user_id}: {e}", exc_info=True)
            full_content = "Something went wrong on my end. Please try sending your message again."
            data = json.dumps({"type": "token", "content": full_content})
            yield f"data: {data}\n\n"

        # Persist updated session + message history
        if full_content:
            messages.append({"role": "user", "content": body.content})
            messages.append({"role": "assistant", "content": full_content})
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, save_tax_session, user.user_id, updated_ss, messages)

        done_data = json.dumps({
            "type": "done",
            "session_state": _safe_session_summary(updated_ss),
        })
        yield f"data: {done_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/upload")
async def tax_upload(
    file: UploadFile,
    doc_type: str = Form(...),
    broker_name: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    user: UserContext = Depends(get_user_context),
):
    """Accept a document upload, parse it, and store the result in the session.

    Args:
        file: The uploaded file (PDF, CSV, or Excel).
        doc_type: 'cas' | 'broker_pl' | 'broker_holdings' | 'itr'.
        broker_name: Optional broker name (for broker documents).
        password: Optional password for encrypted PDFs.

    Returns:
        {status: 'parsed', doc_type, summary} on success.
        {status: 'needs_password'} if PDF is encrypted and no password provided.
        {status: 'error', message} on failure.
    """
    from ..whatsapp_bot.document_parser import is_pdf_encrypted, decrypt_pdf
    from ..whatsapp_bot.llm_doc_parser import parse_document

    raw_bytes = await file.read()
    content_type = file.content_type or "application/pdf"
    is_pdf = "pdf" in content_type.lower()

    # Handle encrypted PDFs
    if is_pdf:
        if is_pdf_encrypted(raw_bytes):
            if not password:
                return {
                    "status": "needs_password",
                    "message": "This PDF is password-protected. Please enter the password.",
                }
            try:
                import pikepdf
                raw_bytes = decrypt_pdf(raw_bytes, password)
            except Exception as e:
                if "password" in str(e).lower() or "pikepdf" in type(e).__module__:
                    return {
                        "status": "wrong_password",
                        "message": "Incorrect password. Please try again.",
                    }
                return {"status": "error", "message": f"Could not unlock PDF: {e}"}

    # Parse the document
    try:
        parsed = await parse_document(raw_bytes, content_type, doc_type)
    except Exception as e:
        logger.error(f"tax_upload: parse failed for {user.user_id}, doc_type={doc_type}: {e}")
        return {"status": "error", "message": f"Could not read this document. {_parse_error_hint(doc_type)}"}

    # Store in session
    loop = asyncio.get_running_loop()
    session_state, messages = await loop.run_in_executor(None, load_tax_session, user.user_id)

    state_key = {"cas": "cas_parsed", "broker_pl": "broker_pl_parsed",
                 "broker_holdings": "broker_holdings_parsed", "itr": "itr_parsed"}.get(doc_type, f"{doc_type}_parsed")
    session_state[state_key] = parsed

    docs_done = list(session_state.get("documents_done") or [])
    if doc_type not in docs_done:
        docs_done.append(doc_type)
    session_state["documents_done"] = docs_done

    # Inject a [DOC_PARSED] system message so the agent can acknowledge it
    sentinel = _build_parse_summary_message(doc_type, parsed, broker_name)
    messages.append({"role": "user", "content": sentinel})

    await loop.run_in_executor(None, save_tax_session, user.user_id, session_state, messages)

    # Insert audit record into tax_documents table (DPDPA / /documents page)
    try:
        sb = _sb_service()
        sb.table("tax_documents").insert({
            "user_id": user.user_id,
            "doc_type": doc_type,
            "broker_name": broker_name,
            "file_name": file.filename or f"{doc_type}_{doc_type}.bin",
            "parse_status": "parsed",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as audit_err:
        logger.warning(f"tax_upload: audit insert failed (non-fatal): {audit_err}")

    return {
        "status": "parsed",
        "doc_type": doc_type,
        "sentinel": sentinel,
        "session_summary": _safe_session_summary(session_state),
    }


@router.delete("/session")
def delete_session_endpoint(user: UserContext = Depends(get_user_context)):
    """DPDPA right to erasure — delete all tax session data for this user."""
    delete_tax_session(user.user_id)
    return {"status": "deleted"}


def _parse_error_hint(doc_type: str) -> str:
    hints = {
        "cas": "Please check you uploaded the Detailed CAS (not Summary) from MFCentral.",
        "broker_pl": "Try downloading as CSV or Excel from your broker's Tax P&L section.",
        "broker_holdings": "Try downloading as CSV or Excel from your broker's Holdings section.",
        "itr": "Please upload the ITR PDF or JSON from incometax.gov.in.",
    }
    return hints.get(doc_type, "Please try uploading the file again.")


def _sb_service():
    """Supabase client with service-role credentials (bypasses RLS)."""
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# ── Wizard endpoints ──────────────────────────────────────────────────────────

class OnboardingAnswer(BaseModel):
    key: str
    value: Any


_ALLOWED_ONBOARDING_KEYS = {
    "step", "portfolio_type", "nps_tier", "ulip_disclaimer_active",
    "carry_forward", "tax_regime", "slab_rate", "base_income",
    "manual_cf_ltcl", "manual_cf_stcl", "documents_needed",
    "privacy_acknowledged", "blocked", "block_reason",
    "notification_name", "notification_email",
    "reminder_opted_in", "reminder_date",
}


@router.get("/session")
def get_tax_session(user: UserContext = Depends(get_user_context)):
    """Return the current session_state summary for the wizard UI.

    Returns the full session_state minus the large parsed document blobs
    (cas_parsed, broker_pl_parsed, broker_holdings_parsed, itr_parsed,
    tax_analysis), which can be large and are not needed by the frontend
    directly.
    """
    session_state, _ = load_tax_session(user.user_id)
    return {
        "session_state": _safe_session_summary(session_state),
        "has_cas": bool(session_state.get("cas_parsed")),
        "has_broker_pl": bool(session_state.get("broker_pl_parsed")),
        "has_broker_holdings": bool(session_state.get("broker_holdings_parsed")),
        "has_itr": bool(session_state.get("itr_parsed")),
        "step": session_state.get("step"),
        "portfolio_type": session_state.get("portfolio_type"),
        "carry_forward": session_state.get("carry_forward"),
        "tax_regime": session_state.get("tax_regime"),
        "slab_rate": session_state.get("slab_rate"),
        "base_income": session_state.get("base_income"),
        "documents_needed": session_state.get("documents_needed"),
        "documents_done": session_state.get("documents_done"),
        "tax_analysis": _safe_tax_summary(session_state.get("tax_analysis")),
        "ulip_disclaimer_active": session_state.get("ulip_disclaimer_active", False),
        "blocked": session_state.get("blocked", False),
        "block_reason": session_state.get("block_reason"),
    }


def _safe_tax_summary(tax_analysis: Optional[dict]) -> Optional[dict]:
    """Return a concise tax summary suitable for the frontend wizard cards."""
    if not tax_analysis:
        return None
    return {
        "total_tax": tax_analysis.get("total_tax"),
        "exemption_used": tax_analysis.get("exemption_used"),
        "exemption_remaining": tax_analysis.get("exemption_remaining"),
        "slab_rate": tax_analysis.get("slab_rate"),
        "tax_regime": tax_analysis.get("tax_regime"),
        "realised": tax_analysis.get("realised"),
        "tax": tax_analysis.get("tax"),
        "step4_87a": tax_analysis.get("step4_87a"),
        "optimal_vs_naive_saving": tax_analysis.get("optimal_vs_naive_saving"),
        "cf_ltcl_remaining": tax_analysis.get("cf_ltcl_remaining"),
        "cf_stcl_remaining": tax_analysis.get("cf_stcl_remaining"),
    }


@router.post("/onboarding")
def post_onboarding_answer(
    body: OnboardingAnswer,
    user: UserContext = Depends(get_user_context),
):
    """Save a single onboarding wizard answer to the session_state.

    The wizard calls this after each step is confirmed, before advancing.
    Also recalculates documents_needed when portfolio_type or carry_forward changes.
    """
    if body.key not in _ALLOWED_ONBOARDING_KEYS:
        raise HTTPException(status_code=400, detail=f"Key '{body.key}' is not an allowed onboarding field.")

    session_state, messages = load_tax_session(user.user_id)
    session_state[body.key] = body.value

    # Recompute documents_needed whenever portfolio_type or carry_forward changes
    if body.key in ("portfolio_type", "carry_forward"):
        session_state["documents_needed"] = _compute_documents_needed(session_state)

    save_tax_session(user.user_id, session_state, messages)

    return {
        "status": "ok",
        "key": body.key,
        "value": body.value,
        "documents_needed": session_state.get("documents_needed"),
    }


def _compute_documents_needed(session_state: dict) -> list[str]:
    """Compute required documents based on portfolio_type and carry_forward."""
    portfolio_type = session_state.get("portfolio_type") or []
    carry_forward = session_state.get("carry_forward")

    has_mf = "mutual_funds" in portfolio_type or "1" in portfolio_type
    has_stocks = "stocks" in portfolio_type or "2" in portfolio_type
    has_cf = carry_forward is True

    docs = []
    if has_mf:
        docs.append("cas")
    if has_stocks:
        docs.append("broker_pl")
        docs.append("broker_holdings")
    if has_cf:
        docs.append("itr")

    # Default: if nothing selected yet, assume at least CAS
    if not docs and not portfolio_type:
        docs = ["cas"]

    return docs


@router.post("/analyse")
def post_analyse(user: UserContext = Depends(get_user_context)):
    """Run the deterministic capital gains tax computation.

    Reads all parsed documents from session_state, runs compute_tax_analysis(),
    stores the result back in session_state, and returns the full analysis.
    This endpoint is called by the wizard once all documents are uploaded.
    """
    from ..whatsapp_bot.tax_engine import compute_tax_analysis, get_loss_harvest_candidates_mf, get_loss_harvest_candidates_stocks, get_gains_harvest_candidates_mf

    session_state, messages = load_tax_session(user.user_id)

    try:
        analysis = compute_tax_analysis(session_state)
    except Exception as e:
        logger.error(f"post_analyse: compute_tax_analysis failed for {user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Tax computation failed: {e}")

    session_state["tax_analysis"] = analysis

    # Also compute harvesting plans and attach for convenience
    remaining_exemption = float(analysis.get("exemption_remaining") or 0)
    try:
        loss_mf = get_loss_harvest_candidates_mf(session_state)
        loss_stocks = get_loss_harvest_candidates_stocks(session_state)
        gains_mf = get_gains_harvest_candidates_mf(remaining_exemption, session_state)
    except Exception as e:
        logger.warning(f"post_analyse: harvesting plan failed (non-fatal): {e}")
        loss_mf, loss_stocks, gains_mf = [], [], []

    session_state["loss_harvest_mf"] = loss_mf
    session_state["loss_harvest_stocks"] = loss_stocks
    session_state["gains_harvest_mf"] = gains_mf
    session_state["step"] = "analysis"

    save_tax_session(user.user_id, session_state, messages)

    return {
        "status": "ok",
        "analysis": _safe_tax_summary(analysis),
        "loss_harvest_mf": loss_mf,
        "loss_harvest_stocks": loss_stocks,
        "gains_harvest_mf": gains_mf,
    }


@router.get("/holdings-context")
def get_holdings_context(user: UserContext = Depends(get_user_context)):
    """Return a summary of the user's existing portfolio holdings.

    Used by the wizard's document collection step to pre-populate context
    and show a banner if the user already has holdings in Minto.
    """
    from ..db.supabase import get_supabase_client

    supabase = get_supabase_client(user.token)
    try:
        result = (
            supabase.table("holdings")
            .select("asset_type, sector, mcap_bucket, qty, avg_cost, scheme_name, symbol")
            .eq("user_id", user.user_id)
            .execute()
        )
        holdings = result.data or []
    except Exception as e:
        logger.error(f"get_holdings_context: failed for {user.user_id}: {e}")
        return {"has_holdings": False, "summary": None}

    if not holdings:
        return {"has_holdings": False, "summary": None}

    mf_count = sum(1 for h in holdings if h.get("asset_type") == "MF")
    equity_count = sum(1 for h in holdings if h.get("asset_type") == "EQ")

    return {
        "has_holdings": True,
        "summary": {
            "total_holdings": len(holdings),
            "equity_count": equity_count,
            "mf_count": mf_count,
            "message": f"We found {equity_count} equity holding(s) and {mf_count} mutual fund folio(s) already in your Minto portfolio. These have been included in your tax context.",
        },
    }


class SyncHoldingsRequest(BaseModel):
    broker_name: Optional[str] = None


@router.post("/sync-holdings")
def post_sync_holdings(
    body: SyncHoldingsRequest,
    user: UserContext = Depends(get_user_context),
):
    """Upsert parsed broker holdings into the holdings table.

    If broker_holdings_parsed is in the session, creates or updates holdings
    rows with source='tax_import'. Returns count of upserted rows.
    """
    from ..db.supabase import get_supabase_client

    session_state, _ = load_tax_session(user.user_id)
    parsed = session_state.get("broker_holdings_parsed")
    if not parsed:
        raise HTTPException(status_code=400, detail="No broker holdings parsed yet. Upload your holdings file first.")

    broker_name = body.broker_name or parsed.get("broker_name", "unknown")
    holdings_data = parsed.get("holdings") or []

    if not holdings_data:
        return {"status": "ok", "upserted": 0, "message": "No holdings found in the parsed file."}

    supabase = get_supabase_client(user.token)
    rows = []
    for h in holdings_data:
        symbol = h.get("symbol") or h.get("scrip_name", "")
        isin = h.get("isin")
        if not symbol and not isin:
            continue

        rows.append({
            "user_id": user.user_id,
            "source": "tax_import",
            "symbol": symbol.upper() if symbol else None,
            "isin": isin,
            "exchange": h.get("exchange", "NSE"),
            "qty": float(h.get("total_quantity") or 0),
            "avg_cost": float(h.get("total_invested") or 0) / max(float(h.get("total_quantity") or 1), 1),
            "asset_type": "EQ",
            "sector": None,
            "mcap_bucket": None,
        })

    if not rows:
        return {"status": "ok", "upserted": 0, "message": "No valid holdings to sync."}

    try:
        supabase.table("holdings").upsert(rows, on_conflict="user_id,symbol,exchange").execute()
    except Exception as e:
        logger.error(f"post_sync_holdings: upsert failed for {user.user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not sync holdings: {e}")

    return {
        "status": "ok",
        "upserted": len(rows),
        "broker": broker_name,
        "message": f"Synced {len(rows)} holding(s) from {broker_name} to your Minto portfolio.",
    }


@router.get("/documents")
def get_tax_documents(user: UserContext = Depends(get_user_context)):
    """Return the list of documents uploaded by this user (tax_documents table)."""
    try:
        sb = _sb_service()
        result = (
            sb.table("tax_documents")
            .select("id, doc_type, broker_name, file_name, parse_status, uploaded_at, deleted_at")
            .eq("user_id", user.user_id)
            .is_("deleted_at", "null")
            .order("uploaded_at", desc=True)
            .execute()
        )
        return {"documents": result.data or []}
    except Exception as e:
        logger.error(f"get_tax_documents: failed for {user.user_id}: {e}")
        return {"documents": []}


@router.delete("/documents/{doc_id}")
def delete_tax_document(
    doc_id: str,
    user: UserContext = Depends(get_user_context),
):
    """Soft-delete a tax document record (DPDPA right to erasure for a single document)."""
    try:
        sb = _sb_service()
        result = (
            sb.table("tax_documents")
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", doc_id)
            .eq("user_id", user.user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found.")
        return {"status": "deleted", "id": doc_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_tax_document: failed for {user.user_id}, doc_id={doc_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not delete document: {e}")
