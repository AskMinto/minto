"""
Backfill missing sector and mcap_bucket for holdings.

Equities  → yfinance Ticker.info (sector, marketCap)
Mutual Funds → MFAPI scheme_category

Usage:
    cd backend
    python -m scripts.backfill_holdings          # dry-run (print only)
    python -m scripts.backfill_holdings --apply  # actually update Supabase
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time

import httpx
from dotenv import load_dotenv

# Load env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("EXPO_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
MFAPI_BASE = os.getenv("MFAPI_BASE_URL", "https://api.mfapi.in")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    sys.exit("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env")


# ── Supabase helpers ──────────────────────────────────────────

def _make_service_role_token() -> str:
    """Build a service_role JWT so we can bypass RLS."""
    import jwt  # PyJWT (installed via supabase deps)

    # Extract the ref from the anon key
    payload = jwt.decode(SUPABASE_ANON_KEY, options={"verify_signature": False})
    ref = payload["ref"]
    now = int(time.time())
    token_payload = {
        "iss": "supabase",
        "ref": ref,
        "role": "service_role",
        "iat": now,
        "exp": now + 3600,
    }
    return jwt.encode(token_payload, SUPABASE_JWT_SECRET, algorithm="HS256")


def _headers() -> dict[str, str]:
    token = _make_service_role_token()
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def fetch_holdings_needing_backfill(client: httpx.Client) -> list[dict]:
    """Get all holdings where sector or mcap_bucket is null."""
    url = f"{SUPABASE_URL}/rest/v1/holdings"
    params = {"select": "*", "or": "(sector.is.null,mcap_bucket.is.null)"}
    resp = client.get(url, headers=_headers(), params=params)
    resp.raise_for_status()
    return resp.json()


def update_holding(client: httpx.Client, holding_id: str, updates: dict) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/holdings?id=eq.{holding_id}"
    resp = client.patch(url, headers=_headers(), json=updates)
    return resp.status_code in (200, 204)


# ── yfinance enrichment (equities) ───────────────────────────

def _yahoo_symbol(symbol: str, exchange: str | None) -> str:
    if not symbol:
        return symbol
    ex = (exchange or "").upper()
    if ex == "BSE":
        return f"{symbol}.BO"
    if ex in ("NSE", ""):
        return f"{symbol}.NS"
    return symbol


def enrich_equity(symbol: str, exchange: str | None) -> dict:
    """Fetch sector and mcap_bucket from yfinance."""
    import yfinance as yf
    import logging
    logging.getLogger("yfinance").setLevel(logging.CRITICAL)

    yahoo_sym = _yahoo_symbol(symbol, exchange)
    try:
        ticker = yf.Ticker(yahoo_sym)
        info = ticker.info or {}
    except Exception:
        return {}

    result = {}
    sector = info.get("sector")
    if sector:
        result["sector"] = sector

    mcap = info.get("marketCap")
    if mcap:
        mcap_cr = mcap / 1e7  # convert to crores
        if mcap_cr >= 20000:
            result["mcap_bucket"] = "Large Cap"
        elif mcap_cr >= 5000:
            result["mcap_bucket"] = "Mid Cap"
        else:
            result["mcap_bucket"] = "Small Cap"

    return result


# ── MFAPI enrichment (mutual funds) ─────────────────────────

def enrich_mutual_fund(scheme_code: int | None, scheme_name: str | None) -> dict:
    """Derive sector and mcap_bucket from the fund name stored in DB.

    We intentionally use the DB scheme_name as the primary signal because
    scheme_code mappings from CAS imports can be stale/mismatched.
    MFAPI category is only used as a supplement if the DB name is absent.
    """
    db_name = (scheme_name or "").strip()

    # If we have a name in the DB, classify from it directly
    if db_name:
        return _classify_mf("", db_name.lower())

    # Fallback: try MFAPI if we only have a scheme_code
    if scheme_code:
        try:
            resp = httpx.get(f"{MFAPI_BASE}/mf/{scheme_code}/latest", timeout=15)
            resp.raise_for_status()
            data = resp.json()
            meta = data.get("meta", {})
            category = (meta.get("scheme_category") or "").lower()
            name = (meta.get("scheme_name") or "").lower()
            return _classify_mf(category, name)
        except Exception:
            pass

    return {}


def _infer_from_name(name: str) -> dict:
    return _classify_mf("", name.lower())


def _classify_mf(category: str, name: str) -> dict:
    combined = f"{category} {name}"

    # Sector
    sector = "Equity"
    if any(kw in combined for kw in ["debt", "bond", "gilt", "liquid", "money market", "overnight", "floating"]):
        sector = "Debt"
    elif any(kw in combined for kw in ["hybrid", "balanced", "equity savings"]):
        sector = "Hybrid"
    elif any(kw in combined for kw in ["gold", "silver", "commodity"]):
        sector = "Commodity"
    elif any(kw in combined for kw in ["index", "nifty", "sensex", "s&p"]):
        sector = "Index"
    elif "elss" in combined or "tax" in combined:
        sector = "Equity"

    # Mcap bucket
    mcap = None
    if any(kw in combined for kw in ["large cap", "largecap", "bluechip", "nifty 50", "sensex", "nifty50"]):
        mcap = "Large Cap"
    elif any(kw in combined for kw in ["mid cap", "midcap", "mid-cap", "emerging"]):
        mcap = "Mid Cap"
    elif any(kw in combined for kw in ["small cap", "smallcap", "small-cap"]):
        mcap = "Small Cap"
    elif any(kw in combined for kw in ["flexi cap", "flexicap", "flexi-cap", "multi cap", "multicap"]):
        mcap = "Flexi Cap"
    elif any(kw in combined for kw in ["large & mid", "large and mid"]):
        mcap = "Large & Mid Cap"
    elif any(kw in combined for kw in ["gold", "silver", "commodity"]):
        mcap = None  # not applicable
    elif any(kw in combined for kw in ["hybrid", "balanced"]):
        mcap = "Multi Cap"
    elif any(kw in combined for kw in ["index", "nifty", "sensex"]):
        mcap = "Large Cap"

    result = {"sector": sector}
    if mcap:
        result["mcap_bucket"] = mcap
    return result


# ── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Backfill missing holdings data")
    parser.add_argument("--apply", action="store_true", help="Actually write updates to Supabase")
    args = parser.parse_args()

    client = httpx.Client(timeout=20)
    holdings = fetch_holdings_needing_backfill(client)

    if not holdings:
        print("All holdings already have sector and mcap_bucket. Nothing to do.")
        return

    print(f"Found {len(holdings)} holdings needing backfill:\n")

    updates_to_apply = []

    for h in holdings:
        hid = h["id"]
        asset_type = (h.get("asset_type") or "").lower()
        symbol = h.get("symbol")
        exchange = h.get("exchange")
        scheme_code = h.get("scheme_code")
        scheme_name = h.get("scheme_name")
        label = symbol or scheme_name or h.get("isin") or hid

        if asset_type in ("equity", "position") and symbol:
            enriched = enrich_equity(symbol, exchange)
        elif asset_type == "mutual_fund" and (scheme_code or scheme_name):
            enriched = enrich_mutual_fund(scheme_code, scheme_name)
        else:
            print(f"  SKIP  {label} — can't determine enrichment source")
            continue

        # Only fill what's actually missing
        patch = {}
        if not h.get("sector") and enriched.get("sector"):
            patch["sector"] = enriched["sector"]
        if not h.get("mcap_bucket") and enriched.get("mcap_bucket"):
            patch["mcap_bucket"] = enriched["mcap_bucket"]

        if not patch:
            print(f"  OK    {label} — no new data found")
            continue

        updates_to_apply.append((hid, label, patch))
        print(f"  FILL  {label} → {patch}")

    if not updates_to_apply:
        print("\nNothing to update.")
        return

    if not args.apply:
        print(f"\nDry run complete. {len(updates_to_apply)} holdings to update.")
        print("Run with --apply to write changes to Supabase.")
        return

    print(f"\nApplying {len(updates_to_apply)} updates...")
    ok = 0
    for hid, label, patch in updates_to_apply:
        if update_holding(client, hid, patch):
            ok += 1
            print(f"  ✓ {label}")
        else:
            print(f"  ✗ {label} — update failed")

    print(f"\nDone. {ok}/{len(updates_to_apply)} updated successfully.")


if __name__ == "__main__":
    main()
