from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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


@router.post("/verify-phone-complete")
def verify_phone_complete(user: UserContext = Depends(get_user_context)):
    """Mark phone as OTP-verified after Supabase Phone OTP succeeds on the client.

    Called by the frontend /onboarding/verify-phone page after
    supabase.auth.verifyOtp() returns successfully.  We use the service-role
    client to set phone_verified = true and sync the verified phone number
    from the Supabase auth user record into the users table.

    This is separate from /user/phone which just saves the phone string
    without verification (used for the existing WhatsApp alerts opt-in).
    """
    from supabase import create_client

    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Service role key not configured.",
        )

    # Fetch the verified phone from the Supabase auth user record
    sb_service = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    try:
        auth_user = sb_service.auth.admin.get_user_by_id(user.user_id)
        phone = getattr(auth_user.user, "phone", None) if auth_user and auth_user.user else None
    except Exception:
        phone = None

    update_data: dict = {"phone_verified": True}
    if phone and _E164_RE.match(phone):
        update_data["phone_number"] = phone

    sb_service.table("users").upsert(
        {"id": user.user_id, **update_data},
        on_conflict="id",
    ).execute()

    return {"status": "ok", "phone": phone}
