from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from ..core.auth import UserContext, get_user_context
from ..db.supabase import get_supabase_client
from ..services.portfolio import compute_portfolio

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
    mf_holdings = sorted(
        [h for h in portfolio["holdings"] if h.get("scheme_code")],
        key=lambda x: x.get("value", 0),
        reverse=True,
    )

    # Read stored risk analysis instead of computing flags
    risk_result = (
        supabase.table("risk_analyses")
        .select("analysis")
        .eq("user_id", user.user_id)
        .limit(1)
        .execute()
    )
    stored_analysis = risk_result.data[0]["analysis"] if risk_result.data else None

    return {
        "totals": portfolio["totals"],
        "top_holdings": portfolio["top_holdings"],
        "mf_holdings": mf_holdings,
        "sector_split": portfolio["sector_split"],
        "mcap_split": portfolio["mcap_split"],
        "asset_split": portfolio["asset_split"],
        "asset_class_split": portfolio["asset_class_split"],
        "concentration_flags": stored_analysis.get("concentration_flags", []) if stored_analysis else [],
        "risk_analysis": stored_analysis,
    }


@router.post("/dashboard/analyze-risk")
def analyze_risk(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)

    # 1. Fetch holdings
    result = (
        supabase.table("holdings")
        .select("*")
        .eq("user_id", user.user_id)
        .execute()
    )
    holdings = result.data or []

    # 2. Compute portfolio
    portfolio = compute_portfolio(holdings)

    # 3. Fetch financial profile (optional)
    fp_result = (
        supabase.table("financial_profiles")
        .select("responses, metrics")
        .eq("user_id", user.user_id)
        .limit(1)
        .execute()
    )
    financial_profile = fp_result.data[0] if fp_result.data else None

    # 4. Run risk analysis
    from ..services.risk_agent import run_risk_analysis
    analysis = run_risk_analysis(portfolio, financial_profile)

    # 5. Upsert into risk_analyses table
    supabase.table("risk_analyses").upsert(
        {
            "user_id": user.user_id,
            "analysis": analysis,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id",
    ).execute()

    # 6. Return
    return {"analysis": analysis}


@router.get("/risk/concentration")
def get_concentration(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)

    # Read stored risk analysis
    risk_result = (
        supabase.table("risk_analyses")
        .select("analysis")
        .eq("user_id", user.user_id)
        .limit(1)
        .execute()
    )
    stored_analysis = risk_result.data[0]["analysis"] if risk_result.data else None
    flags = stored_analysis.get("concentration_flags", []) if stored_analysis else []
    return {"flags": flags}
