from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from cachetools import TTLCache
from jose import jwk, jwt
from jose.utils import base64url_decode
from fastapi import Header, HTTPException, status

from .config import SUPABASE_JWKS_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET

_jwks_cache: TTLCache[str, Any] = TTLCache(maxsize=1, ttl=3600)


@dataclass
class UserContext:
    user_id: str
    email: str | None
    token: str


def _get_jwks() -> dict | None:
    if "jwks" in _jwks_cache:
        return _jwks_cache["jwks"]
    if not SUPABASE_JWKS_URL:
        return None
    try:
        with httpx.Client(timeout=10) as client:
            headers = {}
            if SUPABASE_ANON_KEY:
                headers = {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                }
            resp = client.get(SUPABASE_JWKS_URL, headers=headers)
            resp.raise_for_status()
            jwks = resp.json()
        _jwks_cache["jwks"] = jwks
        return jwks
    except Exception:
        return None


def _verify_jwt_with_secret(token: str) -> dict:
    """Verify JWT using the Supabase JWT secret (HMAC HS256)."""
    claims = jwt.decode(
        token,
        SUPABASE_JWT_SECRET,
        algorithms=["HS256"],
        options={"verify_aud": False},
    )
    return claims


def _verify_jwt_with_jwks(token: str) -> dict:
    """Verify JWT using JWKS public keys (RSA)."""
    jwks = _get_jwks()
    if not jwks:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="JWKS not available and SUPABASE_JWT_SECRET not configured",
        )
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header")

    key_data = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not key_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signing key not found")

    public_key = jwk.construct(key_data)
    message, encoded_signature = token.rsplit(".", 1)
    decoded_signature = base64url_decode(encoded_signature.encode())

    if not public_key.verify(message.encode(), decoded_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")

    claims = jwt.decode(
        token,
        public_key.to_pem(),
        algorithms=[unverified_header.get("alg", "RS256")],
        options={"verify_aud": False},
    )
    return claims


def _verify_jwt(token: str) -> dict:
    # Prefer JWT secret (simpler, always works with Supabase)
    if SUPABASE_JWT_SECRET:
        return _verify_jwt_with_secret(token)
    # Fall back to JWKS
    return _verify_jwt_with_jwks(token)


def get_user_context(authorization: str | None = Header(default=None)) -> UserContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    claims = _verify_jwt(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    email = claims.get("email")
    return UserContext(user_id=user_id, email=email, token=token)
