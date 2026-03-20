"""Low-level document helpers for the WhatsApp Tax Bot.

Provides:
- Twilio media download (Basic Auth)
- PDF encryption detection via pikepdf
- PDF decryption via pikepdf
- GCS upload + wa_documents audit row creation
- GCS deletion + wa_documents.gcs_deleted_at update

These are called by tools.py — the Agno agent never calls them directly.
"""

from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from ..core.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from . import gcs_client

logger = logging.getLogger(__name__)

_TWILIO_TIMEOUT = 60.0  # seconds


def _service_supabase():
    """Supabase client with service-role key (bypasses RLS)."""
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


async def download_from_twilio(media_url: str) -> bytes:
    """Download a file from a Twilio MediaUrl using Basic Auth.

    Args:
        media_url: The MediaUrl0 value from the Twilio webhook payload.

    Returns:
        Raw file bytes.

    Raises:
        httpx.HTTPStatusError: If the download fails.
    """
    async with httpx.AsyncClient(timeout=_TWILIO_TIMEOUT) as client:
        resp = await client.get(
            media_url,
            auth=(TWILIO_ACCOUNT_SID or "", TWILIO_AUTH_TOKEN or ""),
            follow_redirects=True,
        )
        resp.raise_for_status()
        return resp.content


def is_pdf_encrypted(pdf_bytes: bytes) -> bool:
    """Return True if the PDF bytes are password-protected.

    Uses pikepdf — tries to open with an empty password.
    Raises no exception; returns bool only.
    """
    try:
        import pikepdf
        with pikepdf.open(io.BytesIO(pdf_bytes), password=""):
            return False
    except Exception as e:
        # PasswordError means it IS encrypted; other errors treated as encrypted too
        logger.debug(f"is_pdf_encrypted: {type(e).__name__}: {e}")
        return True


def decrypt_pdf(pdf_bytes: bytes, password: str) -> bytes:
    """Decrypt a PDF with the given password.

    Args:
        pdf_bytes: Raw encrypted PDF bytes.
        password: User-supplied password.

    Returns:
        Decrypted PDF bytes.

    Raises:
        pikepdf.PasswordError: If the password is wrong.
        Exception: For any other pikepdf error.
    """
    import pikepdf

    with pikepdf.open(io.BytesIO(pdf_bytes), password=password) as pdf:
        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()


async def upload_to_gcs_and_audit(
    phone: str,
    doc_type: str,
    raw_bytes: bytes,
    content_type: str,
    broker_name: Optional[str] = None,
) -> dict:
    """Upload raw bytes to GCS and insert a wa_documents audit row.

    Args:
        phone: E.164 phone number of the user.
        doc_type: 'cas' | 'broker_pl' | 'broker_holdings' | 'itr'.
        raw_bytes: File bytes to upload.
        content_type: MIME type.
        broker_name: Optional broker name for broker documents.

    Returns:
        dict with keys: doc_id (UUID str), gcs_path (full gs:// URI).
    """
    doc_id = str(uuid.uuid4())
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    ext = _content_type_to_ext(content_type)
    path = f"wa-uploads/{phone.lstrip('+')}/{doc_type}_{ts}_{doc_id[:8]}.{ext}"

    gcs_uri = await gcs_client.upload_bytes(path, raw_bytes, content_type)

    # Insert audit row
    try:
        sb = _service_supabase()
        row = {
            "id": doc_id,
            "wa_phone": phone,
            "doc_type": doc_type,
            "broker_name": broker_name,
            "gcs_path": gcs_uri,
            "parse_status": "pending",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }
        sb.table("wa_documents").insert(row).execute()
        logger.info(f"wa_documents audit row created: id={doc_id}, phone={phone}, type={doc_type}")
    except Exception as e:
        logger.error(f"Failed to insert wa_documents audit row: {e}")
        # Don't raise — GCS upload succeeded, audit failure is non-fatal

    return {"doc_id": doc_id, "gcs_path": gcs_uri}


async def delete_from_gcs_and_audit(gcs_uri: str, doc_id: str) -> None:
    """Delete GCS object and update wa_documents.gcs_deleted_at for DPDPA compliance.

    This must complete within 60 seconds of successful parsing (DPDPA requirement).

    Args:
        gcs_uri: Full gs:// URI returned by upload_to_gcs_and_audit.
        doc_id: UUID of the wa_documents row to update.
    """
    deleted_at = datetime.now(timezone.utc)

    try:
        path = gcs_client.gcs_path_from_uri(gcs_uri)
        await gcs_client.delete_object(path)
    except Exception as e:
        logger.error(f"GCS delete failed: gcs_uri={gcs_uri}, doc_id={doc_id}: {e}")

    try:
        sb = _service_supabase()
        sb.table("wa_documents").update({
            "gcs_deleted_at": deleted_at.isoformat(),
            "gcs_path": None,
        }).eq("id", doc_id).execute()
        logger.info(f"wa_documents gcs_deleted_at set: id={doc_id}")
    except Exception as e:
        logger.error(f"Failed to update wa_documents gcs_deleted_at: {e}")


async def mark_parse_status(
    doc_id: str,
    status: str,
    error_detail: Optional[str] = None,
) -> None:
    """Update parse_status and parsed_at for a wa_documents row.

    Args:
        doc_id: UUID of the row.
        status: 'parsed' | 'failed'.
        error_detail: Optional error message for 'failed' status.
    """
    try:
        sb = _service_supabase()
        update: dict = {
            "parse_status": status,
            "parsed_at": datetime.now(timezone.utc).isoformat(),
        }
        if error_detail:
            update["error_detail"] = error_detail
        sb.table("wa_documents").update(update).eq("id", doc_id).execute()
    except Exception as e:
        logger.error(f"Failed to update wa_documents parse_status: {e}")


def _content_type_to_ext(content_type: str) -> str:
    mapping = {
        "application/pdf": "pdf",
        "text/csv": "csv",
        "application/csv": "csv",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/json": "json",
    }
    return mapping.get(content_type.split(";")[0].strip(), "bin")
