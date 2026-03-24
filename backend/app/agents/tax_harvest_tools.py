"""Tool functions for the Tax Harvest multi-agent team.

These are per-session closure-based tools (like alert_tools.py) so they can
carry the session_state reference and update it across tool calls.

The tools are used by the specialist agents inside the OrchestratorAgent team:
  - IntakeAgent: save_intake_answer, get_days_to_tax_deadline
  - DocumentRouterAgent: detect_and_parse_document, unlock_encrypted_document
  - NormalisationAgent: normalise_documents (pure computation, no tool)
  - TaxComputationAgent: run_full_tax_computation
  - HarvestingAgent: get_harvest_recommendations
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger(__name__)


# ── Shared state reference (per-request) ──────────────────────────────────────

def make_tax_harvest_tools(session_state: dict, user_id: str):
    """Factory: return all tax harvest tool functions bound to this session.

    session_state is mutated in-place; callers save it back to DB after the
    team run completes.
    """

    # ── Intake tools ──────────────────────────────────────────────────────────

    def save_intake_answer(key: str, value: str) -> str:
        """Save one intake onboarding answer to the session.

        Call this immediately after the user confirms each intake field.
        Supported keys: financial_year, income_slab, tax_regime, resident_status,
        brokers, has_fno, has_mf_outside_demat, step, portfolio_type,
        carry_forward, slab_rate, base_income, manual_cf_ltcl, manual_cf_stcl.

        Args:
            key: The field name to save.
            value: The confirmed value as a JSON-serialisable string (strings, arrays, booleans, numbers).
        """
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            parsed = value
        session_state[key] = parsed
        logger.debug(f"save_intake_answer: {key}={parsed!r}")
        return json.dumps({"saved": True, "key": key, "value": parsed})

    def get_days_to_tax_deadline() -> str:
        """Return the number of calendar days remaining until March 31, 2026.

        Call this before any analysis output or whenever urgency matters.
        """
        deadline = date(2026, 3, 31)
        today = datetime.now().date()
        days = max(0, (deadline - today).days)
        urgency = "critical" if days < 3 else "high" if days <= 7 else "normal"
        return json.dumps({
            "days_remaining": days,
            "deadline": "March 31, 2026",
            "urgency": urgency,
            "settlement_note": (
                "T+1 settlement for equity MFs; place orders before 3:00 PM on March 31."
                if days <= 3 else
                "Equity MFs: T+1 settlement. Allow 1 extra day buffer for execution."
            ),
        })

    def get_document_checklist() -> str:
        """Generate a personalised document checklist based on brokers and portfolio type.

        Uses session_state fields: brokers, has_mf_outside_demat, has_fno, carry_forward.
        Call this after completing the intake phase to tell the user exactly what to upload.
        """
        brokers = session_state.get("brokers") or []
        has_mf = session_state.get("has_mf_outside_demat", True)
        has_cf = session_state.get("carry_forward", False)

        checklist = []

        if isinstance(brokers, list):
            broker_list = brokers
        else:
            broker_list = [brokers]

        for broker in broker_list:
            b = str(broker).lower()
            if "zerodha" in b or "kite" in b:
                checklist.append({
                    "doc_type": "broker_pl",
                    "broker": "Zerodha",
                    "description": "Tax P&L XLSX",
                    "download_path": "Zerodha Console → Reports → Tax P&L → Download XLSX",
                    "format": "xlsx",
                })
                checklist.append({
                    "doc_type": "broker_holdings",
                    "broker": "Zerodha",
                    "description": "Holdings XLSX",
                    "download_path": "Zerodha Console → Portfolio → Holdings → Download",
                    "format": "xlsx",
                })
            elif "groww" in b:
                checklist.append({
                    "doc_type": "broker_pl",
                    "broker": "Groww",
                    "description": "Capital Gains Report",
                    "download_path": "Groww app → Stocks → P&L → Download",
                    "format": "csv",
                })
                checklist.append({
                    "doc_type": "broker_holdings",
                    "broker": "Groww",
                    "description": "Holdings Export",
                    "download_path": "Groww app → Stocks → Holdings → Download",
                    "format": "csv",
                })
            elif "icici" in b:
                checklist.append({
                    "doc_type": "broker_pl",
                    "broker": "ICICI Direct",
                    "description": "Tax P&L Statement",
                    "download_path": "ICICIDirect → Reports → Tax → Capital Gains",
                    "format": "pdf",
                })
            elif "hdfc" in b:
                checklist.append({
                    "doc_type": "broker_pl",
                    "broker": "HDFC Securities",
                    "description": "P&L Statement",
                    "download_path": "HDFC Securities → Reports → P&L Statement",
                    "format": "pdf",
                })
            else:
                checklist.append({
                    "doc_type": "broker_pl",
                    "broker": broker,
                    "description": "Capital Gains / Tax P&L Report",
                    "download_path": f"Log in to {broker} → Reports → Tax/P&L",
                    "format": "pdf or xlsx or csv",
                })

        if has_mf:
            checklist.append({
                "doc_type": "cas",
                "broker": "CAMS/KFintech",
                "description": "Consolidated Account Statement (Detailed CAS) — covers ALL your mutual funds",
                "download_path": "Go to mfcentral.com → My Account → Consolidated Statement → select 'Detailed' → Download",
                "format": "pdf",
                "password_note": "Password is typically your PAN (ABCDE1234F) or date of birth (DDMMYYYY)",
            })

        if has_cf:
            checklist.append({
                "doc_type": "itr",
                "broker": "Income Tax Portal",
                "description": "Last year's ITR with Schedule CFL (Carry Forward Losses)",
                "download_path": "incometax.gov.in → e-File → Income Tax Returns → View Filed Returns → Download",
                "format": "pdf",
            })

        session_state["documents_needed"] = list({d["doc_type"] for d in checklist})
        return json.dumps({
            "checklist": checklist,
            "total_documents": len(checklist),
            "tip": "Upload the CAS first — it covers all your mutual funds in one file.",
        })

    # ── Document processing tools ──────────────────────────────────────────────

    async def parse_uploaded_document(
        doc_type: str,
        file_content_base64: str,
        filename: str,
        broker_name: Optional[str] = None,
        password: Optional[str] = None,
    ) -> str:
        """Parse an uploaded document and store the extracted data in the session.

        This tool processes a document that was uploaded via the /tax-harvest/upload endpoint.
        The file content is already decoded and available via the session's pending_upload field.
        Call this when you see a [UPLOAD_READY] sentinel in the conversation.

        Args:
            doc_type: Document type: 'cas', 'broker_pl', 'broker_holdings', or 'itr'.
            file_content_base64: Not used directly — file is in session pending_upload. Pass 'session'.
            filename: The original filename (for context).
            broker_name: Broker name for broker documents (e.g., 'Zerodha', 'Groww').
            password: Password for encrypted PDFs/XLSXs (if already provided by user).
        """
        import base64
        from ..whatsapp_bot.document_parser import is_pdf_encrypted, decrypt_pdf
        from ..whatsapp_bot.llm_doc_parser import parse_document

        # Retrieve file from session pending_upload
        pending = session_state.get("pending_upload")
        if not pending:
            return json.dumps({"error": "No pending upload found. Please upload a file first."})

        raw_bytes = pending.get("raw_bytes")
        content_type = pending.get("content_type", "application/octet-stream")
        if not raw_bytes:
            return json.dumps({"error": "Upload data missing. Please re-upload the file."})

        # Convert from base64 if needed (stored as base64 in session)
        if isinstance(raw_bytes, str):
            try:
                raw_bytes = base64.b64decode(raw_bytes)
            except Exception:
                return json.dumps({"error": "Could not decode uploaded file."})

        # Handle encrypted PDFs
        if "pdf" in content_type.lower() or filename.lower().endswith(".pdf"):
            if is_pdf_encrypted(raw_bytes):
                if not password:
                    return json.dumps({
                        "status": "needs_password",
                        "message": (
                            f"The file **{filename}** is password-protected. "
                            "Typically the password is your PAN (e.g. ABCDE1234F) or date of birth (DDMMYYYY). "
                            "Please enter the password to continue."
                        ),
                    })
                try:
                    raw_bytes = decrypt_pdf(raw_bytes, password)
                except Exception:
                    return json.dumps({
                        "status": "wrong_password",
                        "message": f"Incorrect password for **{filename}**. Please try again.",
                    })

        # Parse via LLM
        import asyncio
        try:
            parsed = await parse_document(raw_bytes, content_type, doc_type)
        except Exception as e:
            logger.error(f"parse_uploaded_document: parse failed: {e}")
            return json.dumps({
                "status": "parse_error",
                "message": f"Could not read this document. Please check the file format and try again.",
            })

        # Store in session
        state_key = {
            "cas": "cas_parsed",
            "broker_pl": "broker_pl_parsed",
            "broker_holdings": "broker_holdings_parsed",
            "itr": "itr_parsed",
        }.get(doc_type, f"{doc_type}_parsed")
        session_state[state_key] = parsed

        docs_done = list(session_state.get("documents_done") or [])
        if doc_type not in docs_done:
            docs_done.append(doc_type)
        session_state["documents_done"] = docs_done

        # Clear pending upload
        session_state["pending_upload"] = None

        # Build summary
        summary = _build_parse_summary(doc_type, parsed, broker_name)
        return json.dumps({"status": "parsed", "doc_type": doc_type, "summary": summary})

    def run_tax_computation() -> str:
        """Run the full capital gains tax computation using all uploaded documents.

        Computes LTCG/STCG/LTCL/STCL netting per Sections 70/71/72/112A/87A.
        Also computes loss harvesting candidates and gains harvesting candidates.

        Call this when all required documents are uploaded (check session_state.documents_done
        vs session_state.documents_needed).
        """
        from ..whatsapp_bot.tax_engine import (
            compute_tax_analysis,
            get_loss_harvest_candidates_mf,
            get_loss_harvest_candidates_stocks,
            get_gains_harvest_candidates_mf,
        )

        # Verify at least one document is parsed
        has_docs = any([
            session_state.get("cas_parsed"),
            session_state.get("broker_pl_parsed"),
        ])
        if not has_docs:
            return json.dumps({
                "error": "No documents parsed yet. Please upload at least a CAS PDF or Broker P&L report first."
            })

        try:
            analysis = compute_tax_analysis(session_state)
        except Exception as e:
            logger.error(f"run_tax_computation: failed: {e}")
            return json.dumps({"error": f"Tax computation failed: {str(e)}"})

        session_state["tax_analysis"] = analysis
        remaining_exemption = float(analysis.get("exemption_remaining") or 0)

        try:
            loss_mf = get_loss_harvest_candidates_mf(session_state)
            loss_stocks = get_loss_harvest_candidates_stocks(session_state)
            gains_mf = get_gains_harvest_candidates_mf(remaining_exemption, session_state)
        except Exception as e:
            logger.warning(f"run_tax_computation: harvesting plans failed: {e}")
            loss_mf, loss_stocks, gains_mf = [], [], []

        session_state["loss_harvest_mf"] = loss_mf
        session_state["loss_harvest_stocks"] = loss_stocks
        session_state["gains_harvest_mf"] = gains_mf
        session_state["step"] = "analysis"

        return json.dumps({
            "status": "computed",
            "total_tax": analysis.get("total_tax"),
            "exemption_used": analysis.get("exemption_used"),
            "exemption_remaining": analysis.get("exemption_remaining"),
            "realised": analysis.get("realised"),
            "tax": analysis.get("tax"),
            "optimal_vs_naive_saving": analysis.get("optimal_vs_naive_saving"),
            "loss_harvest_mf_count": len(loss_mf),
            "loss_harvest_stocks_count": len(loss_stocks),
            "gains_harvest_mf_count": len(gains_mf),
        })

    def get_loss_harvest_plan() -> str:
        """Retrieve the pre-computed loss harvesting plan from the session.

        Returns candidates for MF loss harvesting and stock loss harvesting.
        Call run_tax_computation first if tax_analysis is not set.
        """
        loss_mf = session_state.get("loss_harvest_mf") or []
        loss_stocks = session_state.get("loss_harvest_stocks") or []
        analysis = session_state.get("tax_analysis") or {}

        return json.dumps({
            "total_tax": analysis.get("total_tax", 0),
            "loss_harvest_mf": loss_mf,
            "loss_harvest_stocks": loss_stocks,
            "total_mf_candidates": len(loss_mf),
            "total_stock_candidates": len(loss_stocks),
        })

    def get_gains_harvest_plan() -> str:
        """Retrieve the pre-computed gains harvesting (exemption booking) plan.

        Returns equity MF candidates to sell + repurchase to use the ₹1.25L LTCG exemption.
        Call run_tax_computation first if gains_harvest_mf is not set.
        """
        gains_mf = session_state.get("gains_harvest_mf") or []
        analysis = session_state.get("tax_analysis") or {}

        return json.dumps({
            "exemption_remaining": analysis.get("exemption_remaining", 0),
            "gains_harvest_mf": gains_mf,
            "total_candidates": len(gains_mf),
        })

    def get_session_summary() -> str:
        """Return a summary of the current session state.

        Shows what has been collected so far: intake answers, uploaded documents,
        and whether analysis has been run. Use to check progress.
        """
        return json.dumps({
            "step": session_state.get("step"),
            "intake_complete": bool(
                session_state.get("income_slab")
                and session_state.get("tax_regime")
                and session_state.get("brokers")
            ),
            "income_slab": session_state.get("income_slab"),
            "tax_regime": session_state.get("tax_regime"),
            "resident_status": session_state.get("resident_status"),
            "brokers": session_state.get("brokers"),
            "has_fno": session_state.get("has_fno"),
            "has_mf_outside_demat": session_state.get("has_mf_outside_demat"),
            "carry_forward": session_state.get("carry_forward"),
            "documents_needed": session_state.get("documents_needed"),
            "documents_done": session_state.get("documents_done"),
            "has_cas": bool(session_state.get("cas_parsed")),
            "has_broker_pl": bool(session_state.get("broker_pl_parsed")),
            "has_broker_holdings": bool(session_state.get("broker_holdings_parsed")),
            "has_itr": bool(session_state.get("itr_parsed")),
            "analysis_complete": bool(session_state.get("tax_analysis")),
        })

    return (
        save_intake_answer,
        get_days_to_tax_deadline,
        get_document_checklist,
        parse_uploaded_document,
        run_tax_computation,
        get_loss_harvest_plan,
        get_gains_harvest_plan,
        get_session_summary,
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_parse_summary(doc_type: str, parsed: dict, broker_name: Optional[str]) -> dict:
    """Build a structured summary of what was extracted from a document."""
    if doc_type == "cas":
        return {
            "investor_name": parsed.get("investor_name", "Unknown"),
            "pan": parsed.get("pan", "—"),
            "folios": len(parsed.get("folios") or []),
            "total_realised_ltcg": parsed.get("total_realised_ltcg_fy", 0),
            "total_realised_stcg": parsed.get("total_realised_stcg_fy", 0),
            "total_realised_ltcl": parsed.get("total_realised_ltcl_fy", 0),
            "total_realised_stcl": parsed.get("total_realised_stcl_fy", 0),
        }
    elif doc_type == "broker_pl":
        return {
            "broker": broker_name or parsed.get("broker_name", "Unknown"),
            "total_ltcg": parsed.get("total_ltcg", 0),
            "total_stcg": parsed.get("total_stcg", 0),
            "total_ltcl": parsed.get("total_ltcl", 0),
            "total_stcl": parsed.get("total_stcl", 0),
        }
    elif doc_type == "broker_holdings":
        return {
            "broker": broker_name or parsed.get("broker_name", "Unknown"),
            "holdings_count": len(parsed.get("holdings") or []),
            "total_portfolio_value": parsed.get("total_portfolio_value", 0),
        }
    elif doc_type == "itr":
        return {
            "ltcl_carryforward": parsed.get("total_ltcl_cf", 0),
            "stcl_carryforward": parsed.get("total_stcl_cf", 0),
        }
    return {}
