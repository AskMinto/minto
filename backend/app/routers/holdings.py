from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..db.supabase import get_supabase_client
from ..services.portfolio import compute_portfolio

router = APIRouter(prefix="/holdings", tags=["holdings"])


class HoldingCreate(BaseModel):
    symbol: str | None = None
    exchange: str | None = None
    instrument_id: str | None = None
    qty: float
    avg_cost: float | None = None
    asset_type: str | None = None
    sector: str | None = None
    mcap_bucket: str | None = None
    scheme_code: int | None = None
    scheme_name: str | None = None
    fund_house: str | None = None


class HoldingUpdate(BaseModel):
    qty: float | None = None
    avg_cost: float | None = None
    asset_type: str | None = None
    sector: str | None = None
    mcap_bucket: str | None = None
    scheme_code: int | None = None
    scheme_name: str | None = None
    fund_house: str | None = None


@router.get("")
def list_holdings(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("holdings")
        .select("*")
        .eq("user_id", user.user_id)
        .execute()
    )
    holdings = result.data or []
    portfolio = compute_portfolio(holdings)
    return {
        "holdings": portfolio["holdings"],
    }


@router.post("")
def create_holding(payload: HoldingCreate, user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    asset_type = payload.asset_type
    if payload.scheme_code and not asset_type:
        asset_type = "mutual_fund"
    row = {
        "user_id": user.user_id,
        "source": "manual",
        "symbol": payload.symbol,
        "exchange": payload.exchange,
        "instrument_id": payload.instrument_id,
        "qty": payload.qty,
        "avg_cost": payload.avg_cost,
        "asset_type": asset_type,
        "sector": payload.sector,
        "mcap_bucket": payload.mcap_bucket,
        "scheme_code": payload.scheme_code,
        "scheme_name": payload.scheme_name,
        "fund_house": payload.fund_house,
    }
    result = supabase.table("holdings").insert(row).execute()
    return result.data[0] if result.data else row


@router.patch("/{holding_id}")
def update_holding(
    holding_id: str, payload: HoldingUpdate, user: UserContext = Depends(get_user_context)
):
    supabase = get_supabase_client(user.token)
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No updates provided")
    result = (
        supabase.table("holdings")
        .update(updates)
        .eq("id", holding_id)
        .eq("user_id", user.user_id)
        .execute()
    )
    return result.data[0] if result.data else updates


@router.delete("/{holding_id}")
def delete_holding(holding_id: str, user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    supabase.table("holdings").delete().eq("id", holding_id).eq("user_id", user.user_id).execute()
    return {"status": "ok"}
