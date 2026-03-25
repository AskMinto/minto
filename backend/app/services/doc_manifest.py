"""Deterministic document manifest computation.

Given intake_answers, returns the exact set of documents the user needs to upload.
Each key maps to None (not yet uploaded) or a string (extracted text after upload).

No LLM involved — pure Python logic based on broker selection and carry-forward flag.
"""

from __future__ import annotations

# ── Download instruction strings ────────────────────────────────────────────────

_INSTRUCTIONS: dict[str, dict] = {
    "cas_pdf": {
        "label": "MFCentral CAS (Mutual Funds)",
        "icon": "📄",
        "description": "Consolidated Account Statement showing all mutual fund transactions and holdings.",
        "steps": [
            "Go to mfcentral.com",
            "Log in with your mobile number and OTP",
            "Click Reports → Consolidated Account Statement",
            "Select Detailed (not Summary)",
            "Tick Select All Folios",
            "Set period: 01-Apr-2025 to today",
            "Set a password and download the PDF",
        ],
        "password_hint": "Password is whatever you set while downloading — it is NOT your PAN.",
        "file_types": [".pdf"],
    },
    "zerodha_taxpnl_xlsx": {
        "label": "Zerodha Tax P&L",
        "icon": "📊",
        "description": "Shows all your realised gains and losses from stocks and ETFs sold this year.",
        "steps": [
            "Go to console.zerodha.com",
            "Click Reports → Tax P&L",
            "Select FY 2025-26",
            "Click Download → Excel (.xlsx)",
        ],
        "password_hint": None,
        "file_types": [".xlsx"],
    },
    "zerodha_holdings_xlsx": {
        "label": "Zerodha Holdings",
        "icon": "📋",
        "description": "Your current stock and ETF holdings with purchase dates — needed to find loss and gain harvesting opportunities.",
        "steps": [
            "Go to console.zerodha.com",
            "Click Portfolio → Holdings",
            "Click the Download icon → Export as Excel (.xlsx)",
        ],
        "password_hint": None,
        "file_types": [".xlsx"],
    },
    "groww_capital_gains_pdf": {
        "label": "Groww Capital Gains Report",
        "icon": "📊",
        "description": "Realised gains and losses from stocks and mutual funds sold this year via Groww.",
        "steps": [
            "Open the Groww app",
            "Go to Stocks → P&L",
            "Tap Download → Capital Gains",
            "Select FY 2025-26 and download",
        ],
        "password_hint": None,
        "file_types": [".pdf", ".xlsx", ".csv"],
    },
    "groww_holdings_pdf": {
        "label": "Groww Holdings",
        "icon": "📋",
        "description": "Your current stock and ETF holdings on Groww.",
        "steps": [
            "Open the Groww app",
            "Go to Stocks → Holdings",
            "Tap the Download icon",
        ],
        "password_hint": None,
        "file_types": [".pdf", ".xlsx", ".csv"],
    },
    "upstox_pnl_xlsx": {
        "label": "Upstox Tax P&L",
        "icon": "📊",
        "description": "Realised gains and losses from stocks and ETFs sold this year via Upstox.",
        "steps": [
            "Go to upstox.com and log in",
            "Click Reports → P&L Report",
            "Select FY 2025-26",
            "Download as Excel",
        ],
        "password_hint": None,
        "file_types": [".xlsx", ".csv"],
    },
    "upstox_holdings_xlsx": {
        "label": "Upstox Holdings",
        "icon": "📋",
        "description": "Your current stock and ETF holdings on Upstox.",
        "steps": [
            "Go to upstox.com",
            "Click Portfolio → Holdings",
            "Download as Excel",
        ],
        "password_hint": None,
        "file_types": [".xlsx", ".csv"],
    },
    "angel_pnl_xlsx": {
        "label": "Angel One Tax P&L",
        "icon": "📊",
        "description": "Realised gains and losses from stocks sold this year via Angel One.",
        "steps": [
            "Log in to angelone.in",
            "Go to Reports → P&L Statement",
            "Select FY 2025-26 and download",
        ],
        "password_hint": None,
        "file_types": [".xlsx", ".csv", ".pdf"],
    },
    "angel_holdings_xlsx": {
        "label": "Angel One Holdings",
        "icon": "📋",
        "description": "Your current stock holdings on Angel One.",
        "steps": [
            "Log in to angelone.in",
            "Go to Portfolio → Holdings and download",
        ],
        "password_hint": None,
        "file_types": [".xlsx", ".csv", ".pdf"],
    },
    "icici_pnl_pdf": {
        "label": "ICICI Direct Capital Gains",
        "icon": "📊",
        "description": "Realised gains and losses from stocks sold this year via ICICI Direct.",
        "steps": [
            "Log in to icicidirect.com",
            "Go to Reports → Tax Corner → Capital Gains",
            "Select FY 2025-26 and download",
        ],
        "password_hint": None,
        "file_types": [".pdf", ".xlsx"],
    },
    "icici_holdings_pdf": {
        "label": "ICICI Direct Holdings",
        "icon": "📋",
        "description": "Your current stock holdings on ICICI Direct.",
        "steps": [
            "Log in to icicidirect.com",
            "Go to Portfolio → Holdings and export",
        ],
        "password_hint": None,
        "file_types": [".pdf", ".xlsx"],
    },
    "hdfc_pnl_pdf": {
        "label": "HDFC Securities Capital Gains",
        "icon": "📊",
        "description": "Realised gains and losses from stocks sold this year via HDFC Securities.",
        "steps": [
            "Log in to hdfcsec.com",
            "Go to Reports → Capital Gains Statement",
            "Select FY 2025-26 and download",
        ],
        "password_hint": None,
        "file_types": [".pdf", ".xlsx"],
    },
    "hdfc_holdings_pdf": {
        "label": "HDFC Securities Holdings",
        "icon": "📋",
        "description": "Your current stock holdings on HDFC Securities.",
        "steps": [
            "Log in to hdfcsec.com",
            "Go to Portfolio → Holdings and export",
        ],
        "password_hint": None,
        "file_types": [".pdf", ".xlsx"],
    },
    "itr_pdf": {
        "label": "Last Year's ITR (for carry-forward losses)",
        "icon": "📑",
        "description": "Your Income Tax Return for AY 2025-26 (FY 2024-25) — needed to extract capital losses carried forward.",
        "steps": [
            "Log in to incometax.gov.in",
            "Go to e-File → Income Tax Returns → View Filed Returns",
            "Find AY 2025-26 and download the ITR-V / ITR PDF",
        ],
        "password_hint": "ITR PDFs are typically password protected with your PAN in lowercase + date of birth (DDMMYYYY). E.g. abcde1234f01011980",
        "file_types": [".pdf"],
    },
    "other_broker_pnl": {
        "label": "Broker Tax P&L",
        "icon": "📊",
        "description": "Realised gains and losses from stocks sold this year. Download from your broker's Reports section.",
        "steps": [
            "Log in to your broker's website or app",
            "Go to Reports → P&L or Capital Gains",
            "Select FY 2025-26",
            "Download as Excel, CSV, or PDF",
        ],
        "password_hint": None,
        "file_types": [".xlsx", ".csv", ".pdf"],
    },
    "other_broker_holdings": {
        "label": "Broker Holdings",
        "icon": "📋",
        "description": "Your current stock holdings. Download from your broker's Portfolio section.",
        "steps": [
            "Log in to your broker's website or app",
            "Go to Portfolio → Holdings",
            "Export as Excel, CSV, or PDF",
        ],
        "password_hint": None,
        "file_types": [".xlsx", ".csv", ".pdf"],
    },
}

# Broker name → (pnl_key, holdings_key)
_BROKER_DOC_KEYS: dict[str, tuple[str, str]] = {
    "zerodha":         ("zerodha_taxpnl_xlsx", "zerodha_holdings_xlsx"),
    "groww":           ("groww_capital_gains_pdf", "groww_holdings_pdf"),
    "upstox":          ("upstox_pnl_xlsx", "upstox_holdings_xlsx"),
    "angel one":       ("angel_pnl_xlsx", "angel_holdings_xlsx"),
    "angel":           ("angel_pnl_xlsx", "angel_holdings_xlsx"),
    "icici direct":    ("icici_pnl_pdf", "icici_holdings_pdf"),
    "icici":           ("icici_pnl_pdf", "icici_holdings_pdf"),
    "hdfc securities": ("hdfc_pnl_pdf", "hdfc_holdings_pdf"),
    "hdfc":            ("hdfc_pnl_pdf", "hdfc_holdings_pdf"),
    "other":           ("other_broker_pnl", "other_broker_holdings"),
}


def compute_doc_manifest(intake_answers: dict) -> dict:
    """Return an ordered dict of doc_key → None for all required documents.

    Implements US-06 routing exactly:

        MF only  + no CF  → CAS
        MF only  + CF     → CAS → ITR
        Stocks only + no CF  → P&L → Holdings (per broker)
        Stocks only + CF     → P&L → Holdings → ITR
        Both     + no CF  → CAS → P&L → Holdings
        Both     + CF     → CAS → P&L → Holdings → ITR

    The `brokers` list from intake_answers contains a mix of two kinds of values:
      - "Mutual Funds (via CAMS/KFintech)" — signals MF holdings → triggers CAS
      - Any actual broker name (Zerodha, Groww, …) → triggers P&L + Holdings pair

    The sentinel string for MF is matched via _is_mf_sentinel().
    Everything else is treated as a demat broker.
    """
    docs: dict[str, None] = {}

    all_selections: list[str] = intake_answers.get("brokers") or []
    has_carry_forward = bool(intake_answers.get("has_carry_forward", False))

    # Partition into MF sentinel vs actual brokers
    has_mutual_funds = any(_is_mf_sentinel(s) for s in all_selections)
    actual_brokers = [s for s in all_selections if not _is_mf_sentinel(s)]

    # ── CAS — only when user has mutual funds ─────────────────────────────────
    if has_mutual_funds:
        docs["cas_pdf"] = None

    # ── P&L + Holdings — one pair per actual demat broker ────────────────────
    for broker in actual_brokers:
        broker_lower = broker.lower()
        pnl_key, holdings_key = _resolve_broker_keys(broker, broker_lower)
        if pnl_key not in docs:
            docs[pnl_key] = None
        if holdings_key not in docs:
            docs[holdings_key] = None

    # ── ITR — only when user has carry-forward losses ─────────────────────────
    if has_carry_forward:
        docs["itr_pdf"] = None

    return docs


def get_doc_instructions(doc_key: str) -> dict:
    """Return download instructions for a given doc_key.

    Falls back to a generic instruction dict if the key is unknown.
    """
    return _INSTRUCTIONS.get(doc_key, {
        "label": doc_key.replace("_", " ").title(),
        "icon": "📄",
        "description": "Upload this document to continue.",
        "steps": ["Log in to your provider and download this document."],
        "password_hint": None,
        "file_types": [".pdf", ".xlsx", ".csv"],
    })


def get_all_doc_instructions(tax_docs: dict) -> list[dict]:
    """Return instruction dicts for all docs in a manifest, with upload status.

    Each dict includes:
        doc_key, label, icon, description, steps, password_hint, file_types,
        uploaded (bool — True if value is not None)
    """
    result = []
    for doc_key, extracted_text in tax_docs.items():
        instr = get_doc_instructions(doc_key)
        result.append({
            "doc_key": doc_key,
            **instr,
            "uploaded": extracted_text is not None,
            "preview": extracted_text[:200] if extracted_text else None,
        })
    return result


# ── Private helpers ─────────────────────────────────────────────────────────────

_MF_SENTINEL_KEYWORDS = {"mutual fund", "cams", "kfintech", "mfcentral"}


def _is_mf_sentinel(selection: str) -> bool:
    """Return True if this selection represents MF holdings (triggers CAS), not a demat broker."""
    lower = selection.lower()
    return any(kw in lower for kw in _MF_SENTINEL_KEYWORDS)


def _resolve_broker_keys(broker: str, broker_lower: str) -> tuple[str, str]:
    """Return (pnl_key, holdings_key) for a demat broker name.

    Tries exact/substring match against the known broker table first,
    then falls back to a generic key derived from the broker name.
    """
    for key_pattern, (pnl_key, holdings_key) in _BROKER_DOC_KEYS.items():
        if key_pattern in broker_lower or broker_lower in key_pattern:
            return pnl_key, holdings_key

    # Unknown broker — register generic instruction entries on first encounter
    safe = broker_lower.replace(" ", "_")[:20]
    pnl_key = f"{safe}_pnl"
    holdings_key = f"{safe}_holdings"
    if pnl_key not in _INSTRUCTIONS:
        _INSTRUCTIONS[pnl_key] = {**_INSTRUCTIONS["other_broker_pnl"], "label": f"{broker} Tax P&L"}
    if holdings_key not in _INSTRUCTIONS:
        _INSTRUCTIONS[holdings_key] = {**_INSTRUCTIONS["other_broker_holdings"], "label": f"{broker} Holdings"}
    return pnl_key, holdings_key
