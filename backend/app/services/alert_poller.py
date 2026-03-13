from __future__ import annotations

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from supabase import create_client

from ..core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from .whatsapp import send_whatsapp_alert

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def _service_supabase():
    """Create a Supabase client with service-role key — bypasses RLS."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _fetch_price(alert: dict) -> float | None:
    """Fetch current price for an alert's instrument."""
    try:
        if alert.get("scheme_code"):
            from .mfapi_service import get_latest_nav
            nav_data = get_latest_nav(int(alert["scheme_code"]))
            return nav_data.get("nav") if nav_data else None
        elif alert.get("symbol"):
            from .yfinance_service import get_quote
            quote = get_quote(symbol=alert["symbol"], exchange=alert.get("exchange"))
            return quote.get("price") if quote else None
    except Exception as e:
        logger.warning(f"_fetch_price error for alert {alert.get('id')}: {e}")
    return None


def _get_previous_close(alert: dict) -> float | None:
    """Get previous_close for pct_change alert types."""
    try:
        if alert.get("symbol"):
            from .yfinance_service import get_quote
            quote = get_quote(symbol=alert["symbol"], exchange=alert.get("exchange"))
            return quote.get("previous_close") if quote else None
    except Exception as e:
        logger.warning(f"_get_previous_close error: {e}")
    return None


def _check_condition(alert: dict, current_price: float) -> bool:
    """Return True if the alert condition is satisfied."""
    alert_type = alert["alert_type"]
    target = float(alert["target_value"])

    if alert_type == "above":
        return current_price >= target
    elif alert_type == "below":
        return current_price <= target
    elif alert_type in ("pct_change_up", "pct_change_down"):
        ref = _get_previous_close(alert)
        if ref and ref > 0:
            pct = ((current_price - ref) / ref) * 100
            if alert_type == "pct_change_up":
                return pct >= target
            else:
                return (-pct) >= target
    return False


def _compose_notification(alert: dict, triggered_price: float) -> str:
    """Build the chat message text for a triggered alert."""
    condition_text = {
        "above": f"risen above ₹{float(alert['target_value']):,.2f}",
        "below": f"dropped below ₹{float(alert['target_value']):,.2f}",
        "pct_change_up": f"risen by {float(alert['target_value'])}%",
        "pct_change_down": f"fallen by {float(alert['target_value'])}%",
    }.get(alert["alert_type"], f"hit your target of {alert['target_value']}")

    return (
        f"🔔 Price Alert Triggered!\n\n"
        f"{alert['display_name']} has {condition_text}.\n"
        f"Current price: ₹{triggered_price:,.2f}"
    )


async def _fire_alert(supabase, alert: dict, triggered_price: float):
    """Mark alert triggered, write a chat notification, and send WhatsApp if phone is set."""
    now = datetime.now(timezone.utc).isoformat()

    # Mark triggered
    supabase.table("price_alerts").update({
        "status": "triggered",
        "triggered_at": now,
        "triggered_price": triggered_price,
    }).eq("id", alert["id"]).execute()

    # Find or create the user's most-recent chat thread
    chat_result = (
        supabase.table("chats")
        .select("id")
        .eq("user_id", alert["user_id"])
        .order("last_message_at", desc=True)
        .limit(1)
        .execute()
    )
    if chat_result.data:
        chat_id = chat_result.data[0]["id"]
    else:
        chat = supabase.table("chats").insert({
            "user_id": alert["user_id"],
            "title": "Minto Chat",
            "last_message_at": now,
        }).execute().data[0]
        chat_id = chat["id"]

    message = _compose_notification(alert, triggered_price)

    supabase.table("chat_messages").insert({
        "chat_id": chat_id,
        "user_id": alert["user_id"],
        "role": "assistant",
        "content": message,
        "metadata": {"widgets": [], "alert_triggered": True},
        "created_at": now,
    }).execute()

    supabase.table("chats").update({"last_message_at": now}).eq("id", chat_id).execute()

    # Send WhatsApp if user has a phone number
    try:
        user_result = (
            supabase.table("users")
            .select("phone_number")
            .eq("id", alert["user_id"])
            .limit(1)
            .execute()
        )
        phone = (user_result.data or [{}])[0].get("phone_number")
        if phone:
            send_whatsapp_alert(phone, message)
    except Exception as e:
        logger.warning(f"WhatsApp lookup/send failed for alert {alert['id']}: {e}")

    logger.info(
        f"Alert fired: id={alert['id']}, user={alert['user_id']}, "
        f"instrument={alert['display_name']}, price={triggered_price}"
    )


async def check_and_fire_alerts():
    """Scheduled job: fetch active alerts, check conditions, fire triggered ones."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("SUPABASE_SERVICE_ROLE_KEY not set — alert poller skipped")
        return

    logger.debug("Alert poller: checking active alerts")
    supabase = _service_supabase()

    try:
        result = supabase.table("price_alerts").select("*").eq("status", "active").execute()
        alerts = result.data or []
    except Exception as e:
        logger.error(f"Alert poller: failed to fetch alerts: {e}")
        return

    logger.debug(f"Alert poller: found {len(alerts)} active alert(s)")

    for alert in alerts:
        try:
            current_price = _fetch_price(alert)
            if current_price is None:
                continue
            if _check_condition(alert, current_price):
                await _fire_alert(supabase, alert, current_price)
        except Exception as e:
            logger.error(f"Alert poller: error processing alert {alert.get('id')}: {e}")


def start_alert_scheduler():
    """Start the APScheduler background job for alert polling (every 5 minutes)."""
    scheduler.add_job(
        check_and_fire_alerts,
        trigger="interval",
        minutes=5,
        id="alert_poller",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Alert scheduler started (interval: 5 minutes)")


def stop_alert_scheduler():
    """Stop the APScheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Alert scheduler stopped")
