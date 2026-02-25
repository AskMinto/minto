from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..core.config import DISCLAIMER_VERSION
from ..db.supabase import get_supabase_client

router = APIRouter(prefix="/risk", tags=["risk"])


class RiskAckResponse(BaseModel):
    acknowledged: bool
    accepted_at: str | None = None
    version: str | None = None


class RiskQuizRequest(BaseModel):
    answers: dict
    score: int
    level: str


@router.post("/ack", response_model=RiskAckResponse)
def acknowledge_risk(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    timestamp = datetime.now(timezone.utc).isoformat()
    # Ensure the user row exists in public.users (covers users created before the trigger)
    supabase.table("users").upsert(
        {"id": user.user_id, "email": user.email},
        on_conflict="id",
    ).execute()
    data = {
        "user_id": user.user_id,
        "accepted_at": timestamp,
        "version": DISCLAIMER_VERSION,
    }
    supabase.table("risk_acknowledgments").insert(data).execute()
    return RiskAckResponse(acknowledged=True, accepted_at=timestamp, version=DISCLAIMER_VERSION)


@router.get("/ack", response_model=RiskAckResponse)
def get_ack_status(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("risk_acknowledgments")
        .select("accepted_at,version")
        .eq("user_id", user.user_id)
        .order("accepted_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return RiskAckResponse(acknowledged=False)
    row = rows[0]
    return RiskAckResponse(
        acknowledged=True,
        accepted_at=row.get("accepted_at"),
        version=row.get("version"),
    )


@router.post("/quiz")
def submit_quiz(payload: RiskQuizRequest, user: UserContext = Depends(get_user_context)):
    if payload.level not in {"low", "medium", "high"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid risk level")
    supabase = get_supabase_client(user.token)
    existing = (
        supabase.table("risk_profiles")
        .select("id")
        .eq("user_id", user.user_id)
        .limit(1)
        .execute()
    )
    data = {
        "user_id": user.user_id,
        "risk_level": payload.level,
        "risk_score": payload.score,
        "quiz_answers": payload.answers,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing.data:
        supabase.table("risk_profiles").update(data).eq("user_id", user.user_id).execute()
    else:
        supabase.table("risk_profiles").insert(data).execute()
    return {"status": "ok"}


@router.get("/profile")
def get_profile(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("risk_profiles")
        .select("risk_level,risk_score,quiz_answers,updated_at")
        .eq("user_id", user.user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk profile not found")
    return result.data[0]
