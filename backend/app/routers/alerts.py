from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..db.supabase import get_supabase_client

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    display_name: str
    alert_type: str          # 'above' | 'below' | 'pct_change_up' | 'pct_change_down'
    target_value: float
    symbol: str | None = None
    exchange: str | None = None
    scheme_code: int | None = None


@router.get("")
def list_alerts(user: UserContext = Depends(get_user_context)):
    """List all active price alerts for the authenticated user."""
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("price_alerts")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("status", "active")
        .order("created_at", desc=True)
        .execute()
    )
    return {"alerts": result.data or []}


@router.post("")
def create_alert(payload: AlertCreate, user: UserContext = Depends(get_user_context)):
    """Create a new price alert."""
    valid_types = {"above", "below", "pct_change_up", "pct_change_down"}
    if payload.alert_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"alert_type must be one of: {', '.join(sorted(valid_types))}",
        )
    if not payload.symbol and not payload.scheme_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either symbol (equity) or scheme_code (mutual fund)",
        )

    supabase = get_supabase_client(user.token)
    row = {
        "user_id": user.user_id,
        "display_name": payload.display_name,
        "alert_type": payload.alert_type,
        "target_value": payload.target_value,
        "status": "active",
    }
    if payload.symbol:
        row["symbol"] = payload.symbol.upper()
        row["exchange"] = (payload.exchange or "NSE").upper()
    if payload.scheme_code:
        row["scheme_code"] = payload.scheme_code

    result = supabase.table("price_alerts").insert(row).execute()
    return result.data[0] if result.data else row


@router.delete("/{alert_id}")
def cancel_alert(alert_id: str, user: UserContext = Depends(get_user_context)):
    """Cancel (soft-delete) a price alert by ID."""
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("price_alerts")
        .update({"status": "cancelled"})
        .eq("id", alert_id)
        .eq("user_id", user.user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found or already cancelled",
        )
    return {"status": "cancelled"}
