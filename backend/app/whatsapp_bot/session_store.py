"""Supabase-backed session store for the WhatsApp Tax Bot.

Uses the existing service-role Supabase client (same pattern as alert_poller.py).
No direct Postgres connection required — consistent with the rest of the stack.

Schema (wa_agent_sessions):
  wa_phone        text unique    — E.164 phone number
  session_state   jsonb          — all onboarding answers, parsed docs, analysis
  messages        jsonb          — last MAX_MESSAGES role/content pairs for context
  updated_at      timestamptz    — auto-updated by DB trigger
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Keep the last 30 message turns in the DB; the agent receives the last 20 via
# num_history_runs.  Older messages are silently dropped to keep the payload small.
MAX_MESSAGES = 30

_DEFAULT_SESSION_STATE: dict = {
    "step": "welcome",
    "portfolio_type": [],
    "nps_tier": None,
    "ulip_disclaimer_active": False,
    "carry_forward": None,
    "tax_regime": None,
    "slab_rate": None,
    "base_income": None,
    "manual_cf_ltcl": None,
    "manual_cf_stcl": None,
    "documents_needed": [],
    "documents_done": [],
    "pending_doc_url": None,
    "pending_doc_type": None,
    "pending_doc_content_type": None,
    "pending_doc_broker_name": None,
    "pending_doc_gcs_uri": None,
    "pending_doc_id": None,
    "pending_doc_password_attempts": 0,
    "cas_parsed": None,
    "broker_pl_parsed": None,
    "broker_holdings_parsed": None,
    "itr_parsed": None,
    "tax_analysis": None,
    "reminder_opted_in": False,
    "reminder_date": None,
    "privacy_acknowledged": False,
    "notification_name": None,
    "notification_email": None,
    "blocked": False,
    "block_reason": None,
}


def _sb():
    from supabase import create_client
    from ..core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def load_session(phone: str) -> tuple[dict, list[dict]]:
    """Load session_state and message history for a phone number.

    Returns (session_state, messages).
    If no session exists yet, returns default session_state and empty messages list.
    """
    try:
        result = (
            _sb()
            .table("wa_agent_sessions")
            .select("session_state, messages")
            .eq("wa_phone", phone)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]
            ss = row.get("session_state") or {}
            msgs = row.get("messages") or []
            # Merge with defaults so new keys added in code are present
            merged = {**_DEFAULT_SESSION_STATE, **ss}
            return merged, msgs
    except Exception as e:
        logger.error(f"session_store.load_session failed for {phone}: {e}")

    return _DEFAULT_SESSION_STATE.copy(), []


def save_session(
    phone: str,
    session_state: dict,
    messages: list[dict],
) -> None:
    """Upsert session_state and messages for a phone number.

    Trims messages to the last MAX_MESSAGES entries before saving.
    """
    trimmed_messages = messages[-MAX_MESSAGES:]
    try:
        _sb().table("wa_agent_sessions").upsert(
            {
                "wa_phone": phone,
                "session_state": session_state,
                "messages": trimmed_messages,
            },
            on_conflict="wa_phone",
        ).execute()
    except Exception as e:
        logger.error(f"session_store.save_session failed for {phone}: {e}")


def delete_session(phone: str) -> None:
    """Delete all session data for a phone number (DPDPA right to erasure)."""
    try:
        _sb().table("wa_agent_sessions").delete().eq("wa_phone", phone).execute()
        logger.info(f"session_store.delete_session: deleted session for {phone}")
    except Exception as e:
        logger.error(f"session_store.delete_session failed for {phone}: {e}")


def get_session_summary(phone: str) -> Optional[dict]:
    """Return a dict summary of what is stored for a phone number."""
    try:
        result = (
            _sb()
            .table("wa_agent_sessions")
            .select("session_state, messages, created_at, updated_at")
            .eq("wa_phone", phone)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error(f"session_store.get_session_summary failed for {phone}: {e}")
    return None
