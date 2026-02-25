from __future__ import annotations

from typing import Any

import httpx
from cachetools import TTLCache

from ..core.config import MFAPI_BASE_URL

_search_cache: TTLCache[str, list] = TTLCache(maxsize=256, ttl=60)
_nav_cache: TTLCache[int, dict] = TTLCache(maxsize=512, ttl=300)
_scheme_list_cache: TTLCache[str, list] = TTLCache(maxsize=1, ttl=3600)

_CLIENT_TIMEOUT = 15.0


def _get_scheme_list() -> list[dict[str, Any]]:
    cache_key = "all"
    if cache_key in _scheme_list_cache:
        return _scheme_list_cache[cache_key]

    try:
        resp = httpx.get(f"{MFAPI_BASE_URL}/mf", timeout=_CLIENT_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    _scheme_list_cache[cache_key] = data
    return data


def search_schemes(query: str) -> list[dict[str, Any]]:
    if not query:
        return []

    cache_key = query.lower().strip()
    if cache_key in _search_cache:
        return _search_cache[cache_key]

    try:
        resp = httpx.get(
            f"{MFAPI_BASE_URL}/mf/search",
            params={"q": query},
            timeout=_CLIENT_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        data = []

    results = []
    for item in data if isinstance(data, list) else []:
        results.append({
            "scheme_code": item.get("schemeCode"),
            "scheme_name": item.get("schemeName"),
        })

    _search_cache[cache_key] = results
    return results


def get_latest_nav(scheme_code: int) -> dict[str, Any]:
    if scheme_code in _nav_cache:
        return _nav_cache[scheme_code]

    try:
        resp = httpx.get(
            f"{MFAPI_BASE_URL}/mf/{scheme_code}/latest",
            timeout=_CLIENT_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {}

    meta = data.get("meta", {})
    nav_data = data.get("data", [])
    latest = nav_data[0] if nav_data else {}

    result = {
        "scheme_code": meta.get("scheme_code") or scheme_code,
        "scheme_name": meta.get("scheme_name"),
        "fund_house": meta.get("fund_house"),
        "scheme_type": meta.get("scheme_type"),
        "scheme_category": meta.get("scheme_category"),
        "nav": float(latest.get("nav", 0)) if latest.get("nav") else None,
        "date": latest.get("date"),
    }
    _nav_cache[scheme_code] = result
    return result


def get_nav_history(scheme_code: int) -> list[dict[str, Any]]:
    try:
        resp = httpx.get(
            f"{MFAPI_BASE_URL}/mf/{scheme_code}",
            timeout=_CLIENT_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    nav_data = data.get("data", [])
    history = []
    for entry in nav_data:
        try:
            history.append({
                "date": entry.get("date"),
                "nav": float(entry["nav"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return history


def resolve_isin_to_scheme(isin: str) -> dict[str, Any] | None:
    if not isin:
        return None

    isin_upper = isin.upper().strip()
    schemes = _get_scheme_list()

    for scheme in schemes:
        growth_isin = (scheme.get("isinGrowth") or "").upper().strip()
        div_isin = (scheme.get("isinDivReinvestment") or scheme.get("isinReinvestment") or "").upper().strip()
        if isin_upper in (growth_isin, div_isin) and (growth_isin or div_isin):
            return {
                "scheme_code": scheme.get("schemeCode"),
                "scheme_name": scheme.get("schemeName"),
            }

    # Fallback: search by ISIN string
    results = search_schemes(isin)
    if results:
        return results[0]

    return None
