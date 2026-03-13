from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..db.supabase import get_supabase_client

router = APIRouter(prefix="/user", tags=["user"])

_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


class PhonePayload(BaseModel):
    phone_number: str


@router.post("/phone")
def save_phone(payload: PhonePayload, user: UserContext = Depends(get_user_context)):
    """Save or update the user's phone number (E.164 format required)."""
    if not _E164_RE.match(payload.phone_number):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number must be in E.164 format (e.g. +919876543210)",
        )
    supabase = get_supabase_client(user.token)
    supabase.table("users").update(
        {"phone_number": payload.phone_number}
    ).eq("id", user.user_id).execute()
    return {"status": "ok"}


@router.get("/phone")
def get_phone(user: UserContext = Depends(get_user_context)):
    """Return the user's stored phone number (or null)."""
    supabase = get_supabase_client(user.token)
    result = (
        supabase.table("users")
        .select("phone_number")
        .eq("id", user.user_id)
        .limit(1)
        .execute()
    )
    phone = (result.data or [{}])[0].get("phone_number")
    return {"phone_number": phone}
