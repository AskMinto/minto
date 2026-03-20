"""Agno tool functions for the WhatsApp Tax Bot agent.

All 12 tools are plain async Python functions.  Agno injects RunContext as the
first argument when a function's first parameter is annotated as RunContext.
The LLM does not see RunContext in the JSON Schema — Agno strips it.

Tools that access session state read/write run_context.session_state, which
Agno auto-persists to PostgresDb after every arun() call.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
from datetime import date, datetime, timezone
from typing import Optional

from agno.run import RunContext

from . import document_parser, llm_doc_parser, tax_engine
from .tax_engine import (
    compute_tax_analysis,
    compute_cf_strategy,
    days_to_deadline,
    get_gains_harvest_candidates_mf,
    get_loss_harvest_candidates_mf,
    get_loss_harvest_candidates_stocks,
)

logger = logging.getLogger(__name__)


# ── Onboarding ────────────────────────────────────────────────────────────────

async def save_onboarding_answer(run_context: RunContext, key: str, value: str) -> str:
    """Save one onboarding answer to session state.

    Call this immediately after the user confirms each onboarding answer.

    Args:
        key: session_state key e.g. 'tax_regime', 'carry_forward', 'portfolio_type', 'step'.
        value: The confirmed value as a JSON-serialisable string or JSON array/object.
    """
    try:
        # Try to deserialise JSON values (arrays, booleans, numbers)
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        parsed = value

    run_context.session_state[key] = parsed
    logger.debug(f"save_onboarding_answer: {key}={parsed!r}")
    return f"Saved {key}={parsed!r}"


# ── Document ingestion ────────────────────────────────────────────────────────

async def process_uploaded_document(
    run_context: RunContext,
    twilio_media_url: str,
    content_type: str,
    doc_type: str,
    broker_name: Optional[str] = None,
) -> str:
    """Download a document from Twilio, detect if it is password-protected, and parse it.

    Call this whenever the user sends a file (message contains [FILE_UPLOADED]).

    Internally:
    1. Downloads file bytes from Twilio (Basic Auth with AccountSID:AuthToken).
    2. Uploads raw bytes to GCS for DPDPA audit trail.
    3. If PDF: tries to open with pikepdf (empty password).
       - Not encrypted: passes bytes to llm_doc_parser.
       - Encrypted: saves pending_doc_* fields to session_state, returns NEEDS_PASSWORD.
    4. For CSV/Excel: sends to llm_doc_parser directly.
    5. On success: deletes GCS file within 60s, stores parsed summary in session_state.

    Returns 'NEEDS_PASSWORD' if the PDF is encrypted, otherwise a JSON summary
    of what was found in the document.

    Args:
        twilio_media_url: The MediaUrl0 value from the Twilio webhook payload.
        content_type: The MediaContentType0 value e.g. 'application/pdf'.
        doc_type: One of 'cas', 'broker_pl', 'broker_holdings', 'itr'.
        broker_name: Optional broker name for broker documents (e.g. 'zerodha').
    """
    phone = run_context.user_id or "unknown"

    try:
        raw_bytes = await document_parser.download_from_twilio(twilio_media_url)
    except Exception as e:
        logger.error(f"process_uploaded_document: download failed: {e}")
        return json.dumps({"error": f"Could not download the file. Please try again. ({type(e).__name__})"})

    # Upload to GCS for audit trail
    audit = await document_parser.upload_to_gcs_and_audit(
        phone=phone,
        doc_type=doc_type,
        raw_bytes=raw_bytes,
        content_type=content_type,
        broker_name=broker_name,
    )
    gcs_uri = audit["gcs_path"]
    doc_id = audit["doc_id"]

    # PDF encryption check
    is_pdf = "pdf" in content_type.lower()
    if is_pdf and document_parser.is_pdf_encrypted(raw_bytes):
        # Store pending state for unlock_and_parse_document
        run_context.session_state["pending_doc_url"] = twilio_media_url
        run_context.session_state["pending_doc_type"] = doc_type
        run_context.session_state["pending_doc_content_type"] = content_type
        run_context.session_state["pending_doc_broker_name"] = broker_name
        run_context.session_state["pending_doc_gcs_uri"] = gcs_uri
        run_context.session_state["pending_doc_id"] = doc_id
        run_context.session_state["pending_doc_password_attempts"] = 0
        return "NEEDS_PASSWORD"

    # Parse immediately (not encrypted or not a PDF)
    try:
        parsed_dict = await llm_doc_parser.parse_document(raw_bytes, content_type, doc_type)
    except Exception as e:
        logger.error(f"process_uploaded_document: parse failed: {e}")
        await document_parser.mark_parse_status(doc_id, "failed", str(e))
        # Still delete from GCS even on parse failure
        asyncio.create_task(document_parser.delete_from_gcs_and_audit(gcs_uri, doc_id))
        return json.dumps({"error": f"Could not read this document. {_parse_error_hint(doc_type, str(e))}"})

    # Mark parsed + delete from GCS (DPDPA ≤60s)
    await document_parser.mark_parse_status(doc_id, "parsed")
    asyncio.create_task(document_parser.delete_from_gcs_and_audit(gcs_uri, doc_id))

    # Store in session_state
    state_key = _doc_type_to_state_key(doc_type)
    run_context.session_state[state_key] = parsed_dict

    # Mark document as done
    docs_done = list(run_context.session_state.get("documents_done") or [])
    if doc_type not in docs_done:
        docs_done.append(doc_type)
    run_context.session_state["documents_done"] = docs_done

    summary = _build_parse_summary(doc_type, parsed_dict, broker_name)
    return json.dumps({"status": "parsed", "summary": summary})


async def unlock_and_parse_document(run_context: RunContext, password: str) -> str:
    """Unlock a previously uploaded password-protected PDF and parse it.

    Call this after the user has provided their password in response to
    your NEEDS_PASSWORD request. Uses the pending_doc_* fields in session_state
    that were stored by process_uploaded_document.

    Args:
        password: The password the user just typed.
    """
    pending_url = run_context.session_state.get("pending_doc_url")
    if not pending_url:
        return json.dumps({"error": "No pending document. Please upload the file again."})

    doc_type = run_context.session_state.get("pending_doc_type", "cas")
    content_type = run_context.session_state.get("pending_doc_content_type", "application/pdf")
    broker_name = run_context.session_state.get("pending_doc_broker_name")
    old_gcs_uri = run_context.session_state.get("pending_doc_gcs_uri")
    old_doc_id = run_context.session_state.get("pending_doc_id")
    attempts = int(run_context.session_state.get("pending_doc_password_attempts") or 0)
    phone = run_context.user_id or "unknown"

    # Re-download the file from Twilio
    try:
        raw_bytes = await document_parser.download_from_twilio(pending_url)
    except Exception as e:
        return json.dumps({"error": f"Could not re-download the file: {type(e).__name__}. Please upload again."})

    # Try to decrypt
    import pikepdf
    try:
        decrypted_bytes = document_parser.decrypt_pdf(raw_bytes, password)
    except pikepdf.PasswordError:
        attempts += 1
        run_context.session_state["pending_doc_password_attempts"] = attempts
        if attempts >= 3:
            # Clear pending state
            _clear_pending_doc(run_context)
            if old_gcs_uri and old_doc_id:
                asyncio.create_task(document_parser.delete_from_gcs_and_audit(old_gcs_uri, old_doc_id))
            return "MAX_ATTEMPTS_REACHED"
        return f"WRONG_PASSWORD (attempt {attempts}/3)"
    except Exception as e:
        return json.dumps({"error": f"Could not unlock PDF: {e}"})

    # Upload decrypted bytes to GCS for audit trail
    audit = await document_parser.upload_to_gcs_and_audit(
        phone=phone,
        doc_type=doc_type,
        raw_bytes=decrypted_bytes,
        content_type=content_type,
        broker_name=broker_name,
    )
    new_gcs_uri = audit["gcs_path"]
    new_doc_id = audit["doc_id"]

    # Parse decrypted PDF
    try:
        parsed_dict = await llm_doc_parser.parse_document(decrypted_bytes, content_type, doc_type)
    except Exception as e:
        logger.error(f"unlock_and_parse_document: parse failed: {e}")
        await document_parser.mark_parse_status(new_doc_id, "failed", str(e))
        asyncio.create_task(document_parser.delete_from_gcs_and_audit(new_gcs_uri, new_doc_id))
        return json.dumps({"error": f"File unlocked but could not be read. {_parse_error_hint(doc_type, str(e))}"})

    # Mark parsed, delete both GCS uploads
    await document_parser.mark_parse_status(new_doc_id, "parsed")
    asyncio.create_task(document_parser.delete_from_gcs_and_audit(new_gcs_uri, new_doc_id))
    if old_gcs_uri and old_doc_id:
        asyncio.create_task(document_parser.delete_from_gcs_and_audit(old_gcs_uri, old_doc_id))

    # Store in session_state, clear pending
    state_key = _doc_type_to_state_key(doc_type)
    run_context.session_state[state_key] = parsed_dict
    docs_done = list(run_context.session_state.get("documents_done") or [])
    if doc_type not in docs_done:
        docs_done.append(doc_type)
    run_context.session_state["documents_done"] = docs_done
    _clear_pending_doc(run_context)

    summary = _build_parse_summary(doc_type, parsed_dict, broker_name)
    return json.dumps({"status": "parsed", "summary": summary})


# ── Tax computation ───────────────────────────────────────────────────────────

async def run_tax_analysis(run_context: RunContext) -> str:
    """Run the full capital gains tax computation from all parsed documents.

    Call once all required documents are in session_state (documents_done matches
    documents_needed). Stores the complete analysis in session_state['tax_analysis'].

    Returns a JSON string with the complete tax analysis including step-by-step
    netting, final liability per category, exemption used/remaining, and 87A status.
    """
    analysis = compute_tax_analysis(run_context.session_state)
    run_context.session_state["tax_analysis"] = analysis
    return json.dumps(analysis)


async def get_loss_harvest_plan(run_context: RunContext) -> str:
    """Return the complete loss harvesting plan (MF + stocks + non-equity).

    Includes:
    - MF folios with harvestable unrealised losses (Sec 94(7)/94(8) checks applied)
    - Stock positions with unrealised losses
    - CF value and tax saved per position
    - ITR filing prerequisite reminder when in carry-forward-building mode

    Call after run_tax_analysis.
    """
    ss = run_context.session_state
    mf_candidates = get_loss_harvest_candidates_mf(ss)
    stock_candidates = get_loss_harvest_candidates_stocks(ss)

    base_tax = float((ss.get("tax_analysis") or {}).get("total_tax") or 0)

    return json.dumps({
        "base_tax": base_tax,
        "mode": "tax_saving" if base_tax > 0 else "carry_forward_building",
        "mf_candidates": mf_candidates,
        "stock_candidates": stock_candidates,
        "itr_filing_reminder": (
            "File ITR-2 or ITR-3 (not ITR-1) before July 31 2026 to carry forward these losses. "
            "Late filing or filing ITR-1 means these losses are lost permanently."
        ),
        "wash_sale_note": (
            "India has no wash sale rule. You can buy back the same stock or MF units "
            "immediately on the same day or the next business day."
        ),
    })


async def get_gains_harvest_plan(run_context: RunContext) -> str:
    """Return the gains harvesting plan — equity MF folios eligible for LTCG exemption.

    Only equity-oriented funds (>65% domestic equity), held >12 months, unlocked ELSS.
    Accounts for exit load impact on net gain.

    Call after run_tax_analysis.
    """
    ss = run_context.session_state
    tax_analysis = ss.get("tax_analysis") or {}
    remaining_exemption = float(tax_analysis.get("exemption_remaining") or 0)

    if remaining_exemption <= 0:
        return json.dumps({
            "remaining_exemption": 0,
            "candidates": [],
            "message": "No remaining LTCG exemption to harvest.",
        })

    candidates = get_gains_harvest_candidates_mf(remaining_exemption, ss)
    total_available = sum(c["net_ltcg_after_exit_load"] for c in candidates if not c.get("excluded"))

    return json.dumps({
        "remaining_exemption": remaining_exemption,
        "candidates": candidates,
        "total_available_ltcg": total_available,
        "harvest_target": min(total_available, remaining_exemption),
        "reinvestment_guidance": (
            "Reinvest on the first business day of FY 2026-27 — April 1 2026 (Wednesday). "
            "Not before March 31. This ensures new units start the new FY with a fresh "
            "holding period and higher cost basis. Gap of approximately 4-7 days out of market."
        ),
    })


# ── Actions ───────────────────────────────────────────────────────────────────

async def get_days_to_deadline(run_context: RunContext) -> str:
    """Return calendar days remaining until March 31, 2026 (IST).

    Call before every major analysis output to show the deadline banner.
    The agent should format this as: 'X days left until March 31 2026'.
    For fewer than 7 days: show prominently, first in the message.
    For fewer than 3 days: add settlement warning (T+1 equity MFs, T+2 stocks).
    On March 31: add cut-off time warning (equity MFs 3:00 PM, debt MFs 1:30 PM, stocks 3:30 PM).
    """
    n = days_to_deadline()
    today = date.today()
    is_march31 = (today.month == 3 and today.day == 31)

    result = {
        "days_remaining": n,
        "is_march_31": is_march31,
        "urgency": "critical" if n <= 3 else ("high" if n <= 7 else "normal"),
    }
    if n <= 3 and not is_march31:
        result["settlement_warning"] = (
            "Redemptions placed today may take 1-2 business days to process. Act today to be safe."
        )
    if is_march31:
        result["cutoff_warning"] = (
            "CRITICAL: March 31 is the last day. Equity MF orders must be placed before 3:00 PM. "
            "Debt MF orders before 1:30 PM. Stock/ETF orders before market close 3:30 PM. "
            "Some platforms enforce earlier internal cut-offs — check your app."
        )
    return json.dumps(result)


async def opt_in_reminder(run_context: RunContext, reminder_date: str) -> str:
    """Opt the user into a WhatsApp reminder on the specified date.

    Saves reminder_date and reminder_opted_in=True to session_state.
    The daily APScheduler job reads these fields and sends the reminder message.

    Args:
        reminder_date: ISO date string e.g. '2026-03-28'.
    """
    run_context.session_state["reminder_opted_in"] = True
    run_context.session_state["reminder_date"] = reminder_date
    return json.dumps({"status": "ok", "reminder_date": reminder_date})


async def generate_pdf_report(run_context: RunContext) -> str:
    """Generate the final PDF tax report and return a signed GCS URL valid 7 days.

    The report includes:
    - Step-by-step computation sheet (ITR Schedule CG format)
    - Complete tax summary with all figures
    - Loss harvesting recommendations with tax savings per position
    - Gains harvesting eligible funds and total target amount
    - ELSS lock-in status and upcoming unlock dates
    - March 31 deadline prominently displayed
    - CF loss allocation strategy with tax saved vs naive
    - ITR filing reminder (ITR-2/ITR-3 by July 31 2026)
    - All disclaimers and data source notes
    """
    from .report_generator import generate_report_pdf
    from ..core.config import GCS_BUCKET_NAME

    ss = run_context.session_state
    phone = run_context.user_id or "unknown"

    try:
        pdf_bytes = generate_report_pdf(ss)
    except Exception as e:
        logger.error(f"generate_pdf_report: PDF generation failed: {e}")
        return json.dumps({"error": f"Could not generate PDF: {e}"})

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = f"wa-reports/{phone.lstrip('+')}/tax_report_{ts}.pdf"

    try:
        from google.cloud import storage as gcs
        from ..core.config import GCS_BUCKET_NAME

        import asyncio

        def _upload_and_sign():
            client = gcs.Client()
            bucket = client.bucket(GCS_BUCKET_NAME or "minto-wa-uploads")
            blob = bucket.blob(path)
            blob.upload_from_file(io.BytesIO(pdf_bytes), content_type="application/pdf")
            url = blob.generate_signed_url(
                expiration=datetime.utcnow().replace(tzinfo=timezone.utc).__class__.fromisoformat
                and __import__("datetime").timedelta(days=7),
                method="GET",
            )
            return url

        loop = asyncio.get_running_loop()
        signed_url = await loop.run_in_executor(None, _upload_and_sign)
        return json.dumps({"status": "ok", "signed_url": signed_url, "expires_in": "7 days"})
    except Exception as e:
        logger.error(f"generate_pdf_report: GCS upload/sign failed: {e}")
        return json.dumps({"error": f"Report generated but could not be uploaded: {e}"})


async def save_notification_contact(run_context: RunContext, name: str, email: str) -> str:
    """Save name and email for future notifications (NRI/ULIP/foreign block opt-in).

    Args:
        name: User's full name.
        email: User's email address.
    """
    run_context.session_state["notification_name"] = name
    run_context.session_state["notification_email"] = email
    return json.dumps({"status": "ok", "message": f"Saved contact for {name} ({email}). We'll notify you when support is available."})


# ── DPDPA ─────────────────────────────────────────────────────────────────────

async def delete_user_data(run_context: RunContext) -> str:
    """Delete all stored data for this user (DPDPA right to erasure).

    Deletes:
    - wa_agent_sessions row for this phone number (session_state + message history)
    - wa_documents audit rows for this phone number

    Call when the user sends 'Delete my data'.
    """
    phone = run_context.user_id or "unknown"

    try:
        from .session_store import delete_session
        from supabase import create_client
        from ..core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        # Delete wa_agent_sessions via session_store helper
        delete_session(phone)

        # Delete wa_documents audit rows
        try:
            sb.table("wa_documents").delete().eq("wa_phone", phone).execute()
        except Exception as e:
            logger.error(f"delete_user_data: wa_documents failed: {e}")

    except Exception as e:
        logger.error(f"delete_user_data: {e}")
        return json.dumps({"status": "error", "message": "Could not complete deletion. Please try again."})

    # Wipe in-memory session_state for this turn
    for key in list(run_context.session_state.keys()):
        run_context.session_state.pop(key, None)

    return json.dumps({
        "status": "deleted",
        "message": (
            "All your data has been deleted. This includes your portfolio figures, session history, "
            "and any reminders you set. Your session has ended."
        ),
    })


async def get_user_data_summary(run_context: RunContext) -> str:
    """Return a summary of all data stored for this user (DPDPA right of access).

    Call when the user sends 'My data'.
    """
    ss = run_context.session_state
    phone = run_context.user_id or "unknown"

    summary: dict = {
        "phone": phone,
        "session_data": {
            "step": ss.get("step"),
            "portfolio_type": ss.get("portfolio_type"),
            "tax_regime": ss.get("tax_regime"),
            "carry_forward": ss.get("carry_forward"),
            "documents_done": ss.get("documents_done"),
            "reminder_opted_in": ss.get("reminder_opted_in"),
            "reminder_date": ss.get("reminder_date"),
            "notification_email": ss.get("notification_email"),
            "privacy_acknowledged": ss.get("privacy_acknowledged"),
        },
        "stored_parsed_data": {
            "cas_parsed": "yes" if ss.get("cas_parsed") else "no",
            "broker_pl_parsed": "yes" if ss.get("broker_pl_parsed") else "no",
            "broker_holdings_parsed": "yes" if ss.get("broker_holdings_parsed") else "no",
            "itr_parsed": "yes" if ss.get("itr_parsed") else "no",
            "tax_analysis": "yes" if ss.get("tax_analysis") else "no",
        },
        "raw_files": "Deleted within 60 seconds of parsing (DPDPA compliance)",
        "retention": "Session data auto-deleted after 30 days unless reminder opted in",
    }

    # Fetch wa_documents audit trail
    try:
        from .session_store import get_session_summary
        from supabase import create_client
        from ..core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        docs = sb.table("wa_documents").select("doc_type,parse_status,uploaded_at,gcs_deleted_at") \
            .eq("wa_phone", phone).execute()
        summary["document_audit_trail"] = docs.data or []
        db_row = get_session_summary(phone)
        if db_row:
            summary["session_created_at"] = db_row.get("created_at")
            summary["session_updated_at"] = db_row.get("updated_at")
    except Exception as e:
        logger.warning(f"get_user_data_summary: Supabase query failed: {e}")
        summary["document_audit_trail"] = "unavailable"

    return json.dumps(summary, default=str)


# ── Private helpers ───────────────────────────────────────────────────────────

def _doc_type_to_state_key(doc_type: str) -> str:
    return {
        "cas": "cas_parsed",
        "broker_pl": "broker_pl_parsed",
        "broker_holdings": "broker_holdings_parsed",
        "itr": "itr_parsed",
    }.get(doc_type, f"{doc_type}_parsed")


def _clear_pending_doc(run_context: RunContext) -> None:
    for key in (
        "pending_doc_url", "pending_doc_type", "pending_doc_content_type",
        "pending_doc_broker_name", "pending_doc_gcs_uri", "pending_doc_id",
        "pending_doc_password_attempts",
    ):
        run_context.session_state.pop(key, None)


def _build_parse_summary(doc_type: str, parsed: dict, broker_name: Optional[str]) -> str:
    """Build a human-readable confirmation of what was found in a parsed document."""
    if doc_type == "cas":
        name = parsed.get("investor_name", "Unknown")
        pan = parsed.get("pan", "—")
        folios = len(parsed.get("folios") or [])
        ltcg = parsed.get("total_realised_ltcg_fy", 0)
        stcg = parsed.get("total_realised_stcg_fy", 0)
        ltcl = parsed.get("total_realised_ltcl_fy", 0)
        stcl = parsed.get("total_realised_stcl_fy", 0)
        return (
            f"Portfolio for {name} (PAN: {pan}). "
            f"{folios} folios with balance. "
            f"Realised this FY: LTCG Rs {ltcg:,.0f}, STCG Rs {stcg:,.0f}, "
            f"LTCL Rs {ltcl:,.0f}, STCL Rs {stcl:,.0f}."
        )
    elif doc_type == "broker_pl":
        broker = broker_name or parsed.get("broker_name", "broker")
        ltcg = parsed.get("total_ltcg", 0)
        stcg = parsed.get("total_stcg", 0)
        ltcl = parsed.get("total_ltcl", 0)
        stcl = parsed.get("total_stcl", 0)
        return (
            f"{broker.title()} Tax P&L: "
            f"LTCG Rs {ltcg:,.0f}, STCG Rs {stcg:,.0f}, "
            f"LTCL Rs {ltcl:,.0f}, STCL Rs {stcl:,.0f}."
        )
    elif doc_type == "broker_holdings":
        broker = broker_name or parsed.get("broker_name", "broker")
        total = parsed.get("total_portfolio_value", 0)
        holdings_count = len(parsed.get("holdings") or [])
        return f"{broker.title()} holdings: {holdings_count} positions, total value Rs {total:,.0f}."
    elif doc_type == "itr":
        ltcl = parsed.get("total_ltcl_cf", 0)
        stcl = parsed.get("total_stcl_cf", 0)
        if ltcl or stcl:
            return f"ITR carry-forward losses: LTCL Rs {ltcl:,.0f}, STCL Rs {stcl:,.0f}."
        return "ITR found — no carry-forward losses in Schedule CFL."
    return "Document parsed successfully."


def _parse_error_hint(doc_type: str, error: str) -> str:
    hints = {
        "cas": "Please check that you uploaded the Detailed CAS (not Summary) from MFCentral.",
        "broker_pl": "Try downloading as CSV or Excel from your broker's Tax P&L section.",
        "broker_holdings": "Try downloading as CSV or Excel from your broker's Holdings section.",
        "itr": "Please upload the ITR PDF or JSON from incometax.gov.in.",
    }
    return hints.get(doc_type, "Please try uploading the file again.")
