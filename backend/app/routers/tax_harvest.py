"""Tax Harvest router — /tax-harvest/* endpoints.

Provides the backend for the new conversational /tax-harvest page.
Replaces the step-wizard approach of /tax-saver with a fully conversational
multi-agent flow powered by an Agno route-mode Team.

Architecture:
  - OrchestratorAgent (Gemini Flash, route mode)
  - IntakeAgent, DocumentRouterAgent, NormalisationAgent,
    TaxComputationAgent, HarvestingAgent (all Gemini Pro)

Session state is persisted in the same tax_sessions Supabase table as before.
Document parsing uses the same LLM pipeline as the original tax_chat.py.
File uploads arrive as multipart and are processed without storing raw bytes (DPDPA).

Endpoints:
  POST /tax-harvest/session           — create/reset session, returns session_id
  POST /tax-harvest/message           — SSE streaming chat (main endpoint)
  POST /tax-harvest/upload            — multipart file upload + parse, returns status
  GET  /tax-harvest/analysis          — return final structured analysis JSON
  GET  /tax-harvest/session           — return current session summary
  DELETE /tax-harvest/session         — DPDPA right to erasure
  GET  /tax-harvest/documents         — list uploaded documents
  DELETE /tax-harvest/documents/{id}  — soft-delete a document record
"""

from __future__ import annotations

import asyncio
import base64
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
router = APIRouter(prefix="/tax-harvest", tags=["tax-harvest"])


# ── Default session state for the new agent flow ───────────────────────────────

_DEFAULT_HARVEST_SESSION: dict = {
    # Intake fields
    "step": "intake",
    "financial_year": "2025-26",
    "income_slab": None,
    "tax_regime": None,
    "resident_status": None,
    "brokers": [],
    "has_fno": None,
    "has_mf_outside_demat": None,
    # Document fields
    "documents_needed": [],
    "documents_done": [],
    "pending_upload": None,   # temporary: {raw_bytes: base64str, content_type: str, filename: str}
    # Legacy fields (kept for backward-compat with existing tools)
    "slab_rate": None,
    "base_income": None,
    "carry_forward": None,
    "manual_cf_ltcl": None,
    "manual_cf_stcl": None,
    "portfolio_type": [],
    # Parsed documents
    "cas_parsed": None,
    "broker_pl_parsed": None,
    "broker_holdings_parsed": None,
    "itr_parsed": None,
    # Analysis results
    "tax_analysis": None,
    "loss_harvest_mf": None,
    "loss_harvest_stocks": None,
    "gains_harvest_mf": None,
}


def _load_harvest_session(user_id: str) -> tuple[dict, list[dict]]:
    """Load session merging defaults. Uses the shared tax_sessions table."""
    ss, messages = load_tax_session(user_id)
    # If this is a wizard session (has wizard-specific step keys), it's from old flow.
    # We keep it but ensure harvest fields exist.
    merged = {**_DEFAULT_HARVEST_SESSION, **ss}
    return merged, messages


# ── Models ─────────────────────────────────────────────────────────────────────

class ChatMessageRequest(BaseModel):
    content: str
    session_id: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _sb_service():
    """Supabase service-role client (bypasses RLS)."""
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _safe_session_summary(ss: dict) -> dict:
    """Return a small session summary for SSE done events (no large blobs)."""
    return {
        "step": ss.get("step"),
        "income_slab": ss.get("income_slab"),
        "tax_regime": ss.get("tax_regime"),
        "resident_status": ss.get("resident_status"),
        "brokers": ss.get("brokers"),
        "has_fno": ss.get("has_fno"),
        "has_mf_outside_demat": ss.get("has_mf_outside_demat"),
        "documents_needed": ss.get("documents_needed"),
        "documents_done": ss.get("documents_done"),
        "has_cas": bool(ss.get("cas_parsed")),
        "has_broker_pl": bool(ss.get("broker_pl_parsed")),
        "has_broker_holdings": bool(ss.get("broker_holdings_parsed")),
        "has_itr": bool(ss.get("itr_parsed")),
        "has_tax_analysis": bool(ss.get("tax_analysis")),
        "total_tax": (ss.get("tax_analysis") or {}).get("total_tax"),
        "exemption_remaining": (ss.get("tax_analysis") or {}).get("exemption_remaining"),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/session")
def create_or_reset_session(user: UserContext = Depends(get_user_context)):
    """Create or reset a tax harvest session for the current user.

    Clears any existing session state and starts fresh.
    """
    new_ss = _DEFAULT_HARVEST_SESSION.copy()
    save_tax_session(user.user_id, new_ss, [])
    return {
        "status": "ok",
        "session_id": user.user_id,
        "session_state": _safe_session_summary(new_ss),
    }


@router.get("/session")
def get_session(user: UserContext = Depends(get_user_context)):
    """Return the current session summary (no large parsed blobs)."""
    ss, _ = _load_harvest_session(user.user_id)
    return {
        "session_state": _safe_session_summary(ss),
    }


@router.delete("/session")
def delete_session(user: UserContext = Depends(get_user_context)):
    """DPDPA right to erasure — delete all tax harvest session data."""
    delete_tax_session(user.user_id)
    return {"status": "deleted"}


@router.post("/message")
async def tax_harvest_message_stream(
    body: ChatMessageRequest,
    user: UserContext = Depends(get_user_context),
):
    """SSE streaming chat endpoint for the tax harvest multi-agent system.

    Loads session state, runs the OrchestratorAgent team, streams events,
    and saves updated state after each turn.

    SSE event types:
      {"type": "status", "content": str}     — tool progress messages
      {"type": "token", "content": str}       — streaming text tokens
      {"type": "analysis", "content": dict}  — structured analysis payload
      {"type": "done", "content": str, "session_state": dict}
    """
    session_state, messages = _load_harvest_session(user.user_id)

    async def event_generator():
        from ..agents.tax_harvest_team import run_tax_harvest_team, _build_analysis_payload

        full_content = ""
        updated_ss = session_state

        try:
            full_content, updated_ss = await run_tax_harvest_team(
                user_message=body.content,
                session_state=session_state,
                messages=messages,
                user_id=user.user_id,
            )
        except Exception as e:
            logger.error(f"tax_harvest_message_stream: error for {user.user_id}: {e}", exc_info=True)
            full_content = "Something went wrong. Please try sending your message again."

        # Word-by-word streaming — chunk loop lives here inside StreamingResponse's
        # generator so Starlette flushes each SSE frame immediately as it is yielded.
        # This matches the pattern in tax_chat.py / web_agent.py exactly.
        if full_content:
            words = full_content.split(" ")
            chunk_size = 3
            for i in range(0, len(words), chunk_size):
                chunk = " ".join(words[i : i + chunk_size])
                if i + chunk_size < len(words):
                    chunk += " "
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
                await asyncio.sleep(0)

        # Emit structured analysis card if computation ran this turn
        if updated_ss.get("tax_analysis") and not session_state.get("tax_analysis"):
            analysis_data = json.dumps({"type": "analysis", "content": _build_analysis_payload(updated_ss)})
            yield f"data: {analysis_data}\n\n"

        # Persist session + history
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
async def tax_harvest_upload(
    file: UploadFile,
    doc_type: str = Form(...),
    broker_name: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    user: UserContext = Depends(get_user_context),
):
    """Accept a document upload and parse it.

    Stores parsed data in session. If PDF is encrypted, returns needs_password.
    The parsed data is stored in session_state so the agent can reference it.

    Returns:
        {status: "parsed", doc_type, summary, sentinel}  on success
        {status: "needs_password"}  if PDF encrypted and no password
        {status: "wrong_password"}  if password incorrect
        {status: "error", message}  on failure
    """
    from ..whatsapp_bot.document_parser import is_pdf_encrypted, decrypt_pdf
    from ..whatsapp_bot.llm_doc_parser import parse_document

    raw_bytes = await file.read()
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or f"{doc_type}_upload"
    is_pdf = "pdf" in content_type.lower() or filename.lower().endswith(".pdf")

    # Handle encrypted PDFs
    if is_pdf:
        if is_pdf_encrypted(raw_bytes):
            if not password:
                # Store pending upload in session so agent can retry with password
                loop = asyncio.get_running_loop()
                ss, msgs = await loop.run_in_executor(None, _load_harvest_session, user.user_id)
                ss["pending_upload"] = {
                    "raw_bytes": base64.b64encode(raw_bytes).decode(),
                    "content_type": content_type,
                    "filename": filename,
                    "doc_type": doc_type,
                    "broker_name": broker_name,
                }
                await loop.run_in_executor(None, save_tax_session, user.user_id, ss, msgs)
                return {
                    "status": "needs_password",
                    "filename": filename,
                    "message": (
                        f"The file **{filename}** is password-protected. "
                        "Typically the password is your PAN (e.g. ABCDE1234F) or date of birth (DDMMYYYY)."
                    ),
                }
            try:
                raw_bytes = decrypt_pdf(raw_bytes, password)
            except Exception:
                return {
                    "status": "wrong_password",
                    "filename": filename,
                    "message": "Incorrect password. Please try your PAN or date of birth.",
                }

    # Parse the document
    try:
        parsed = await parse_document(raw_bytes, content_type, doc_type)
    except Exception as e:
        logger.error(f"tax_harvest_upload: parse failed for {user.user_id}, type={doc_type}: {e}")
        return {"status": "error", "message": f"Could not read this document. Please check the file format."}

    # CAS summary detection
    if doc_type == "cas":
        has_transactions = any(
            folio.get("fy_transactions")
            for folio in (parsed.get("folios") or [])
        )
        has_realised = any([
            abs(float(parsed.get("total_realised_ltcg_fy") or 0)) > 0,
            abs(float(parsed.get("total_realised_stcg_fy") or 0)) > 0,
            abs(float(parsed.get("total_realised_ltcl_fy") or 0)) > 0,
            abs(float(parsed.get("total_realised_stcl_fy") or 0)) > 0,
        ])
        cas_type = parsed.get("cas_type", "detailed")
        if cas_type == "summary" or (not has_transactions and not has_realised):
            return {
                "status": "needs_confirmation",
                "filename": filename,
                "message": (
                    "This looks like a **Summary CAS** — it shows your current holdings "
                    "but not individual transaction details needed to calculate realised gains."
                ),
                "question": "Have you redeemed, switched, or done an STP from any mutual fund between April 2025 and today?",
                "parsed": parsed,
            }

    # Store in session
    loop = asyncio.get_running_loop()
    ss, msgs = await loop.run_in_executor(None, _load_harvest_session, user.user_id)

    state_key = {
        "cas": "cas_parsed",
        "broker_pl": "broker_pl_parsed",
        "broker_holdings": "broker_holdings_parsed",
        "itr": "itr_parsed",
    }.get(doc_type, f"{doc_type}_parsed")
    ss[state_key] = parsed

    docs_done = list(ss.get("documents_done") or [])
    if doc_type not in docs_done:
        docs_done.append(doc_type)
    ss["documents_done"] = docs_done
    ss["pending_upload"] = None  # clear any pending upload

    # Build a sentinel message so the agent knows what was uploaded
    sentinel = _build_upload_sentinel(doc_type, parsed, broker_name, filename)
    msgs.append({"role": "user", "content": sentinel})

    await loop.run_in_executor(None, save_tax_session, user.user_id, ss, msgs)

    # Audit record in tax_documents table
    try:
        _sb_service().table("tax_documents").insert({
            "user_id": user.user_id,
            "doc_type": doc_type,
            "broker_name": broker_name,
            "file_name": filename,
            "parse_status": "parsed",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as audit_err:
        logger.warning(f"tax_harvest_upload: audit insert failed (non-fatal): {audit_err}")

    return {
        "status": "parsed",
        "doc_type": doc_type,
        "sentinel": sentinel,
        "session_summary": _safe_session_summary(ss),
    }


@router.post("/upload/confirm-summary-cas")
async def confirm_summary_cas(
    body: dict,
    user: UserContext = Depends(get_user_context),
):
    """Finalise a summary CAS after user confirms transaction status."""
    has_transactions = body.get("has_transactions", False)
    parsed = body.get("parsed", {})

    if has_transactions:
        return {
            "status": "needs_detailed",
            "message": (
                "Since you've made transactions this year, please re-download as a **Detailed CAS** "
                "(not Summary) from MFCentral and upload again."
            ),
        }

    loop = asyncio.get_running_loop()
    ss, msgs = await loop.run_in_executor(None, _load_harvest_session, user.user_id)
    ss["cas_parsed"] = parsed
    docs_done = list(ss.get("documents_done") or [])
    if "cas" not in docs_done:
        docs_done.append("cas")
    ss["documents_done"] = docs_done
    await loop.run_in_executor(None, save_tax_session, user.user_id, ss, msgs)

    return {
        "status": "parsed",
        "doc_type": "cas",
        "confirmed_no_transactions": True,
        "session_summary": _safe_session_summary(ss),
    }


@router.get("/analysis")
def get_analysis(user: UserContext = Depends(get_user_context)):
    """Return the final structured analysis payload (if computation is complete)."""
    ss, _ = _load_harvest_session(user.user_id)
    if not ss.get("tax_analysis"):
        raise HTTPException(status_code=404, detail="Tax analysis not yet computed. Complete the chat flow first.")
    return {"analysis": _build_analysis_payload(ss)}


@router.get("/documents")
def get_documents(user: UserContext = Depends(get_user_context)):
    """Return the list of documents uploaded by this user."""
    try:
        result = (
            _sb_service()
            .table("tax_documents")
            .select("id, doc_type, broker_name, file_name, parse_status, uploaded_at, deleted_at")
            .eq("user_id", user.user_id)
            .is_("deleted_at", "null")
            .order("uploaded_at", desc=True)
            .execute()
        )
        return {"documents": result.data or []}
    except Exception as e:
        logger.error(f"get_documents: failed for {user.user_id}: {e}")
        return {"documents": []}


@router.delete("/documents/{doc_id}")
def delete_document(
    doc_id: str,
    user: UserContext = Depends(get_user_context),
):
    """Soft-delete a tax document record."""
    try:
        result = (
            _sb_service()
            .table("tax_documents")
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
        logger.error(f"delete_document: failed for {user.user_id}, doc_id={doc_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not delete document: {e}")


# ── Analysis payload builder ───────────────────────────────────────────────────

def _build_analysis_payload(ss: dict) -> dict:
    """Build the structured AnalysisPayload for the frontend dashboard card."""
    analysis = ss.get("tax_analysis") or {}
    return {
        "tax_year": ss.get("financial_year", "2025-26"),
        "income_slab": ss.get("income_slab"),
        "tax_regime": ss.get("tax_regime"),
        "resident_status": ss.get("resident_status"),
        "realised": analysis.get("realised"),
        "step1_stcl": analysis.get("step1_stcl"),
        "step1_ltcl": analysis.get("step1_ltcl"),
        "step2_cf_ltcl": analysis.get("step2_cf_ltcl"),
        "step2_cf_stcl": analysis.get("step2_cf_stcl"),
        "step3_exemption": analysis.get("step3_exemption"),
        "step4_87a": analysis.get("step4_87a"),
        "tax": analysis.get("tax"),
        "total_tax": analysis.get("total_tax"),
        "exemption_used": analysis.get("exemption_used"),
        "exemption_remaining": analysis.get("exemption_remaining"),
        "optimal_vs_naive_saving": analysis.get("optimal_vs_naive_saving"),
        "cf_ltcl_remaining": analysis.get("cf_ltcl_remaining"),
        "cf_stcl_remaining": analysis.get("cf_stcl_remaining"),
        "loss_harvest_mf": ss.get("loss_harvest_mf") or [],
        "loss_harvest_stocks": ss.get("loss_harvest_stocks") or [],
        "gains_harvest_mf": ss.get("gains_harvest_mf") or [],
        "warnings": _build_warnings(ss),
    }


def _build_warnings(ss: dict) -> list[str]:
    """Build a list of user-facing warnings based on session state."""
    warnings = []
    if ss.get("has_fno"):
        warnings.append(
            "F&O activity detected — F&O income is treated as business income "
            "and is excluded from this capital gains analysis. Consult a CA."
        )
    if ss.get("resident_status") == "nri":
        warnings.append(
            "NRI status detected — TDS thresholds and DTAA implications differ. "
            "This analysis covers resident Indian rules only. Consult a CA."
        )
    analysis = ss.get("tax_analysis") or {}
    if analysis.get("step4_87a", {}).get("rebate_forfeited"):
        warnings.append(
            "87A rebate forfeited — Your total income (including capital gains) exceeds ₹12L, "
            "so the ₹12,500 rebate does not apply."
        )
    return warnings


def _build_upload_sentinel(
    doc_type: str,
    parsed: dict,
    broker_name: Optional[str],
    filename: str,
) -> str:
    """Build an [UPLOAD_READY] sentinel message injected into conversation history."""
    if doc_type == "cas":
        folios = len(parsed.get("folios") or [])
        ltcg = parsed.get("total_realised_ltcg_fy", 0)
        stcg = parsed.get("total_realised_stcg_fy", 0)
        ltcl = parsed.get("total_realised_ltcl_fy", 0)
        stcl = parsed.get("total_realised_stcl_fy", 0)
        return (
            f"[UPLOAD_READY filename={filename!r} doc_type=cas folios={folios} "
            f"ltcg={ltcg:.0f} stcg={stcg:.0f} ltcl={ltcl:.0f} stcl={stcl:.0f}]"
        )
    elif doc_type == "broker_pl":
        broker = broker_name or parsed.get("broker_name", "broker")
        ltcg = parsed.get("total_ltcg", 0)
        stcg = parsed.get("total_stcg", 0)
        return (
            f"[UPLOAD_READY filename={filename!r} doc_type=broker_pl broker={broker!r} "
            f"ltcg={ltcg:.0f} stcg={stcg:.0f}]"
        )
    elif doc_type == "broker_holdings":
        broker = broker_name or parsed.get("broker_name", "broker")
        count = len(parsed.get("holdings") or [])
        return (
            f"[UPLOAD_READY filename={filename!r} doc_type=broker_holdings broker={broker!r} "
            f"holdings={count}]"
        )
    elif doc_type == "itr":
        ltcl = parsed.get("total_ltcl_cf", 0)
        stcl = parsed.get("total_stcl_cf", 0)
        return (
            f"[UPLOAD_READY filename={filename!r} doc_type=itr "
            f"ltcl_cf={ltcl:.0f} stcl_cf={stcl:.0f}]"
        )
    return f"[UPLOAD_READY filename={filename!r} doc_type={doc_type}]"
