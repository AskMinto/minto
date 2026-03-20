"""PDF report generator for the WhatsApp Tax Bot (US-36).

Generates a self-contained PDF report using reportlab.
The report mirrors ITR Schedule CG format so a CA can verify the figures.
"""

from __future__ import annotations

import io
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .tax_engine import compute_cf_strategy, days_to_deadline


def generate_report_pdf(session_state: dict) -> bytes:
    """Generate the complete tax harvesting PDF report.

    Args:
        session_state: The agent's session_state dict with all parsed data and analysis.

    Returns:
        PDF bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=16, spaceAfter=6)
    h2_style = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=4)
    h3_style = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=10, spaceBefore=8, spaceAfter=2)
    body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=9, spaceAfter=3)
    small_style = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, textColor=colors.grey, spaceAfter=2)
    warning_style = ParagraphStyle("Warning", parent=styles["Normal"], fontSize=9, textColor=colors.red, spaceBefore=4, spaceAfter=4)

    story = []

    tax = session_state.get("tax_analysis") or {}
    cas = session_state.get("cas_parsed") or {}
    broker_pl = session_state.get("broker_pl_parsed") or {}
    itr = session_state.get("itr_parsed") or {}
    ulip_warning = session_state.get("ulip_disclaimer_active", False)

    investor_name = cas.get("investor_name") or "—"
    pan = cas.get("pan") or "—"
    days = days_to_deadline()
    today_str = date.today().strftime("%d %b %Y")

    # ── Cover ────────────────────────────────────────────────────────────────
    story.append(Paragraph("Minto Tax Harvesting Report", title_style))
    story.append(Paragraph(f"FY 2025-26 | Generated: {today_str}", body_style))
    story.append(Paragraph(f"Investor: {investor_name} | PAN: {pan}", body_style))
    story.append(Spacer(1, 4 * mm))

    if days > 0:
        story.append(Paragraph(f"Days remaining until March 31, 2026: {days}", warning_style))
    else:
        story.append(Paragraph("March 31, 2026 has passed. This report is for record-keeping only.", warning_style))

    if ulip_warning:
        story.append(Paragraph(
            "DISCLAIMER: You indicated you have realised gains from a high-premium equity ULIP "
            "(annual premium >Rs 2.5L). The Rs 1.25L LTCG exemption shown below may already be "
            "partially or fully consumed by those ULIP gains, which are not included in this analysis. "
            "Consult a CA before acting.",
            warning_style,
        ))

    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 4 * mm))

    # ── What's included / excluded ───────────────────────────────────────────
    story.append(Paragraph("Scope of This Analysis", h2_style))
    included = [
        ["Included", ""],
        ["Mutual Funds (MFCentral CAS)", "Yes" if cas else "Not uploaded"],
        ["Stocks and ETFs (Broker P&L)", "Yes" if broker_pl else "Not uploaded"],
        ["Carry-Forward Losses (ITR)", "Yes" if itr else "Not uploaded / None"],
        ["ELSS (unlocked units only)", "Yes"],
    ]
    excluded = [
        ["Not Included", ""],
        ["ELSS locked units", "Excluded"],
        ["NPS (not taxed as capital gains)", "Out of scope"],
        ["ULIPs (separate tax treatment)", "Out of scope"],
        ["Foreign stocks", "Out of scope"],
        ["Unlisted shares (Sec 112, not 112A)", "Out of scope"],
        ["Dividend income (Income from Other Sources)", "Out of scope"],
    ]
    for data in [included, excluded]:
        t = Table(data, colWidths=[120 * mm, 40 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]))
        story.append(t)
        story.append(Spacer(1, 2 * mm))

    story.append(Spacer(1, 4 * mm))

    # ── Tax computation sheet (Schedule CG format) ───────────────────────────
    story.append(Paragraph("Capital Gains Computation — FY 2025-26", h2_style))
    story.append(Paragraph("(Mirrors ITR Schedule CG — for CA verification)", small_style))

    realised = tax.get("realised") or {}
    step1_stcl = tax.get("step1_stcl") or {}
    step1_ltcl = tax.get("step1_ltcl") or {}
    step2_ltcl = tax.get("step2_cf_ltcl") or {}
    step2_stcl = tax.get("step2_cf_stcl") or {}
    step3 = tax.get("step3_exemption") or {}
    step4 = tax.get("step4_87a") or {}
    tax_amounts = tax.get("tax") or {}

    def fmt(v) -> str:
        if v is None:
            return "—"
        return f"Rs {float(v):,.0f}"

    cg_data = [
        ["Description", "Amount"],
        ["GROSS CAPITAL GAINS (before any set-off)", ""],
        ["Equity STCG (@ 20% Sec 111A)", fmt(realised.get("equity_stcg"))],
        ["Equity LTCG (@ 12.5% Sec 112A)", fmt(realised.get("equity_ltcg"))],
        ["Non-equity STCG (@ slab rate)", fmt(realised.get("non_equity_stcg"))],
        ["Non-equity LTCG (@ 12.5% Sec 112, pre-Apr 2023)", fmt(realised.get("non_equity_ltcg"))],
        ["", ""],
        ["STEP 1 — Current Year Set-off (Sec 70/71)", ""],
        ["STCL applied vs non-equity STCG", fmt(step1_stcl.get("stcl_vs_noneq_stcg"))],
        ["STCL applied vs equity STCG", fmt(step1_stcl.get("stcl_vs_eq_stcg"))],
        ["STCL spill to non-equity LTCG", fmt(step1_stcl.get("stcl_spill_to_noneq_ltcg"))],
        ["STCL spill to equity LTCG", fmt(step1_stcl.get("stcl_spill_to_eq_ltcg"))],
        ["LTCL applied vs non-equity LTCG", fmt(step1_ltcl.get("ltcl_vs_noneq_ltcg"))],
        ["LTCL applied vs equity LTCG", fmt(step1_ltcl.get("ltcl_vs_eq_ltcg"))],
        ["", ""],
        ["STEP 2 — Carry-Forward Set-off (Sec 72)", ""],
        ["CF LTCL vs non-equity LTCG (non-exempt first)", fmt(step2_ltcl.get("cf_ltcl_vs_noneq_ltcg"))],
        ["CF LTCL vs equity LTCG", fmt(step2_ltcl.get("cf_ltcl_vs_eq_ltcg"))],
        ["CF STCL vs non-equity STCG", fmt(step2_stcl.get("cf_stcl_vs_noneq_stcg"))],
        ["CF STCL vs equity STCG", fmt(step2_stcl.get("cf_stcl_vs_eq_stcg"))],
        ["CF STCL vs non-equity LTCG", fmt(step2_stcl.get("cf_stcl_vs_noneq_ltcg"))],
        ["CF STCL vs equity LTCG", fmt(step2_stcl.get("cf_stcl_vs_eq_ltcg"))],
        ["", ""],
        ["STEP 3 — Rs 1.25L Exemption (Sec 112A, equity LTCG only)", ""],
        ["Net equity LTCG before exemption", fmt(step3.get("net_eq_ltcg_before_exemption"))],
        ["Exemption applied", fmt(step3.get("exemption_applied"))],
        ["Taxable equity LTCG", fmt(step3.get("taxable_eq_ltcg"))],
        ["Exemption remaining (unused)", fmt(step3.get("exemption_remaining"))],
        ["", ""],
        ["TAX COMPUTATION", ""],
        ["Tax on equity STCG (@ 20%)", fmt(tax_amounts.get("equity_stcg"))],
        ["Tax on equity LTCG above Rs 1.25L (@ 12.5%)", fmt(tax_amounts.get("equity_ltcg"))],
        ["Tax on non-equity STCG (@ slab rate)", fmt(tax_amounts.get("non_equity_stcg"))],
        ["Tax on non-equity LTCG (@ 12.5%)", fmt(tax_amounts.get("non_equity_ltcg"))],
        ["TOTAL TAX (before surcharge and cess)", fmt(tax.get("total_tax"))],
    ]

    cg_table = Table(cg_data, colWidths=[130 * mm, 40 * mm])
    cg_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d4a2d")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 7), (-1, 7), colors.HexColor("#e8f0e8")),
        ("FONTNAME", (0, 7), (-1, 7), "Helvetica-Bold"),
        ("BACKGROUND", (0, 15), (-1, 15), colors.HexColor("#e8f0e8")),
        ("FONTNAME", (0, 15), (-1, 15), "Helvetica-Bold"),
        ("BACKGROUND", (0, 23), (-1, 23), colors.HexColor("#e8f0e8")),
        ("FONTNAME", (0, 23), (-1, 23), "Helvetica-Bold"),
        ("BACKGROUND", (0, 29), (-1, 29), colors.HexColor("#e8f0e8")),
        ("FONTNAME", (0, 29), (-1, 29), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#d4edda")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(cg_table)
    story.append(Spacer(1, 3 * mm))

    # 87A note
    if step4.get("rebate_forfeited"):
        story.append(Paragraph(
            f"Section 87A Rebate: Forfeited — total income (Rs {step4.get('total_income_for_87a_check', 0):,.0f}) "
            f"exceeds Rs 12L threshold. Updated slab rate: {float(step4.get('updated_slab_rate', 0)) * 100:.0f}%.",
            warning_style,
        ))
    elif step4.get("claimed_87a"):
        story.append(Paragraph(
            "Section 87A Rebate: Eligible — total income within Rs 12L. Non-equity STCG effectively Rs 0 tax.",
            body_style,
        ))

    story.append(Paragraph(
        "Note: Surcharge (if applicable) and 4% Health and Education Cess are NOT included. "
        "Dividend income from MFs and stocks is excluded (taxed separately as Income from Other Sources). "
        "Consult a CA for your final tax liability.",
        small_style,
    ))

    # ── CF Loss Strategy ─────────────────────────────────────────────────────
    cf = compute_cf_strategy(tax)
    if cf.get("optimal_vs_naive_saving", 0) > 0 or cf.get("cf_ltcl_vs_noneq_ltcg", 0) > 0:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph("Carry-Forward Loss Allocation Strategy", h2_style))
        story.append(Paragraph(cf.get("explanation", ""), body_style))
        story.append(Paragraph(
            "The CF losses were applied against non-exempt gains first (non-equity LTCG before equity LTCG). "
            "When replicating this in ITR Schedule CG, ensure the CA applies the same ordering.",
            small_style,
        ))

    # ── ITR Filing Reminder ───────────────────────────────────────────────────
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("ITR Filing Reminder", h2_style))
    story.append(Paragraph(
        "If you booked any capital losses (loss harvesting), you MUST file ITR-2 or ITR-3 "
        "(NOT ITR-1) before July 31, 2026 to carry forward those losses. "
        "Filing late or using the wrong ITR form means the losses are permanently lost.",
        warning_style,
    ))

    # ── Disclaimers ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    story.append(Paragraph("Disclaimers", h3_style))
    story.append(Paragraph(
        "This report was generated by Minto and is for informational purposes only. "
        "It is not tax advice. The figures are estimates based on documents you uploaded and "
        "may not reflect all transactions. Actual tax liability may differ. "
        "Consult a qualified Chartered Accountant (CA) before filing your ITR or taking any action.",
        small_style,
    ))
    story.append(Paragraph(
        f"Tax regime assumed: {session_state.get('tax_regime', 'new')} | "
        f"Slab rate used: {float(session_state.get('slab_rate') or 0) * 100:.0f}% | "
        f"Report generated: {today_str}",
        small_style,
    ))

    doc.build(story)
    return buffer.getvalue()
