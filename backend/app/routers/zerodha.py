from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..db.supabase import get_supabase_client
from ..services.kite_service import get_login_url, exchange_token, fetch_holdings, map_kite_holdings

router = APIRouter(prefix="/zerodha", tags=["zerodha"])

# Temporary store: maps a user-generated nonce to their app redirect URL.
# In production, use Redis or a database. Fine for single-server dev.
_pending_redirects: dict[str, str] = {}


class CallbackPayload(BaseModel):
    request_token: str


@router.get("/redirect")
def redirect_to_app(request_token: str | None = None, **_kwargs):
    """
    Kite Connect redirects here after login.
    Returns an HTML page that forwards the request_token to the mobile app
    via JavaScript deep link (browsers block HTTP redirects to custom schemes).
    """
    # Pick the most recent pending redirect URL, or fall back to minto://
    app_url = "minto://zerodha-callback"
    if _pending_redirects:
        # Pop the most recently stored redirect URL
        last_key = list(_pending_redirects.keys())[-1]
        app_url = _pending_redirects.pop(last_key)

    if request_token:
        separator = "&" if "?" in app_url else "?"
        deep_link = f"{app_url}{separator}request_token={request_token}"
    else:
        separator = "&" if "?" in app_url else "?"
        deep_link = f"{app_url}{separator}error=no_token"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Redirecting…</title></head>
<body style="background:#1C211E;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Redirecting to Minto…</p>
<script>window.location.replace("{deep_link}");</script>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/login-url")
def login_url(app_redirect: str | None = None, user: UserContext = Depends(get_user_context)):
    _ = user
    if app_redirect:
        import uuid
        nonce = str(uuid.uuid4())
        _pending_redirects[nonce] = app_redirect
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
