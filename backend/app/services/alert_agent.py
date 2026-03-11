from __future__ import annotations

import json
import logging

from agno.agent import Agent
from agno.models.google import Gemini

from ..core.prompts import prompts

logger = logging.getLogger(__name__)


def _make_alert_agent(supabase_client, user_id: str) -> Agent:
    """Build a per-request alert management agent backed by Supabase tools."""

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
            display_name: Human-readable instrument name (e.g. "SBI Bank", "Parag Parikh Flexi Cap").
            alert_type: One of 'above', 'below', 'pct_change_up', 'pct_change_down'.
            target_value: Price threshold (for above/below) or percentage magnitude (for pct_change_*).
            symbol: Ticker symbol without exchange suffix, e.g. "SBIN" (equities only).
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
            JSON array of active alert objects, each with id, display_name,
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

    cfg = prompts.raw.get("alert_agent", {}).get("config", {})
    instructions = prompts.raw.get("alert_agent", {}).get("instructions", [])
    role = prompts.raw.get("alert_agent", {}).get("role", "Manage price alerts")

    return Agent(
        name="Alert Agent",
        role=role,
        model=Gemini(
            id=cfg.get("model", "gemini-3-flash-preview"),
            temperature=cfg.get("temperature", 0.1),
        ),
        tools=[create_alert, list_alerts, cancel_alert],
        instructions=instructions,
        markdown=False,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
    )
