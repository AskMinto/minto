from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..db.supabase import get_supabase_client

router = APIRouter(prefix="/financial-profile", tags=["financial-profile"])


class FinancialProfilePayload(BaseModel):
    responses: dict
    metrics: dict | None = None
    version: str | None = None


@router.post("")
def upsert_financial_profile(
    payload: FinancialProfilePayload,
    user: UserContext = Depends(get_user_context),
):
    if not payload.responses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Responses are required",
        )

    supabase = get_supabase_client(user.token)
    data = {
        "user_id": user.user_id,
        "version": payload.version or "v1",
        "responses": payload.responses,
        "metrics": payload.metrics,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("financial_profiles").upsert(
        data,
        on_conflict="user_id",
    ).execute()
    return {"status": "ok"}
