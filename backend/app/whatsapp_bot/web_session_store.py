"""Supabase-backed session store for the Web Tax Saver.

Mirrors session_store.py but keyed by user_id (Supabase auth UUID) instead
of a phone number.  All writes use the service-role client (identical to
alert_poller.py and session_store.py).

Schema (tax_sessions — migration 008):
  user_id         uuid unique    — Supabase auth user ID
  session_state   jsonb          — all onboarding answers, parsed docs, analysis
  messages        jsonb          — last MAX_MESSAGES role/content pairs
  updated_at      timestamptz    — auto-updated by DB trigger
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

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


def load_tax_session(user_id: str) -> tuple[dict, list[dict]]:
    """Load session_state and message history for a user_id.

    Returns (session_state, messages).
    If no session exists yet, returns default session_state and empty messages.
    """
    try:
        result = (
            _sb()
            .table("tax_sessions")
            .select("session_state, messages")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]
            ss = row.get("session_state") or {}
            msgs = row.get("messages") or []
            merged = {**_DEFAULT_SESSION_STATE, **ss}
            return merged, msgs
    except Exception as e:
        logger.error(f"web_session_store.load_tax_session failed for {user_id}: {e}")

    return _DEFAULT_SESSION_STATE.copy(), []


def save_tax_session(
    user_id: str,
    session_state: dict,
    messages: list[dict],
) -> None:
    """Upsert session_state and messages for a user_id.

    Trims messages to the last MAX_MESSAGES entries before saving.
    """
    trimmed = messages[-MAX_MESSAGES:]
    try:
        _sb().table("tax_sessions").upsert(
            {
                "user_id": user_id,
                "session_state": session_state,
                "messages": trimmed,
            },
            on_conflict="user_id",
        ).execute()
    except Exception as e:
        logger.error(f"web_session_store.save_tax_session failed for {user_id}: {e}")


def delete_tax_session(user_id: str) -> None:
    """Delete all session data for a user_id (DPDPA right to erasure)."""
    try:
        _sb().table("tax_sessions").delete().eq("user_id", user_id).execute()
        logger.info(f"web_session_store.delete_tax_session: deleted for {user_id}")
    except Exception as e:
        logger.error(f"web_session_store.delete_tax_session failed for {user_id}: {e}")


def get_tax_session_summary(user_id: str) -> Optional[dict]:
    """Return a summary dict of what is stored for a user_id."""
    try:
        result = (
            _sb()
            .table("tax_sessions")
            .select("session_state, messages, created_at, updated_at")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error(f"web_session_store.get_tax_session_summary failed for {user_id}: {e}")
    return None
