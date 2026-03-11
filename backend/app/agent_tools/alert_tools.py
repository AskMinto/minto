"""
Alert agent tools — Supabase-backed callables for price alert CRUD.

All three functions are closures that capture supabase_client and user_id,
built via make_alert_tools() and passed directly to the Agno alert agent.
"""

from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


def make_alert_tools(supabase_client, user_id: str):
    """Factory — returns (create_alert, list_alerts, cancel_alert) for the given user.

    The returned functions are passed directly to the Agno alert agent as callable tools.
    """

    def create_alert(
        display_name: str,
        alert_type: str,
        target_value: float,
        symbol: str | None = None,
        exchange: str = "NSE",
        scheme_code: int | None = None,
    ) -> str:
        """Create a price alert for an equity or mutual fund.

        Args:
            display_name: Human-readable instrument name (e.g. "SBI Bank").
            alert_type: One of 'above', 'below', 'pct_change_up', 'pct_change_down'.
            target_value: Price threshold (above/below) or percentage magnitude (pct_change_*).
            symbol: Ticker without exchange suffix, e.g. "SBIN" (equities only).
            exchange: "NSE" or "BSE" (equities only, default "NSE").
            scheme_code: MFAPI integer scheme code (mutual funds only).

        Returns:
            JSON string with success status and alert_id or error message.
        """
        row: dict = {
            "user_id": user_id,
            "display_name": display_name,
            "alert_type": alert_type,
            "target_value": target_value,
            "status": "active",
        }
        if symbol:
            row["symbol"] = symbol.upper()
            row["exchange"] = exchange.upper()
        if scheme_code:
            row["scheme_code"] = int(scheme_code)

        try:
            result = supabase_client.table("price_alerts").insert(row).execute()
            if result.data:
                return json.dumps({
                    "success": True,
                    "alert_id": result.data[0]["id"],
                    "display_name": display_name,
                    "alert_type": alert_type,
                    "target_value": target_value,
                })
            return json.dumps({"success": False, "error": "Insert returned no data"})
        except Exception as e:
            logger.error(f"create_alert error: {e}")
            return json.dumps({"success": False, "error": str(e)})

    def list_alerts() -> str:
        """List all active price alerts for the current user.

        Returns:
            JSON array of active alert objects with id, display_name,
            alert_type, target_value, symbol, scheme_code, and created_at.
        """
        try:
            result = (
                supabase_client.table("price_alerts")
                .select("id,display_name,alert_type,target_value,symbol,exchange,scheme_code,created_at")
                .eq("user_id", user_id)
                .eq("status", "active")
                .order("created_at", desc=True)
                .execute()
            )
            return json.dumps(result.data or [])
        except Exception as e:
            logger.error(f"list_alerts error: {e}")
            return json.dumps({"error": str(e)})

    def cancel_alert(alert_id: str) -> str:
        """Cancel (deactivate) a price alert by its ID.

        Args:
            alert_id: UUID of the alert to cancel.

        Returns:
            JSON string with success status.
        """
        try:
            result = (
                supabase_client.table("price_alerts")
                .update({"status": "cancelled"})
                .eq("id", alert_id)
                .eq("user_id", user_id)
                .execute()
            )
            return json.dumps({"success": bool(result.data)})
        except Exception as e:
            logger.error(f"cancel_alert error: {e}")
            return json.dumps({"success": False, "error": str(e)})

    def request_alert_widget(
        display_name: str | None = None,
        symbol: str | None = None,
        exchange: str | None = None,
        scheme_code: int | None = None,
        alert_type: str | None = None,
        target_value: float | None = None,
    ) -> str:
        """Request an interactive alert-setup widget to be shown in chat.

        Call this instead of create_alert when the user's intent is clear but
        information is incomplete (missing instrument, condition, or target).
        Also call it when the user says something vague like 'set an alert'
        with no further details. Prefill whatever you know and the user will
        complete the rest in the widget.

        Args:
            display_name: Human-readable name if known (e.g. "Infosys").
            symbol: Ticker if known (e.g. "INFY").
            exchange: "NSE" or "BSE" if known.
            scheme_code: MFAPI scheme code if it's a mutual fund.
            alert_type: One of 'above', 'below', 'pct_change_up', 'pct_change_down' if known.
            target_value: Target price or percentage if known.

        Returns:
            Sentinel JSON that triggers the alert setup widget in the UI.
        """
        return json.dumps({
            "__widget": "alert_setup",
            "display_name": display_name,
            "symbol": symbol,
            "exchange": exchange,
            "scheme_code": scheme_code,
            "alert_type": alert_type,
            "target_value": target_value,
        })

    return create_alert, list_alerts, cancel_alert, request_alert_widget
