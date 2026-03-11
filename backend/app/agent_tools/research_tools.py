"""
Research agent tools — standalone callable functions passed to the Agno research agent.

These are pure functions (no agent state) so they can be imported and called
directly from anywhere (e.g. the voice tool proxy in chats.py).
"""

from __future__ import annotations

import json
import logging

from ..services.mfapi_service import get_latest_nav as mf_get_nav, search_schemes
from ..services.yfinance_service import search as yf_search
from ..services.financial_profile import compute_metrics, ALL_UPDATABLE

logger = logging.getLogger(__name__)


def get_mf_nav(scheme_code: int) -> str:
    """Get the latest NAV for a mutual fund scheme by its MFAPI scheme code.

    Args:
        scheme_code: The MFAPI scheme code (integer).

    Returns:
        JSON string with scheme_name, scheme_code, nav, fund_house, date.
    """
    result = mf_get_nav(scheme_code)
    return json.dumps(result) if result else json.dumps({"error": "Scheme not found"})


def get_market_overview() -> str:
    """Get current Indian market overview including Nifty 50, Sensex, and Bank Nifty indices.

    Returns:
        JSON string with current index levels and day changes.
    """
    import yfinance as yf

    indices = {
        "^NSEI": "Nifty 50",
        "^BSESN": "Sensex",
        "^NSEBANK": "Bank Nifty",
    }
    results = []
    for symbol, name in indices.items():
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="2d", interval="1d")
            if hist is not None and not hist.empty:
                close = float(hist["Close"].iloc[-1])
                prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else None
                change = close - prev if prev else None
                change_pct = (change / prev * 100) if prev and prev != 0 else None
                results.append({
                    "name": name,
                    "symbol": symbol,
                    "value": round(close, 2),
                    "change": round(change, 2) if change else None,
                    "change_pct": round(change_pct, 2) if change_pct else None,
                })
        except Exception:
            continue
    return json.dumps(results) if results else json.dumps({"error": "Could not fetch market data"})


def search_instrument(query: str) -> str:
    """Search for stocks or mutual fund schemes by name, symbol, or ISIN.

    Args:
        query: Search query — can be a company name, stock symbol, or scheme name.

    Returns:
        JSON string with matching equities and mutual fund schemes.
    """
    yf_data = yf_search(query)
    equity_results = [
        {"symbol": q.get("symbol"), "name": q.get("name"), "exchange": q.get("exchange"), "type": "EQUITY"}
        for q in yf_data.get("quotes", [])[:6]
    ]
    mf_results = [
        {"scheme_code": m.get("scheme_code"), "name": m.get("scheme_name"), "type": "MUTUAL_FUND"}
        for m in search_schemes(query)[:6]
    ]
    return json.dumps(equity_results + mf_results)


def make_profile_update_tool(supabase_client, user_id: str):
    """Factory — returns a per-request tool for updating the user's financial profile.

    The returned function is passed directly to the Agno agent as a callable tool.
    """

    def update_financial_profile(updates: str) -> str:
        """Update the user's financial profile / balance sheet.

        Args:
            updates: JSON string of field:value pairs to update.
                Valid fields include: grossSalary, housing, homeLoanEMI, homeLoanOut,
                equityMF, shares, fd, cashBank, homeValue, carValue, goldPhysical,
                hasLifeInsurance, lifeInsuranceCover, hasHealthInsurance, healthInsuranceCover,
                entertainment, lifestyle, subscriptions, age, dependents, earningMembers,
                and many more. Values should be numbers for financial fields.
                For goals, pass the full goals array.

        Returns:
            Confirmation message with updated metrics summary.
        """
        try:
            field_updates = json.loads(updates)
        except (TypeError, json.JSONDecodeError):
            return "Error: updates must be a valid JSON string of field:value pairs."

        result = (
            supabase_client.table("financial_profiles")
            .select("responses,metrics")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return "Error: No financial profile found. The user needs to complete the financial profile questionnaire first."

        responses = result.data[0].get("responses", {})

        updated_fields = []
        for key, value in field_updates.items():
            if key == "goals":
                responses["goals"] = value
                updated_fields.append("goals")
            elif key in ALL_UPDATABLE:
                responses[key] = value
                updated_fields.append(key)
            else:
                return f"Error: '{key}' is not a valid field. Valid fields: {', '.join(sorted(ALL_UPDATABLE))}"

        if not updated_fields:
            return "No valid fields to update."

        new_metrics = compute_metrics(responses)

        from datetime import datetime, timezone
        supabase_client.table("financial_profiles").update({
            "responses": responses,
            "metrics": new_metrics,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()

        def fmt(v):
            if not v:
                return "—"
            return f"₹{v/100000:.1f}L" if v >= 100000 else f"₹{v:,.0f}"

        return (
            f"Updated: {', '.join(updated_fields)}. "
            f"New metrics — Income: {fmt(new_metrics['total_income'])}/mo, "
            f"Surplus: {fmt(new_metrics['monthly_surplus'])}/mo, "
            f"Net worth: {fmt(new_metrics['net_worth'])}, "
            f"DTI: {new_metrics['dti']:.1f}%, "
            f"Savings ratio: {new_metrics['savings_ratio']:.1f}%"
        )

    return update_financial_profile
