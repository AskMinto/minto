from __future__ import annotations

from typing import Any

import httpx

from ..core.config import (
    MEM0_API_KEY,
    MEM0_PROJECT_KEY,
    MEM0_BASE_URL,
    MEM0_AUTH_HEADER,
    MEM0_AUTH_SCHEME,
    MEM0_PROJECT_HEADER,
)


def _headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if MEM0_API_KEY:
        value = f"{MEM0_AUTH_SCHEME} {MEM0_API_KEY}".strip()
        headers[MEM0_AUTH_HEADER] = value
    if MEM0_PROJECT_KEY:
        headers[MEM0_PROJECT_HEADER] = MEM0_PROJECT_KEY
    return headers


def get_memory(user_id: str) -> str:
    if not MEM0_API_KEY or not MEM0_PROJECT_KEY:
        return ""
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                f"{MEM0_BASE_URL.rstrip('/')}/memory",
                params={"user_id": user_id},
                headers=_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, dict):
            return data.get("memory") or data.get("data") or ""
        return ""
    except Exception:
        return ""


def add_memory(user_id: str, text: str, metadata: dict[str, Any] | None = None) -> None:
    if not MEM0_API_KEY or not MEM0_PROJECT_KEY:
        return
    payload = {
        "user_id": user_id,
        "text": text,
        "metadata": metadata or {},
    }
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(
                f"{MEM0_BASE_URL.rstrip('/')}/memory",
                json=payload,
                headers=_headers(),
            )
            resp.raise_for_status()
    except Exception:
        return
