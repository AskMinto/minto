"""LLM-powered document parser using Gemini 2.0 Flash.

Parses all four document types — CAS, Broker P&L, Broker Holdings, and ITR —
via the Gemini File API (for PDFs) or inline text (for CSVs/Excel).

Uses the google-genai SDK (google.genai) which is the current non-deprecated
library already present in requirements.txt.

No casparser/pdfminer dependency — pure LLM extraction.
"""

from __future__ import annotations

import io
import json
import logging
import re
from typing import Optional

from pydantic import ValidationError

from ..core.config import GEMINI_API_KEY
from .models import CASResult, BrokerPLResult, BrokerHoldingsResult, ITRResult

logger = logging.getLogger(__name__)

def _model_id() -> str:
    from ..core.model_config import model_config
    return model_config._data.get("whatsapp_bot", {}).get("model", "gemini-3-flash-preview")


def _client():
    """Return a configured google.genai client."""
    from google import genai
    return genai.Client(api_key=GEMINI_API_KEY)


def _upload_pdf(client, pdf_bytes: bytes, display_name: str = "document.pdf"):
    """Upload PDF bytes via the Gemini File API. Returns the file object."""
    import time
    file_ref = client.files.upload(
        file=io.BytesIO(pdf_bytes),
        config={"mime_type": "application/pdf", "display_name": display_name},
    )
    # Wait for ACTIVE state (usually <3s)
    for _ in range(30):
        f = client.files.get(name=file_ref.name)
        if f.state.name == "ACTIVE":
            return f
        time.sleep(1)
    raise RuntimeError(f"Gemini file {file_ref.name} not ACTIVE after 30s")


def _delete_pdf(client, file_ref) -> None:
    """Delete a Gemini File API upload immediately after parsing."""
    try:
        client.files.delete(name=file_ref.name)
    except Exception as e:
        logger.warning(f"Failed to delete Gemini file {file_ref.name}: {e}")


def _extract_json(text: str) -> dict:
    """Extract and parse JSON from a model response robustly.

    Handles:
    - Clean JSON responses
    - JSON wrapped in ```json ... ``` fences
    - JSON preceded or followed by explanation text
    """
    text = text.strip()

    # Strip markdown fences if present
    fence_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence_match:
        text = fence_match.group(1).strip()

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find the outermost JSON object
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from model response: {text[:200]}")


def _read_excel_as_text(excel_bytes: bytes) -> str:
    """Convert Excel bytes to CSV-like text for inline LLM parsing."""
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), read_only=True, data_only=True)
    rows = []
    for ws in wb.worksheets:
        rows.append(f"=== Sheet: {ws.title} ===")
        for row in ws.iter_rows(values_only=True):
            rows.append(",".join(str(v) if v is not None else "" for v in row))
    return "\n".join(rows)


# ── CAS Parser ────────────────────────────────────────────────────────────────

_CAS_PROMPT = """You are a financial document parser. Parse this MFCentral / CAMS / KFintech
Consolidated Account Statement (CAS) PDF.

Extract the following in JSON format matching the schema below:

{
  "investor_name": "string",
  "pan": "string (XXXXX1234X format)",
  "cas_generation_date": "YYYY-MM-DD",
  "statement_period_from": "YYYY-MM-DD",
  "statement_period_to": "YYYY-MM-DD",
  "cas_type": "detailed or summary",
  "registrar": "CAMS or KFintech or combined",
  "total_portfolio_value": number,
  "total_invested": number,
  "total_unrealised_gain": number,
  "total_realised_ltcg_fy": number,
  "total_realised_stcg_fy": number,
  "total_realised_ltcl_fy": number,
  "total_realised_stcl_fy": number,
  "folios": [
    {
      "fund_name": "full scheme name",
      "fund_house": "AMC name",
      "folio_number": "string",
      "isin": "INF... or null",
      "current_units": number,
      "current_nav": number,
      "current_value": number,
      "avg_cost_per_unit": number,
      "total_invested": number,
      "unrealised_gain": number,
      "is_elss": true/false,
      "fund_category": "one of: equity_large_cap equity_mid_cap equity_small_cap equity_flexi_cap equity_multi_cap elss index etf_equity aggressive_hybrid balanced_advantage conservative_hybrid debt liquid gold international fof unknown",
      "is_equity_oriented": true/false (true if domestic equity allocation >65%),
      "exit_load_pct": number (0 if nil),
      "has_bonus_units": true/false (true if bonus allotted in last 9 months),
      "has_recent_dividend": true/false (true if dividend record date in last 9 months),
      "sec_94_7_applies": true/false,
      "sec_94_8_applies": true/false,
      "sec_94_eligible_after": "YYYY-MM-DD or null",
      "grandfathering_applicable": true/false (true if any lots pre-Feb 1 2018),
      "fmv_jan31_2018": number or null,
      "realised_ltcg_this_fy": number,
      "realised_stcg_this_fy": number,
      "realised_ltcl_this_fy": number,
      "realised_stcl_this_fy": number,
      "lots": [
        {
          "purchase_date": "YYYY-MM-DD",
          "units": number,
          "nav": number,
          "amount": number,
          "lock_in_expiry": "YYYY-MM-DD or null (ELSS only — 3 years from purchase_date)",
          "is_locked": true/false
        }
      ],
      "fy_transactions": [
        {
          "date": "YYYY-MM-DD",
          "type": "purchase/redemption/switch_in/switch_out/stp_in/stp_out/dividend/bonus",
          "units": number,
          "nav": number,
          "amount": number,
          "balance_units": number
        }
      ]
    }
  ]
}

RULES:
- Include ALL folios even if zero balance (but set current_units=0).
- For equity-oriented funds: is_equity_oriented=true if fund invests >65% in domestic equity.
  - equity_large_cap, equity_mid_cap, equity_small_cap, equity_flexi_cap, equity_multi_cap, elss, index, etf_equity, aggressive_hybrid → is_equity_oriented=true
  - All others → false
- For ELSS: lock_in_expiry = purchase_date + 3 years. is_locked = lock_in_expiry > today (2025-03-20).
- For realised gains this FY (Apr 2025 onwards): calculate from redemption/switch transactions.
  - Equity LTCG: equity fund redemption, holding period >12 months, gain positive
  - Equity STCL: equity fund redemption, holding period <=12 months, gain negative
  - etc.
- For Section 112A grandfathering: if any lot purchased before Feb 1 2018, set grandfathering_applicable=true.
  Cost of acquisition for those lots = max(actual_cost, min(NAV_jan31_2018, sale_NAV)).
- Section 94(7): bonus stripping — if bonus units allotted in last 9 months (before Jun 20 2025).
- Section 94(8): dividend stripping — if dividend record date was within 3 months before purchase AND within 9 months before today.
- fy_transactions: only include transactions dated Apr 1 2025 or later.
- Return valid JSON only. No markdown fences. No commentary.
"""


async def parse_cas(pdf_bytes: bytes) -> CASResult:
    """Parse a CAS PDF using Gemini File API."""
    client = _client()
    file_ref = _upload_pdf(client, pdf_bytes, "cas.pdf")

    try:
        response = client.models.generate_content(
            model=_model_id(),
            contents=[_CAS_PROMPT, file_ref],
            config={"response_mime_type": "application/json"},
        )
        data = _extract_json(response.text)
        try:
            return CASResult(**data)
        except (ValidationError, TypeError) as e:
            logger.warning(f"parse_cas: Pydantic validation issue, using partial data: {e}")
            return CASResult.model_validate(data, strict=False)
    finally:
        _delete_pdf(client, file_ref)


# ── Broker Tax P&L Parser ─────────────────────────────────────────────────────

_BROKER_PL_PROMPT = """You are a financial document parser. Parse this broker Tax P&L report.

Extract delivery-based capital gains ONLY. Exclude:
- Intraday equity trades (speculative business income — buy and sell same day)
- F&O (futures and options) — non-speculative business income
- Currency derivatives

Detect the broker name (Zerodha, Groww, Upstox, Angel One, ICICI Direct, or Other).
Detect the financial year covered.

Return JSON:
{
  "broker_name": "string",
  "fy": "2025-26",
  "total_ltcg": number,
  "total_stcg": number,
  "total_ltcl": number,
  "total_stcl": number,
  "has_intraday": true/false,
  "has_fno": true/false,
  "trades": [
    {
      "scrip_name": "string",
      "isin": "string or null",
      "buy_date": "YYYY-MM-DD",
      "sell_date": "YYYY-MM-DD",
      "quantity": number,
      "buy_price": number,
      "sell_price": number,
      "gain_loss": number (positive=gain, negative=loss),
      "holding_days": number,
      "is_long_term": true/false (equity: held >12 months; non-equity pre-Apr23: held >730 days),
      "asset_class": "equity or equity_etf or gold_etf or non_equity_etf or reit or invit or unknown"
    }
  ]
}

RULES:
- total_ltcg/stcg: sum of positive gain_loss for long/short term trades
- total_ltcl/stcl: sum of absolute value of negative gain_loss for long/short term trades
- For equity stocks and equity ETFs: LTCG if held >12 months (365 days), else STCG
- For Gold ETFs, REITs, InvITs, non-equity ETFs: LTCG if held >12 months
- Return valid JSON only. No markdown. No commentary.
"""


async def parse_broker_pl(content: bytes, content_type: str) -> BrokerPLResult:
    """Parse a broker Tax P&L report (CSV, Excel, or PDF)."""
    client = _client()

    if "pdf" in content_type:
        file_ref = _upload_pdf(client, content, "broker_pl.pdf")
        try:
            response = client.models.generate_content(
                model=_model_id(),
                contents=[_BROKER_PL_PROMPT, file_ref],
                config={"response_mime_type": "application/json"},
            )
            data = _extract_json(response.text)
        finally:
            _delete_pdf(client, file_ref)
    else:
        if "excel" in content_type or "spreadsheet" in content_type or content_type.endswith(("xls", "xlsx")):
            text = _read_excel_as_text(content)
        else:
            text = content.decode("utf-8", errors="replace")

        response = client.models.generate_content(
            model=_model_id(),
            contents=f"{_BROKER_PL_PROMPT}\n\nDocument content:\n{text[:50_000]}",
            config={"response_mime_type": "application/json"},
        )
        data = _extract_json(response.text)

    try:
        return BrokerPLResult(**data)
    except (ValidationError, TypeError) as e:
        logger.warning(f"parse_broker_pl: Pydantic validation issue, using partial data: {e}")
        return BrokerPLResult.model_validate(data, strict=False)


# ── Broker Holdings Parser ────────────────────────────────────────────────────

_BROKER_HOLDINGS_PROMPT = """You are a financial document parser. Parse this broker Holdings report.

Extract lot-level holding data for all stocks and ETFs.

Return JSON:
{
  "broker_name": "string",
  "report_date": "YYYY-MM-DD",
  "total_portfolio_value": number,
  "total_invested": number,
  "total_unrealised_gain": number,
  "ltcg_eligible": ["scrip_names held >12mo in profit"],
  "ltcl_candidates": ["scrip_names held >12mo at loss"],
  "stcl_candidates": ["scrip_names held <12mo at loss"],
  "not_yet_ltcg_eligible": ["scrip_names held <12mo in profit"],
  "holdings": [
    {
      "scrip_name": "string",
      "isin": "string or null",
      "symbol": "NSE ticker or null",
      "exchange": "NSE or BSE",
      "total_quantity": number,
      "current_price": number,
      "current_value": number,
      "total_invested": number,
      "unrealised_gain": number (positive=gain, negative=loss),
      "is_long_term": true/false (all lots held >12 months),
      "has_mixed_lots": true/false,
      "asset_class": "equity or equity_etf or gold_etf or non_equity_etf or reit or invit or unknown",
      "corporate_action_flag": "bonus or split or rights or null",
      "lots": [
        {
          "buy_date": "YYYY-MM-DD",
          "quantity": number,
          "buy_price": number,
          "current_price": number,
          "gain_loss_per_unit": number,
          "holding_days": number,
          "is_long_term": true/false
        }
      ]
    }
  ]
}

RULES:
- Equity stocks and equity ETFs: long-term if held >12 months (365 days from buy_date to today 2025-03-20)
- Bonus shares: zero acquisition cost, holding period from allotment date
- Stock splits: don't reset holding period, adjust per-share cost proportionally
- is_long_term at position level: true only if ALL lots are >12 months
- has_mixed_lots: true if some lots are LT and some ST
- Return valid JSON only. No markdown. No commentary.
"""


async def parse_broker_holdings(content: bytes, content_type: str) -> BrokerHoldingsResult:
    """Parse a broker Holdings report (CSV, Excel, or PDF)."""
    client = _client()

    if "pdf" in content_type:
        file_ref = _upload_pdf(client, content, "holdings.pdf")
        try:
            response = client.models.generate_content(
                model=_model_id(),
                contents=[_BROKER_HOLDINGS_PROMPT, file_ref],
                config={"response_mime_type": "application/json"},
            )
            data = _extract_json(response.text)
        finally:
            _delete_pdf(client, file_ref)
    else:
        if "excel" in content_type or "spreadsheet" in content_type or content_type.endswith(("xls", "xlsx")):
            text = _read_excel_as_text(content)
        else:
            text = content.decode("utf-8", errors="replace")

        response = client.models.generate_content(
            model=_model_id(),
            contents=f"{_BROKER_HOLDINGS_PROMPT}\n\nDocument content:\n{text[:50_000]}",
            config={"response_mime_type": "application/json"},
        )
        data = _extract_json(response.text)

    try:
        return BrokerHoldingsResult(**data)
    except (ValidationError, TypeError) as e:
        logger.warning(f"parse_broker_holdings: Pydantic validation issue, using partial data: {e}")
        return BrokerHoldingsResult.model_validate(data, strict=False)


# ── ITR Parser ────────────────────────────────────────────────────────────────

_ITR_PROMPT = """You are a financial document parser. Parse this Indian Income Tax Return (ITR) document.

Extract ONLY the Schedule CFL (Carry Forward Losses) section.

Return JSON:
{
  "itr_type": "ITR-1 or ITR-2 or ITR-3 or ITR-4 or unknown",
  "assessment_year": "2025-26",
  "financial_year": "2024-25",
  "schedule_cfl_found": true/false,
  "filing_date": "YYYY-MM-DD or null",
  "is_itr1": true/false,
  "total_ltcl_cf": number,
  "total_stcl_cf": number,
  "tranches": [
    {
      "loss_fy": "2024-25",
      "expiry_fy": "2032-33",
      "ltcl": number,
      "stcl": number
    }
  ]
}

RULES:
- Extract ALL loss tranches from Schedule CFL — these are losses from previous years carried forward.
- Each tranche is identified by the year the loss was incurred.
- Capital losses can be carried forward for 8 years. Loss from FY 2024-25 expires in FY 2032-33.
- LTCL (long-term capital loss) and STCL (short-term capital loss) are tracked separately.
- If no Schedule CFL section found, return schedule_cfl_found=false and empty tranches=[].
- If ITR-1: is_itr1=true (ITR-1 cannot carry forward capital losses).
- total_ltcl_cf and total_stcl_cf = sum of respective amounts across ALL tranches.
- Return valid JSON only. No markdown. No commentary.
"""


async def parse_itr(pdf_bytes: bytes) -> ITRResult:
    """Parse an ITR PDF using Gemini File API."""
    client = _client()
    file_ref = _upload_pdf(client, pdf_bytes, "itr.pdf")

    try:
        response = client.models.generate_content(
            model=_model_id(),
            contents=[_ITR_PROMPT, file_ref],
            config={"response_mime_type": "application/json"},
        )
        data = _extract_json(response.text)
        try:
            return ITRResult(**data)
        except (ValidationError, TypeError) as e:
            logger.warning(f"parse_itr: Pydantic validation issue, using partial data: {e}")
            return ITRResult.model_validate(data, strict=False)
    finally:
        _delete_pdf(client, file_ref)


# ── Dispatcher ────────────────────────────────────────────────────────────────

async def parse_document(
    content: bytes,
    content_type: str,
    doc_type: str,
) -> dict:
    """Dispatch to the correct parser based on doc_type.

    Args:
        content: Raw file bytes (already decrypted if PDF was encrypted).
        content_type: MIME type.
        doc_type: 'cas' | 'broker_pl' | 'broker_holdings' | 'itr'.

    Returns:
        dict representation of the parsed Pydantic model.
    """
    if doc_type == "cas":
        result = await parse_cas(content)
    elif doc_type == "broker_pl":
        result = await parse_broker_pl(content, content_type)
    elif doc_type == "broker_holdings":
        result = await parse_broker_holdings(content, content_type)
    elif doc_type == "itr":
        result = await parse_itr(content)
    else:
        raise ValueError(f"Unknown doc_type: {doc_type!r}")

    return result.model_dump()
