from __future__ import annotations

import hashlib
from typing import Any

import httpx

from ..core.config import KITE_API_KEY, KITE_API_SECRET, KITE_REDIRECT_URL
from .mfapi_service import get_latest_nav, resolve_isin_to_scheme

KITE_BASE_URL = "https://api.kite.trade"
KITE_LOGIN_URL = "https://kite.zerodha.com/connect/login"


def get_login_url() -> str:
    """Return the Kite Connect OAuth login URL."""
    return f"{KITE_LOGIN_URL}?v=3&api_key={KITE_API_KEY}"


def exchange_token(request_token: str) -> str:
    """Exchange a request_token for an access_token using the Kite session API."""
    checksum = hashlib.sha256(
        f"{KITE_API_KEY}{request_token}{KITE_API_SECRET}".encode()
    ).hexdigest()

    with httpx.Client(timeout=15) as client:
        resp = client.post(
            f"{KITE_BASE_URL}/session/token",
            data={
                "api_key": KITE_API_KEY,
                "request_token": request_token,
                "checksum": checksum,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return data["data"]["access_token"]


def fetch_holdings(access_token: str) -> list[dict[str, Any]]:
    """Fetch the user's demat holdings from Kite Connect."""
    headers = {
        "X-Kite-Version": "3",
        "Authorization": f"token {KITE_API_KEY}:{access_token}",
    }
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{KITE_BASE_URL}/portfolio/holdings", headers=headers)
        resp.raise_for_status()
        data = resp.json()

    return data.get("data", [])


def fetch_mf_holdings(access_token: str) -> list[dict[str, Any]]:
    """Fetch the user's mutual fund holdings from Kite Connect."""
    headers = {
        "X-Kite-Version": "3",
        "Authorization": f"token {KITE_API_KEY}:{access_token}",
    }
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{KITE_BASE_URL}/mf/holdings", headers=headers)
        resp.raise_for_status()
        data = resp.json()

    return data.get("data", [])


def fetch_positions(access_token: str) -> list[dict[str, Any]]:
    """Fetch the user's net positions from Kite Connect."""
    headers = {
        "X-Kite-Version": "3",
        "Authorization": f"token {KITE_API_KEY}:{access_token}",
    }
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{KITE_BASE_URL}/portfolio/positions", headers=headers)
        resp.raise_for_status()
        data = resp.json()

    payload = data.get("data", {}) if isinstance(data, dict) else {}
    return payload.get("net", []) if isinstance(payload, dict) else []


def map_kite_holdings(raw_holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map Kite Connect holding fields to the Minto holdings schema."""
    mapped = []
    for h in raw_holdings:
        mapped.append({
            "symbol": h.get("tradingsymbol"),
            "exchange": h.get("exchange"),
            "isin": h.get("isin"),
            "qty": h.get("quantity", 0),
            "avg_cost": h.get("average_price", 0),
            "asset_type": "equity",
        })
    return mapped


def map_kite_mf_holdings(raw_holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map Kite Connect mutual fund holdings to the Minto holdings schema."""
    mapped = []
    for h in raw_holdings:
        isin = h.get("tradingsymbol") or h.get("isin")
        scheme_name = h.get("fund")
        entry: dict[str, Any] = {
            "isin": isin,
            "qty": h.get("quantity", 0),
            "avg_cost": h.get("average_price", 0),
            "asset_type": "mutual_fund",
            "scheme_name": scheme_name,
        }

        if isin:
            mf_match = resolve_isin_to_scheme(isin)
            if mf_match and mf_match.get("scheme_code"):
                entry["scheme_code"] = mf_match["scheme_code"]
                entry["scheme_name"] = mf_match.get("scheme_name") or scheme_name
                nav_info = get_latest_nav(mf_match["scheme_code"])
                if nav_info.get("fund_house"):
                    entry["fund_house"] = nav_info["fund_house"]

        mapped.append(entry)
    return mapped


def map_kite_positions(raw_positions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map Kite Connect positions to the Minto holdings schema."""
    mapped = []
    for p in raw_positions:
        multiplier = p.get("multiplier") or 1
        try:
            multiplier_val = float(multiplier)
        except (TypeError, ValueError):
            multiplier_val = 1.0
        avg_price = p.get("average_price", 0)
        try:
            avg_cost = float(avg_price) * multiplier_val
        except (TypeError, ValueError):
            avg_cost = 0

        mapped.append({
            "symbol": p.get("tradingsymbol"),
            "exchange": p.get("exchange"),
            "instrument_id": str(p.get("instrument_token")) if p.get("instrument_token") is not None else None,
            "qty": p.get("quantity", 0),
            "avg_cost": avg_cost,
            "asset_type": "position",
        })
    return mapped
