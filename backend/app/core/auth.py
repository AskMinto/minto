from __future__ import annotations

from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException, status

from .config import SUPABASE_URL, SUPABASE_ANON_KEY


@dataclass
class UserContext:
    user_id: str
    email: str | None
    token: str


def _verify_token_via_supabase(token: str) -> dict:
    """Verify an access token by calling Supabase Auth's /auth/v1/user endpoint."""
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL is not configured")

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": SUPABASE_ANON_KEY or "",
    }

    with httpx.Client(timeout=10) as client:
        resp = client.get(url, headers=headers)

    if resp.status_code == 401:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token verification failed")

    user = resp.json()
    return user


def get_user_context(authorization: str | None = Header(default=None)) -> UserContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    user = _verify_token_via_supabase(token)
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    email = user.get("email")
    return UserContext(user_id=user_id, email=email, token=token)
