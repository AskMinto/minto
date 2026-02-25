from __future__ import annotations

from fastapi import APIRouter, Depends

from ..core.auth import UserContext, get_user_context
from ..db.supabase import get_supabase_client
from ..services.portfolio import compute_portfolio, concentration_flags

router = APIRouter(prefix="", tags=["dashboard"])


@router.get("/dashboard")
def get_dashboard(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("holdings")
        .select("*")
        .eq("user_id", user.user_id)
        .execute()
    )
    holdings = result.data or []
    portfolio = compute_portfolio(holdings)
    flags = concentration_flags(holdings)
    return {
        "totals": portfolio["totals"],
        "top_holdings": portfolio["top_holdings"],
        "sector_split": portfolio["sector_split"],
        "mcap_split": portfolio["mcap_split"],
        "asset_split": portfolio["asset_split"],
        "concentration_flags": flags,
    }


@router.get("/risk/concentration")
def get_concentration(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("holdings")
        .select("*")
        .eq("user_id", user.user_id)
        .execute()
    )
    holdings = result.data or []
    flags = concentration_flags(holdings)
    return {"flags": flags}
