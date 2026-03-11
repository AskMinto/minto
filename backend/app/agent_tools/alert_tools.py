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

    return create_alert, list_alerts, cancel_alert
