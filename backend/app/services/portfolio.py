from __future__ import annotations

from collections import defaultdict
from typing import Any

from .yfinance_service import get_quote
from .mfapi_service import get_latest_nav
from .fund_weights import get_fund_weights


def _find_value(payload: Any, keys: list[str]) -> float | None:
    if not isinstance(payload, dict):
        return None
    for key in keys:
        if key in payload and payload[key] is not None:
            try:
                return float(payload[key])
            except (TypeError, ValueError):
                continue
    return None


def _unwrap_quote(data: Any) -> dict:
    if isinstance(data, dict):
        if "data" in data and isinstance(data["data"], dict):
            return data["data"]
        return data
    return {}


def extract_prices(quote: Any) -> tuple[float | None, float | None]:
    payload = _unwrap_quote(quote)
    ltp = _find_value(payload, ["price", "lastPrice", "ltp", "last_price", "tradePrice"])
    prev = _find_value(payload, ["previous_close", "prevClose", "previousClose", "close"])
    return ltp, prev


def compute_portfolio(holdings: list[dict[str, Any]]) -> dict[str, Any]:
    enriched = []
    total_value = 0.0
    invested = 0.0
    today_pnl = 0.0

    sector_totals = defaultdict(float)
    mcap_totals = defaultdict(float)
    asset_totals = defaultdict(float)

    for holding in holdings:
        qty = float(holding.get("qty") or 0)
        avg_cost = holding.get("avg_cost")
        avg_cost_val = float(avg_cost) if avg_cost is not None else None

        quote = {}
        scheme_code = holding.get("scheme_code")
        if scheme_code:
            # Mutual fund: price via MFAPI NAV
            nav_info = get_latest_nav(int(scheme_code))
            nav_val = nav_info.get("nav")
            current_price = nav_val if nav_val is not None else (avg_cost_val or 0.0)
            ltp = nav_val
            prev_close = None  # MFAPI doesn't provide previous NAV in latest
        elif holding.get("symbol"):
            quote = get_quote(
                symbol=holding.get("symbol"),
                exchange=holding.get("exchange"),
            )
            ltp, prev_close = extract_prices(quote)
            current_price = ltp if ltp is not None else (avg_cost_val or 0.0)
        else:
            ltp, prev_close = None, None
            current_price = avg_cost_val or 0.0

        value = current_price * qty
        invested_cost = (avg_cost_val if avg_cost_val is not None else current_price) * qty
        pnl = value - invested_cost
        pnl_pct = (pnl / invested_cost * 100) if invested_cost else 0.0
        today = 0.0
        if prev_close is not None:
            today = (current_price - prev_close) * qty

        total_value += value
        invested += invested_cost
        today_pnl += today

        asset = holding.get("asset_type") or "Unknown"
        asset_totals[asset] += value

        # Look-through analysis for mutual funds: distribute value
        # across underlying sectors/mcap proportionally.
        asset_lower = asset.lower()
        scheme_name = holding.get("scheme_name")
        if asset_lower == "mutual_fund" and scheme_name:
            weights = get_fund_weights(
                scheme_name=scheme_name,
                scheme_category=holding.get("sector"),
            )
            sw = weights.get("sector_weights", {})
            mw = weights.get("mcap_weights", {})
            if sw:
                for s_label, s_pct in sw.items():
                    sector_totals[s_label] += value * (s_pct / 100.0)
            else:
                sector_totals[holding.get("sector") or "Unknown"] += value
            if mw:
                for m_label, m_pct in mw.items():
                    mcap_totals[m_label] += value * (m_pct / 100.0)
            else:
                mcap_totals[holding.get("mcap_bucket") or "Unknown"] += value
        else:
            sector = holding.get("sector") or "Unknown"
            mcap = holding.get("mcap_bucket") or "Unknown"
            sector_totals[sector] += value
            mcap_totals[mcap] += value

        enriched.append(
            {
                **holding,
                "current_price": current_price,
                "value": value,
                "invested": invested_cost,
                "pnl": pnl,
                "pnl_pct": pnl_pct,
                "today_pnl": today,
            }
        )

    pnl_total = total_value - invested
    pnl_pct_total = (pnl_total / invested * 100) if invested else 0.0

    def to_split(data: dict[str, float]) -> list[dict[str, Any]]:
        return [
            {
                "label": key,
                "value": value,
                "pct": (value / total_value * 100) if total_value else 0.0,
            }
            for key, value in data.items()
        ]

    return {
        "totals": {
            "total_value": total_value,
            "invested": invested,
            "pnl": pnl_total,
            "pnl_pct": pnl_pct_total,
            "today_pnl": today_pnl,
        },
        "top_holdings": sorted(enriched, key=lambda x: x.get("value", 0), reverse=True)[:5],
        "sector_split": to_split(sector_totals),
        "mcap_split": to_split(mcap_totals),
        "asset_split": to_split(asset_totals),
        "holdings": enriched,
    }


def concentration_flags(holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    portfolio = compute_portfolio(holdings)
    total_value = portfolio["totals"]["total_value"] or 0.0
    if total_value == 0:
        return []

    top_holdings = sorted(
        portfolio["holdings"], key=lambda x: x.get("value", 0.0), reverse=True
    )
    top_three_value = sum(h.get("value", 0.0) for h in top_holdings[:3])

    flags = []
    for holding in top_holdings:
        pct = (holding.get("value", 0.0) / total_value) * 100
        if pct > 15:
            severity = "red" if pct > 25 else "yellow"
            flags.append(
                {
                    "type": "stock",
                    "label": holding.get("symbol") or holding.get("isin") or "Holding",
                    "pct": pct,
                    "severity": severity,
                    "why": "High single-stock exposure increases drawdown risk if that stock falls.",
                }
            )

    sector_totals = defaultdict(float)
    for holding in portfolio["holdings"]:
        sector = holding.get("sector") or "Unknown"
        sector_totals[sector] += holding.get("value", 0.0)

    for sector, value in sector_totals.items():
        pct = (value / total_value) * 100
        if pct > 30:
            severity = "red" if pct > 45 else "yellow"
            flags.append(
                {
                    "type": "sector",
                    "label": sector,
                    "pct": pct,
                    "severity": severity,
                    "why": "Sector concentration raises exposure to sector-specific shocks.",
                }
            )

    top_three_pct = (top_three_value / total_value) * 100
    if top_three_pct > 50:
        severity = "red" if top_three_pct > 65 else "yellow"
        flags.append(
            {
                "type": "top3",
                "label": "Top 3 holdings",
                "pct": top_three_pct,
                "severity": severity,
                "why": "Over half of the portfolio sits in three names, increasing volatility risk.",
            }
        )

    return flags
