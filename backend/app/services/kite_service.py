from __future__ import annotations

import hashlib
from typing import Any

import httpx

from ..core.config import KITE_API_KEY, KITE_API_SECRET, KITE_REDIRECT_URL

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
