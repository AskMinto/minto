"""Daily reminder scheduler for WhatsApp Tax Bot (US-32).

Runs a daily APScheduler job at 9:00 AM IST.
Queries wa_agent_sessions for sessions where:
  session_state.reminder_opted_in = true
  session_state.reminder_date = today (YYYY-MM-DD)

Sends a WhatsApp reminder with the user's plan summary and a staleness warning.
Uses the existing send_whatsapp_alert() from services/whatsapp.py.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone

logger = logging.getLogger(__name__)


async def send_tax_reminders() -> None:
    """Daily job: find opted-in sessions due today and send reminders."""
    from ..core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

    if not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("SUPABASE_SERVICE_ROLE_KEY not set — reminder job skipped")
        return

    today_str = date.today().isoformat()
    logger.info(f"Tax reminder job: checking for reminders due on {today_str}")

    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        # Query wa_agent_sessions for due reminders
        # session_state is stored as JSONB; filter via Supabase PostgREST
        result = sb.table("wa_agent_sessions").select("user_id, session_state").execute()
        sessions = result.data or []
    except Exception as e:
        logger.error(f"Tax reminder job: failed to query sessions: {e}")
        return

    sent = 0
    for session in sessions:
        try:
            ss_raw = session.get("session_state") or {}
            if isinstance(ss_raw, str):
                ss = json.loads(ss_raw)
            else:
                ss = ss_raw

            if not ss.get("reminder_opted_in"):
                continue

            reminder_date = ss.get("reminder_date")
            if reminder_date != today_str:
                continue

            phone = session.get("user_id", "")
            if not phone:
                continue

            message = _build_reminder_message(ss)
            from ..services.whatsapp import send_whatsapp_alert
            success = send_whatsapp_alert(phone, message)
            if success:
                sent += 1
                logger.info(f"Tax reminder sent to {phone}")
                # Clear the reminder flag so it doesn't re-send tomorrow
                try:
                    sb.table("wa_agent_sessions").update({
                        "session_state": json.dumps({**ss, "reminder_opted_in": False})
                    }).eq("user_id", phone).execute()
                except Exception as update_err:
                    logger.warning(f"Could not clear reminder flag for {phone}: {update_err}")

        except Exception as e:
            logger.error(f"Tax reminder job: error for session {session.get('user_id')}: {e}")

    logger.info(f"Tax reminder job complete: {sent} reminder(s) sent")


def _build_reminder_message(ss: dict) -> str:
    """Build the reminder WhatsApp message with staleness warning."""
    from .tax_engine import days_to_deadline

    days = days_to_deadline()
    session_step = ss.get("step", "unknown")

    # Try to reconstruct a summary from session_state
    tax = ss.get("tax_analysis") or {}
    total_tax = tax.get("total_tax", 0)
    exemption_remaining = tax.get("exemption_remaining", 0)

    cas = ss.get("cas_parsed") or {}
    cas_date = cas.get("cas_generation_date", "")
    session_date = cas_date or "your last session"

    lines = [
        f"Hi! This is your Minto tax plan reminder.",
        "",
        f"You have {days} days left until March 31 2026.",
        "",
    ]

    if total_tax == 0 and exemption_remaining > 0:
        lines.append(f"Your current tax liability is Rs 0.")
        lines.append(f"Remaining LTCG exemption to use: Rs {exemption_remaining:,.0f}")
        lines.append("")
        lines.append("Don't forget to book gains up to this limit before March 31st.")
    elif total_tax > 0:
        lines.append(f"Your estimated tax liability: Rs {total_tax:,.0f}")
        lines.append("Your loss harvesting plan is ready — act before March 31st.")

    lines += [
        "",
        f"STALENESS WARNING: This plan was built using data from {session_date}.",
        "NAVs and unrealised gains may have changed since then.",
        "Check your current holdings on your fund or broker app before acting.",
        "",
        "To get an updated plan, start a new session at minto.in/tax",
    ]

    if days <= 3:
        lines.insert(0, f"URGENT: Only {days} days left. Act today.")

    return "\n".join(lines)


def start_wa_reminder_scheduler(scheduler) -> None:
    """Register the daily 9:00 AM IST reminder job with an existing APScheduler."""
    scheduler.add_job(
        send_tax_reminders,
        trigger="cron",
        hour=9,
        minute=0,
        timezone="Asia/Kolkata",
        id="wa_tax_reminders",
        replace_existing=True,
    )
    logger.info("WhatsApp tax reminder scheduler registered (daily 9:00 AM IST)")
