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

    The manifest is used as `tax_docs` in the DB — None means not yet uploaded;
    a non-None string means the extracted text has been stored.

    Args:
        intake_answers: dict with keys:
            income_slab, tax_regime, brokers (list of broker name strings),
            has_carry_forward (bool), financial_year

    Returns:
        OrderedDict-like plain dict of {doc_key: None}
    """
    docs: dict[str, None] = {}

    brokers: list[str] = [b.lower() for b in (intake_answers.get("brokers") or [])]
    has_mf_outside_demat = _has_mf_outside_demat(brokers)
    has_stocks = _has_stocks(brokers)
    has_carry_forward = intake_answers.get("has_carry_forward", False)

    # CAS PDF — needed if user has mutual funds outside a demat account
    if has_mf_outside_demat:
        docs["cas_pdf"] = None

    # Broker P&L + Holdings — one pair per broker
    for broker in intake_answers.get("brokers") or []:
        broker_lower = broker.lower()
        matched = False
        for key_pattern, (pnl_key, holdings_key) in _BROKER_DOC_KEYS.items():
            if key_pattern in broker_lower or broker_lower in key_pattern:
                if pnl_key not in docs:
                    docs[pnl_key] = None
                if holdings_key not in docs:
                    docs[holdings_key] = None
                matched = True
                break
        if not matched:
            # Unknown broker — use generic keys suffixed with broker name
            safe = broker_lower.replace(" ", "_")[:20]
            pnl_key = f"{safe}_pnl"
            holdings_key = f"{safe}_holdings"
            if pnl_key not in docs:
                docs[pnl_key] = None
            if holdings_key not in docs:
                docs[holdings_key] = None
            # Register instructions for the dynamic keys
            if pnl_key not in _INSTRUCTIONS:
                _INSTRUCTIONS[pnl_key] = {**_INSTRUCTIONS["other_broker_pnl"], "label": f"{broker} Tax P&L"}
            if holdings_key not in _INSTRUCTIONS:
                _INSTRUCTIONS[holdings_key] = {**_INSTRUCTIONS["other_broker_holdings"], "label": f"{broker} Holdings"}

    # ITR — needed if user has carry-forward losses
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

_MF_KEYWORDS = {"mfcentral", "cams", "kfintech", "mutual fund", "mutual funds"}
_STOCK_KEYWORDS = {
    "zerodha", "groww", "upstox", "angel", "icici", "hdfc",
    "sharekhan", "motilal", "kotak", "edelweiss", "5paisa", "other",
}

# These brokers also hold MFs inside demat — but user still needs CAS for non-demat MFs
_DEMAT_MF_BROKERS = {"zerodha", "groww", "upstox", "angel"}


def _has_mf_outside_demat(brokers_lower: list[str]) -> bool:
    """Return True if any selected broker implies non-demat MF holdings needing a CAS."""
    # "Mutual Funds (via CAMS/KFintech)" is the sentinel value
    for b in brokers_lower:
        if "mutual fund" in b or "cams" in b or "kfintech" in b or "mfcentral" in b:
            return True
        # If user selected a demat broker but NOT any explicit MF option, we still
        # ask for CAS because they may hold MFs via CAMS/KFintech outside demat.
        # The safest approach: always ask for CAS if they picked ANY broker.
        # This matches the PRD behaviour.
    return len(brokers_lower) > 0  # ask for CAS for everyone who has any investment


def _has_stocks(brokers_lower: list[str]) -> bool:
    """Return True if user has stock/ETF holdings via a demat broker."""
    for b in brokers_lower:
        for kw in _STOCK_KEYWORDS:
            if kw in b:
                return True
    return False
