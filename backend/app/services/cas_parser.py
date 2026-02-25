from __future__ import annotations

from tempfile import NamedTemporaryFile
from typing import Any

import pdfplumber

from .yfinance_service import map_isin_to_ticker
from .mfapi_service import resolve_isin_to_scheme, get_latest_nav
try:
    import casparser
except Exception:  # pragma: no cover - optional dependency handling
    casparser = None


def _parse_with_casparser(pdf_path: str) -> Any:
    if not casparser:
        raise RuntimeError("casparser not available")
    if hasattr(casparser, "parse_pdf"):
        return casparser.parse_pdf(pdf_path)
    if hasattr(casparser, "read_cas_pdf"):
        return casparser.read_cas_pdf(pdf_path)
    raise RuntimeError("Unsupported casparser API")


def _flatten_records(obj: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(obj, dict):
        if any(k.lower() in {"isin", "isin_code", "isin_no"} for k in obj.keys()):
            records.append(obj)
        for value in obj.values():
            records.extend(_flatten_records(value))
    elif isinstance(obj, list):
        for item in obj:
            records.extend(_flatten_records(item))
    return records


def _normalize_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for record in records:
        isin = record.get("isin") or record.get("ISIN") or record.get("isin_code")
        qty = record.get("qty") or record.get("quantity") or record.get("units")
        asset_type = record.get("asset_type") or record.get("type")
        avg_cost = record.get("avg_cost") or record.get("average_cost") or record.get("avg_price")
        if not isin and not qty:
            continue
        normalized.append(
            {
                "isin": isin,
                "qty": qty,
                "asset_type": asset_type,
                "avg_cost": avg_cost,
            }
        )
    return normalized


def parse_cas_pdf(pdf_bytes: bytes) -> dict[str, Any]:
    errors: list[str] = []
    raw: Any = None
    holdings: list[dict[str, Any]] = []

    with NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        try:
            raw = _parse_with_casparser(tmp.name)
        except Exception as exc:
            errors.append(f"casparser failed: {exc}")

        if raw is not None:
            records = _flatten_records(raw)
            holdings = _normalize_records(records)

        if not holdings:
            try:
                with pdfplumber.open(tmp.name) as pdf:
                    text = "\n".join(page.extract_text() or "" for page in pdf.pages)
                if text:
                    errors.append("Could not extract holdings from CAS; manual review needed.")
            except Exception as exc:
                errors.append(f"pdfplumber failed: {exc}")

    missing = []
    if holdings:
        for holding in holdings:
            if holding.get("symbol") or holding.get("scheme_code"):
                continue
            isin = holding.get("isin")
            if not isin:
                continue
            # Try equity resolution via yfinance first
            mapping = map_isin_to_ticker(isin)
            if mapping:
                holding["symbol"] = mapping.get("symbol")
                holding["exchange"] = mapping.get("exchange")
                holding["yahoo_symbol"] = mapping.get("yahoo_symbol")
                holding["name"] = mapping.get("name")
                continue
            # Try mutual fund resolution via MFAPI
            mf_match = resolve_isin_to_scheme(isin)
            if mf_match and mf_match.get("scheme_code"):
                holding["scheme_code"] = mf_match["scheme_code"]
                holding["scheme_name"] = mf_match.get("scheme_name")
                holding["asset_type"] = "mutual_fund"
                # Enrich with fund house from NAV data
                nav_info = get_latest_nav(mf_match["scheme_code"])
                if nav_info.get("fund_house"):
                    holding["fund_house"] = nav_info["fund_house"]
            else:
                missing.append(holding)

    return {
        "raw": raw,
        "holdings": holdings,
        "missing_mappings": missing,
        "errors": errors,
    }
