from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..core.config import KITE_REDIRECT_URL
from ..db.supabase import get_supabase_client
from ..services.kite_service import (
    get_login_url,
    exchange_token,
    fetch_holdings,
    map_kite_holdings,
)

router = APIRouter(prefix="/zerodha", tags=["zerodha"])


class CallbackPayload(BaseModel):
    request_token: str


@router.get("/redirect")
def redirect_to_app(request_token: str | None = None, status_param: str | None = None):
    """
    Kite Connect redirects here after login.
    Forwards the request_token to the mobile app via deep link.
    """
    if not request_token:
        deep_link = f"{KITE_REDIRECT_URL}?error=no_token"
    else:
        deep_link = f"{KITE_REDIRECT_URL}?request_token={request_token}"
    return RedirectResponse(url=deep_link)


@router.get("/login-url")
def login_url(user: UserContext = Depends(get_user_context)):
    _ = user
    return {"url": get_login_url()}


@router.post("/callback")
def callback(payload: CallbackPayload, user: UserContext = Depends(get_user_context)):
    try:
        access_token = exchange_token(payload.request_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to exchange Zerodha token",
        )

    try:
        raw_holdings = fetch_holdings(access_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch holdings from Zerodha",
        )

    mapped = map_kite_holdings(raw_holdings)
    supabase = get_supabase_client(user.token)

    # Delete existing Zerodha-sourced holdings before re-importing
    supabase.table("holdings").delete().eq("user_id", user.user_id).eq("source", "zerodha").execute()

    inserted = []
    for h in mapped:
        if not h.get("symbol") or not h.get("qty"):
            continue
        row = {
            "user_id": user.user_id,
            "source": "zerodha",
            "symbol": h["symbol"],
            "exchange": h.get("exchange"),
            "isin": h.get("isin"),
            "qty": h["qty"],
            "avg_cost": h.get("avg_cost"),
            "asset_type": h.get("asset_type", "equity"),
        }
        result = supabase.table("holdings").insert(row).execute()
        if result.data:
            inserted.append(result.data[0])

    return {"holdings": inserted, "count": len(inserted)}


@router.get("/status")
def connection_status(user: UserContext = Depends(get_user_context)):
    """Check if the user has any Zerodha-imported holdings."""
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("holdings")
        .select("id, created_at")
        .eq("user_id", user.user_id)
        .eq("source", "zerodha")
        .execute()
    )
    rows = result.data or []
    connected = len(rows) > 0
    return {
        "connected": connected,
        "holdings_count": len(rows),
        "imported_at": rows[0]["created_at"] if connected else None,
    }
