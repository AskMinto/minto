"""Tax Saver router — /tax-saver/* endpoints.

Clean, simple API for the redesigned tax saver page:

  Phase 1 — Intake (no LLM):
    POST /tax-saver/intake         — save intake_answers + compute doc manifest
    GET  /tax-saver/session        — get current session (intake_answers, tax_docs status, messages)
    DELETE /tax-saver/session      — DPDPA right to erasure

  Phase 2 — Document upload:
    POST /tax-saver/upload/{doc_key}  — upload a doc, extract text, store in tax_docs[doc_key]
                                        query param: ?password=xxx for encrypted files

  Phase 3 — Analysis:
    POST /tax-saver/analyse        — SSE stream: run analysis agent with all tax_docs as context

  Phase 4 — Follow-up chat:
    POST /tax-saver/chat           — SSE stream: follow-up questions, agent has full tax_docs

  Utility:
    GET  /tax-saver/docs           — return doc manifest keys + upload status + instructions
    GET  /tax-saver/messages       — return message history
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from ..whatsapp_bot.web_session_store import (
    delete_tax_session,
    load_tax_saver_session,
    save_tax_saver_session,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tax-saver", tags=["tax-saver"])

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


# ── Models ────────────────────────────────────────────────────────────────────

class IntakeAnswersRequest(BaseModel):
    income_slab: str                        # e.g. ">30L"
    tax_regime: str                         # "new" | "old"
    brokers: list[str]                      # ["Zerodha", "Mutual Funds (via CAMS/KFintech)"]
    has_carry_forward: bool = False
    financial_year: str = "2025-26"


class ChatMessageRequest(BaseModel):
    content: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sb_service():
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _is_pdf(filename: str, content_type: str) -> bool:
    return "pdf" in content_type.lower() or filename.lower().endswith(".pdf")


def _is_xlsx(filename: str, content_type: str) -> bool:
    return (
        filename.lower().endswith((".xlsx", ".xls", ".xlsm"))
        or "excel" in content_type.lower()
        or "spreadsheet" in content_type.lower()
    )


def _is_csv(filename: str, content_type: str) -> bool:
    return filename.lower().endswith(".csv") or "csv" in content_type.lower()


def _doc_manifest_status(tax_docs: dict) -> list[dict]:
    """Return a list of {doc_key, uploaded, preview} for all docs."""
    from ..services.doc_manifest import get_doc_instructions
    result = []
    for doc_key, content in tax_docs.items():
        instr = get_doc_instructions(doc_key)
        result.append({
            "doc_key": doc_key,
            "label": instr.get("label", doc_key),
            "icon": instr.get("icon", "📄"),
            "uploaded": content is not None,
            "preview": content[:200] if content else None,
        })
    return result


def _all_docs_uploaded(tax_docs: dict) -> bool:
    return bool(tax_docs) and all(v is not None for v in tax_docs.values())


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/intake")
def post_intake(
    body: IntakeAnswersRequest,
    user: UserContext = Depends(get_user_context),
):
    """Save intake answers and compute the document manifest.

    This is called once after the user completes the 3-question intake UI.
    It stores intake_answers and initialises tax_docs with the required doc keys.
    """
    from ..services.doc_manifest import compute_doc_manifest, get_all_doc_instructions

    intake_answers = {
        "income_slab": body.income_slab,
        "tax_regime": body.tax_regime,
        "brokers": body.brokers,
        "has_carry_forward": body.has_carry_forward,
        "financial_year": body.financial_year,
    }

    # Compute which documents are needed
    tax_docs = compute_doc_manifest(intake_answers)

    # Load existing messages (keep them across intake resets)
    _, _, messages = load_tax_saver_session(user.user_id)
    save_tax_saver_session(user.user_id, intake_answers, tax_docs, messages)

    return {
        "status": "ok",
        "intake_answers": intake_answers,
        "tax_docs": _doc_manifest_status(tax_docs),
        "all_uploaded": _all_docs_uploaded(tax_docs),
        "doc_instructions": get_all_doc_instructions(tax_docs),
    }


@router.get("/session")
def get_session(user: UserContext = Depends(get_user_context)):
    """Return the current session state — intake_answers, doc manifest status, message count."""
    from ..services.doc_manifest import get_all_doc_instructions

    intake_answers, tax_docs, messages = load_tax_saver_session(user.user_id)

    has_intake = bool(intake_answers.get("income_slab"))

    return {
        "has_intake": has_intake,
        "intake_answers": intake_answers if has_intake else None,
        "tax_docs": _doc_manifest_status(tax_docs) if tax_docs else [],
        "all_uploaded": _all_docs_uploaded(tax_docs),
        "message_count": len(messages),
        "doc_instructions": get_all_doc_instructions(tax_docs) if tax_docs else [],
    }


@router.get("/messages")
def get_messages(user: UserContext = Depends(get_user_context)):
    """Return the stored message history."""
    _, _, messages = load_tax_saver_session(user.user_id)
    return {"messages": messages[-30:]}


@router.get("/docs")
def get_docs(user: UserContext = Depends(get_user_context)):
    """Return the doc manifest with download instructions and upload status."""
    from ..services.doc_manifest import get_all_doc_instructions

    intake_answers, tax_docs, _ = load_tax_saver_session(user.user_id)

    return {
        "tax_docs": _doc_manifest_status(tax_docs),
        "all_uploaded": _all_docs_uploaded(tax_docs),
        "doc_instructions": get_all_doc_instructions(tax_docs),
    }


@router.post("/upload/{doc_key}")
def upload_document(
    doc_key: str,
    file: UploadFile,
    password: Optional[str] = Query(None),
    user: UserContext = Depends(get_user_context),
):
    """Upload a document, extract its text, and store in tax_docs[doc_key].

    Synchronous route handler (not async) — runs in uvicorn's thread pool.
    This is critical for CAS PDFs: the Gemini File API extraction takes 30-90s.
    As an async route, a client disconnect (Cloud Run timeout) cancels the
    coroutine mid-wait and the DB write never happens. As a sync route,
    uvicorn runs it in a thread — disconnects do not cancel threads, so
    Gemini finishes and saves to DB even if the HTTP response never arrives.

    Handles:
    - PDF: extract_pdf_tables_sync (Gemini File API, blocking)
    - XLSX/XLS/XLSM: extract_xlsx (openpyxl, instant)
    - CSV: plain text decode

    Returns:
        {status: "extracted", doc_key, preview}  — success
        {status: "needs_password"}               — encrypted, no password given
        {status: "wrong_password"}               — password incorrect
        {status: "likely_invalid", message}      — not a financial document
        {status: "error", message}               — parse failure
    """
    from ..whatsapp_bot.document_parser import is_pdf_encrypted, decrypt_pdf
    from ..whatsapp_bot.llm_doc_parser import is_xlsx_encrypted, _decrypt_xlsx
    from ..services.pdf_extractor import extract_pdf_tables_sync
    from ..services.xlsx_extractor import extract_xlsx

    # UploadFile.file is a SpooledTemporaryFile — always readable synchronously.
    # (UploadFile.read() is async, but .file.read() is the underlying sync buffer.)
    raw_bytes = file.file.read()

    if len(raw_bytes) > _MAX_UPLOAD_BYTES:
        return {"status": "error", "message": "File too large. Maximum size is 20 MB."}

    filename = file.filename or f"{doc_key}_upload"
    content_type = file.content_type or "application/octet-stream"

    # ── PDF handling ──────────────────────────────────────────────────────────
    if _is_pdf(filename, content_type):
        if is_pdf_encrypted(raw_bytes):
            if not password:
                return {
                    "status": "needs_password",
                    "filename": filename,
                    "hint": "Typically your PAN (e.g. ABCDE1234F) or date of birth (DDMMYYYY).",
                }
            try:
                raw_bytes = decrypt_pdf(raw_bytes, password)
            except Exception:
                return {
                    "status": "wrong_password",
                    "filename": filename,
                    "message": "Incorrect password. Please try your PAN or date of birth (DDMMYYYY).",
                }

        # Synchronous Gemini extraction — runs in thread, not cancelled on disconnect
        try:
            extracted = extract_pdf_tables_sync(raw_bytes, filename)
        except RuntimeError as e:
            logger.error(f"upload_document: Gemini extraction failed for {user.user_id}: {e}")
            return {
                "status": "error",
                "message": "Could not extract data from this PDF. Please try again — this is usually a temporary Gemini API issue.",
            }

    # ── XLSX handling ─────────────────────────────────────────────────────────
    elif _is_xlsx(filename, content_type):
        if is_xlsx_encrypted(raw_bytes):
            if not password:
                return {
                    "status": "needs_password",
                    "filename": filename,
                    "hint": "Please enter the password used to protect this Excel file.",
                }
            try:
                raw_bytes = _decrypt_xlsx(raw_bytes, password)
            except ValueError:
                return {
                    "status": "wrong_password",
                    "filename": filename,
                    "message": "Incorrect password. Please try again.",
                }

        extracted = extract_xlsx(raw_bytes)

    # ── CSV handling ──────────────────────────────────────────────────────────
    elif _is_csv(filename, content_type):
        try:
            extracted = raw_bytes.decode("utf-8", errors="replace")
        except Exception:
            return {"status": "error", "message": "Could not read the CSV file."}

    else:
        return {
            "status": "error",
            "message": "Unsupported file type. Please upload a PDF, Excel (.xlsx), or CSV file.",
        }

    # ── Validate content ──────────────────────────────────────────────────────
    if not extracted or len(extracted.replace(" ", "").replace("\n", "")) < 50:
        return {
            "status": "likely_invalid",
            "message": (
                "This file doesn't appear to contain any financial data. "
                "Please check you uploaded the correct document and try again."
            ),
        }

    # ── Store in tax_docs ─────────────────────────────────────────────────────
    intake_answers, tax_docs, messages = load_tax_saver_session(user.user_id)

    if doc_key not in tax_docs:
        logger.warning(f"upload_document: {doc_key} not in manifest for {user.user_id} — adding")

    tax_docs[doc_key] = extracted
    save_tax_saver_session(user.user_id, intake_answers, tax_docs, messages)

    # Audit record
    try:
        _sb_service().table("tax_documents").insert({
            "user_id": user.user_id,
            "doc_type": doc_key,
            "broker_name": None,
            "file_name": filename,
            "parse_status": "parsed",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as audit_err:
        logger.warning(f"upload_document: audit insert failed (non-fatal): {audit_err}")

    return {
        "status": "extracted",
        "doc_key": doc_key,
        "preview": extracted[:300],
        "all_uploaded": _all_docs_uploaded(tax_docs),
        "remaining_docs": [k for k, v in tax_docs.items() if v is None],
    }


def _stream_sse(
    user_message: str,
    intake_answers: dict,
    tax_docs: dict,
    messages: list[dict],
    user_id: str,
):
    """Synchronous SSE generator using true Agno streaming (RunEvent.run_content).

    Runs in a thread via run_in_executor so it doesn't block the event loop.
    Yields raw SSE lines (bytes). Saves the full response to DB after streaming.
    """
    from ..services.tax_analysis_agent import stream_tax_analysis

    full_content = ""
    try:
        for token in stream_tax_analysis(user_message, intake_answers, tax_docs, messages):
            full_content += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
    except Exception as e:
        logger.error(f"_stream_sse: error for {user_id}: {e}", exc_info=True)
        err = "Something went wrong. Please try again."
        full_content = err
        yield f"data: {json.dumps({'type': 'token', 'content': err})}\n\n"

    # Persist to message history
    if full_content:
        updated_messages = list(messages)
        updated_messages.append({"role": "user", "content": user_message})
        updated_messages.append({"role": "assistant", "content": full_content})
        try:
            save_tax_saver_session(user_id, intake_answers, tax_docs, updated_messages)
        except Exception as e:
            logger.warning(f"_stream_sse: save failed for {user_id}: {e}")

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.post("/analyse")
def analyse_stream(
    user: UserContext = Depends(get_user_context),
):
    """SSE stream: run the tax analysis agent on all uploaded documents.

    Synchronous route (not async) so the generator can block on the Agno
    iterator directly — identical pattern to chats.py/send_message_stream.
    Uses true Agno streaming (RunEvent.run_content) — tokens arrive from
    Gemini in real time.
    """
    intake_answers, tax_docs, messages = load_tax_saver_session(user.user_id)

    if not intake_answers.get("income_slab"):
        raise HTTPException(status_code=400, detail="Please complete the intake questions first.")

    uploaded = {k: v for k, v in tax_docs.items() if v is not None}
    if not uploaded:
        raise HTTPException(status_code=400, detail="Please upload at least one document first.")

    user_message = (
        "Please analyse my tax documents and give me a complete FY 2025-26 capital gains tax analysis. "
        "Include:\n"
        "1. Summary of realised LTCG, STCG, LTCL, STCL from my documents\n"
        "2. Step-by-step netting (Sections 70, 71, 72, 112A)\n"
        "3. Final tax liability estimate\n"
        "4. Loss harvesting opportunities (positions I should sell to book losses)\n"
        "5. Gains harvesting opportunities (LTCG I can book tax-free within ₹1.25L exemption)\n"
        "6. Specific actions before March 31, 2026\n"
        "Please be specific with rupee amounts from my actual documents."
    )

    def event_generator():
        yield from _stream_sse(user_message, intake_answers, uploaded, messages, user.user_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat")
def chat_stream(
    body: ChatMessageRequest,
    user: UserContext = Depends(get_user_context),
):
    """SSE stream: follow-up chat referencing uploaded tax documents."""
    intake_answers, tax_docs, messages = load_tax_saver_session(user.user_id)

    if not intake_answers.get("income_slab"):
        raise HTTPException(status_code=400, detail="Please complete the intake questions first.")

    uploaded = {k: v for k, v in tax_docs.items() if v is not None}

    def event_generator():
        yield from _stream_sse(body.content, intake_answers, uploaded, messages, user.user_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/session")
def delete_session(user: UserContext = Depends(get_user_context)):
    """DPDPA right to erasure — delete all tax saver session data."""
    delete_tax_session(user.user_id)
    return {"status": "deleted"}
