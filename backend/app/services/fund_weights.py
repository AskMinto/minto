"""
Sector and market-cap weightage breakdowns for mutual funds.

Used by portfolio.py for "look-through" analysis: instead of labelling an
index fund as a single "Index" sector slice, we distribute its value across
the underlying sectors proportionally.

Data sources:
  - Nifty 50 sector weights from NSE Indices factsheet (updated periodically).
  - Category-based heuristics for active MFs where constituent data is unavailable.
"""

from __future__ import annotations

import re
from typing import Any

# ── Nifty 50 sector weights (from NSE Indices factsheet, Feb 2026) ────────

NIFTY_50_SECTORS: dict[str, float] = {
    "Financial Services": 37.68,
    "Energy": 10.00,
    "Technology": 8.84,
    "Automobile": 6.96,
    "FMCG": 5.90,
    "Telecom": 4.56,
    "Construction": 4.38,
    "Healthcare": 4.36,
    "Metals & Mining": 4.22,
    "Power": 2.76,
    "Consumer Durables": 2.49,
    "Consumer Services": 2.30,
    "Construction Materials": 2.24,
    "Services": 1.93,
    "Capital Goods": 1.39,
}

NIFTY_50_MCAP: dict[str, float] = {
    "Large Cap": 100.0,
}

# ── Nifty Bank sector weights ────────────────────────────────────────────

NIFTY_BANK_SECTORS: dict[str, float] = {
    "Financial Services": 100.0,
}

NIFTY_BANK_MCAP: dict[str, float] = {
    "Large Cap": 100.0,
}

# ── Nifty Next 50 approximate weights ───────────────────────────────────

NIFTY_NEXT_50_SECTORS: dict[str, float] = {
    "Financial Services": 20.0,
    "Healthcare": 12.0,
    "FMCG": 10.0,
    "Capital Goods": 9.0,
    "Energy": 8.0,
    "Technology": 7.0,
    "Automobile": 7.0,
    "Consumer Services": 6.0,
    "Telecom": 5.0,
    "Metals & Mining": 5.0,
    "Construction": 4.0,
    "Power": 4.0,
    "Chemical": 3.0,
}

NIFTY_NEXT_50_MCAP: dict[str, float] = {
    "Large Cap": 100.0,
}

# ── Index detection patterns ─────────────────────────────────────────────

_INDEX_PATTERNS: list[tuple[re.Pattern, dict[str, float], dict[str, float]]] = [
    (re.compile(r"nifty\s*(50|fifty)\b", re.I), NIFTY_50_SECTORS, NIFTY_50_MCAP),
    (re.compile(r"sensex", re.I), NIFTY_50_SECTORS, NIFTY_50_MCAP),  # close proxy
    (re.compile(r"nifty\s*bank", re.I), NIFTY_BANK_SECTORS, NIFTY_BANK_MCAP),
    (re.compile(r"nifty\s*next\s*50", re.I), NIFTY_NEXT_50_SECTORS, NIFTY_NEXT_50_MCAP),
]

# ── Category-based heuristic breakdowns for active MFs ───────────────────

_CATEGORY_SECTOR_MAP: dict[str, dict[str, float]] = {
    "large_cap": {
        "Financial Services": 35.0,
        "Technology": 12.0,
        "Energy": 10.0,
        "FMCG": 8.0,
        "Automobile": 7.0,
        "Healthcare": 6.0,
        "Telecom": 5.0,
        "Capital Goods": 4.0,
        "Construction": 4.0,
        "Metals & Mining": 4.0,
        "Other": 5.0,
    },
    "mid_cap": {
        "Financial Services": 18.0,
        "Technology": 10.0,
        "Healthcare": 10.0,
        "Capital Goods": 9.0,
        "Consumer Services": 8.0,
        "Chemical": 8.0,
        "Automobile": 7.0,
        "Construction": 6.0,
        "FMCG": 5.0,
        "Metals & Mining": 5.0,
        "Other": 14.0,
    },
    "small_cap": {
        "Capital Goods": 12.0,
        "Chemical": 10.0,
        "Financial Services": 10.0,
        "Technology": 9.0,
        "Healthcare": 9.0,
        "Consumer Services": 8.0,
        "Construction": 7.0,
        "Automobile": 6.0,
        "Metals & Mining": 6.0,
        "Textile": 5.0,
        "Other": 18.0,
    },
    "flexi_cap": {
        "Financial Services": 30.0,
        "Technology": 12.0,
        "Healthcare": 8.0,
        "Automobile": 8.0,
        "Energy": 7.0,
        "FMCG": 6.0,
        "Capital Goods": 6.0,
        "Consumer Services": 5.0,
        "Chemical": 4.0,
        "Other": 14.0,
    },
    "hybrid": {
        "Financial Services": 22.0,
        "Technology": 8.0,
        "Energy": 6.0,
        "FMCG": 5.0,
        "Automobile": 5.0,
        "Healthcare": 4.0,
        "Debt": 40.0,
        "Other": 10.0,
    },
    "gold": {
        "Commodity": 100.0,
    },
    "debt": {
        "Debt": 100.0,
    },
}

_CATEGORY_MCAP_MAP: dict[str, dict[str, float]] = {
    "large_cap": {"Large Cap": 100.0},
    "mid_cap": {"Mid Cap": 100.0},
    "small_cap": {"Small Cap": 100.0},
    "flexi_cap": {"Large Cap": 55.0, "Mid Cap": 30.0, "Small Cap": 15.0},
    "hybrid": {"Large Cap": 45.0, "Mid Cap": 10.0, "Debt": 40.0, "Other": 5.0},
    "gold": {},
    "debt": {},
}


def _detect_category(name: str) -> str:
    """Classify a mutual fund into a category key from its name."""
    nl = name.lower()
    if any(kw in nl for kw in ["gold", "silver", "commodity"]):
        return "gold"
    if any(kw in nl for kw in ["debt", "bond", "gilt", "liquid", "overnight",
                                 "money market", "floating", "banking and psu"]):
        return "debt"
    if any(kw in nl for kw in ["hybrid", "balanced", "equity savings"]):
        return "hybrid"
    if any(kw in nl for kw in ["small cap", "smallcap", "small-cap"]):
        return "small_cap"
    if any(kw in nl for kw in ["mid cap", "midcap", "mid-cap", "emerging"]):
        return "mid_cap"
    if any(kw in nl for kw in ["flexi cap", "flexicap", "flexi-cap",
                                 "multi cap", "multicap"]):
        return "flexi_cap"
    if any(kw in nl for kw in ["large cap", "largecap", "large-cap",
                                 "bluechip", "blue chip"]):
        return "large_cap"
    # Default: treat as flexi cap (diversified)
    return "flexi_cap"


def get_fund_weights(
    scheme_name: str | None = None,
    scheme_category: str | None = None,
) -> dict[str, Any]:
    """Return sector and mcap weight breakdowns for a mutual fund.

    Returns:
        {
            "sector_weights": {"Financial Services": 37.68, ...},
            "mcap_weights": {"Large Cap": 100.0},
            "source": "nifty_50" | "category_heuristic",
        }
    """
    name = (scheme_name or "").strip()

    # 1. Check if it's tracking a known index
    for pattern, sectors, mcap in _INDEX_PATTERNS:
        if pattern.search(name):
            index_name = pattern.pattern.replace(r"\s*", " ").replace(r"\b", "")
            return {
                "sector_weights": sectors,
                "mcap_weights": mcap,
                "source": "index_weights",
            }

    # 2. Fall back to category-based heuristic
    combined = f"{scheme_category or ''} {name}"
    category = _detect_category(combined)

    return {
        "sector_weights": _CATEGORY_SECTOR_MAP.get(category, {}),
        "mcap_weights": _CATEGORY_MCAP_MAP.get(category, {}),
        "source": "category_heuristic",
    }
