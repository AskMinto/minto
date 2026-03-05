"""
Financial profile metrics computation and update utilities.

Recomputes derived metrics (DTI, solvency, liquidity, etc.) from raw
responses, mirroring the frontend wizard logic.
"""

from __future__ import annotations

from typing import Any


def _n(responses: dict, key: str) -> float:
    """Safely extract a numeric value from responses."""
    val = responses.get(key)
    if val is None or val == "":
        return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def compute_metrics(responses: dict[str, Any]) -> dict[str, Any]:
    """Recompute all financial metrics from raw profile responses."""
    n = lambda k: _n(responses, k)

    # Income
    total_gross = n("grossSalary") + n("employerPF")
    other_inc = n("rentalIncome") + n("businessIncome") + n("investmentIncome") + n("otherIncome")
    total_income = total_gross + other_inc
    mandatory_ded = n("ownPF") + n("incomeTax") + n("employerPF")

    # Expenses
    essential_exp = (
        n("housing") + n("groceries") + n("utilities") + n("transport")
        + n("education") + n("medical") + n("insurancePrem")
    )
    discretionary_exp = n("entertainment") + n("lifestyle") + n("subscriptions") + n("otherExpenses")
    total_emi = (
        n("homeLoanEMI") + n("carLoanEMI") + n("eduLoanEMI")
        + n("personalLoanEMI") + n("otherDebtEMI")
    )
    total_expenses = mandatory_ded + essential_exp + discretionary_exp + total_emi
    monthly_surplus = total_income - total_expenses
    annual_income = total_income * 12

    # Debt
    total_debt = (
        n("homeLoanOut") + n("carLoanOut") + n("eduLoanOut")
        + n("personalLoanOut") + n("creditCardDue") + n("otherDebtOut")
    )

    # Assets
    phys_assets = n("homeValue") + n("carValue") + n("goldPhysical")
    esop_vested = n("esopVestedValue")
    fin_assets = (
        n("equityMF") + n("debtMF") + n("shares") + n("ppf") + n("epf")
        + n("fd") + n("nps") + n("goldFinancial") + n("cashBank")
        + n("otherInvestments") + n("intlAssets") + esop_vested
    )
    total_assets = phys_assets + fin_assets
    net_worth = total_assets - total_debt

    # Ratios
    esop_concentration = (esop_vested / fin_assets * 100) if fin_assets > 0 else 0
    savings_ratio = (monthly_surplus / total_income * 100) if total_income > 0 else 0
    dti = (total_emi / total_income * 100) if total_income > 0 else 0
    expense_ratio = (total_expenses / total_income * 100) if total_income > 0 else 0
    solvency_ratio = (net_worth / total_assets * 100) if total_assets > 0 else 0
    leverage_ratio = (total_debt / total_assets * 100) if total_assets > 0 else 0
    liquid_assets = n("cashBank") + n("fd") + n("debtMF")
    monthly_exp = essential_exp + discretionary_exp + total_emi
    liquidity_ratio = (liquid_assets / monthly_exp) if monthly_exp > 0 else 0
    fin_assets_ratio = (fin_assets / total_assets * 100) if total_assets > 0 else 0
    acc_sav_inc = (fin_assets / annual_income) if annual_income > 0 else 0

    # Allocation (simplified version of frontend logic)
    income_currency = responses.get("incomeCurrency", "inr")
    has_intl = responses.get("hasIntlExposure")
    comfort = responses.get("comfortLevel", "calm")
    goals = responses.get("goals", [])

    world_eq = 15 if income_currency == "inr" and not has_intl else 10 if income_currency in ("inr", "mixed") else 5
    has_short_goal = any(float(g.get("years", 99)) <= 3 for g in goals) if goals else False
    stability = 15 if has_short_goal else 5
    if liquidity_ratio < 3:
        stability += 5
    gold = 10
    if comfort in ("anxious", "sell"):
        gold = 13
    elif comfort == "buy_more":
        gold = 7
    if dti > 40:
        world_eq = max(5, world_eq - 5)
        stability += 5
    if esop_concentration > 25:
        gold += 3
        stability += 2
    india_eq = max(30, 100 - stability - gold - world_eq)
    total_alloc = india_eq + gold + world_eq + stability
    if total_alloc != 100:
        india_eq += 100 - total_alloc

    return {
        "total_income": total_income,
        "monthly_surplus": monthly_surplus,
        "total_debt": total_debt,
        "total_assets": total_assets,
        "net_worth": net_worth,
        "savings_ratio": savings_ratio,
        "dti": dti,
        "expense_ratio": expense_ratio,
        "solvency_ratio": solvency_ratio,
        "leverage_ratio": leverage_ratio,
        "liquidity_ratio": liquidity_ratio,
        "fin_assets_ratio": fin_assets_ratio,
        "acc_savings_income": acc_sav_inc,
        "esop_concentration": esop_concentration,
        "allocation": {
            "indiaEq": india_eq,
            "gold": gold,
            "worldEq": world_eq,
            "stability": stability,
        },
    }


# All response fields that can be updated, grouped by category
UPDATABLE_FIELDS: dict[str, list[str]] = {
    "personal": ["name", "age", "earningMembers", "dependents", "jobNature", "incomeCurrency"],
    "income": ["grossSalary", "employerPF", "rentalIncome", "businessIncome", "investmentIncome", "otherIncome"],
    "deductions": ["ownPF", "incomeTax"],
    "essential_expenses": ["housing", "groceries", "utilities", "transport", "education", "medical", "insurancePrem"],
    "discretionary_expenses": ["entertainment", "lifestyle", "subscriptions", "otherExpenses"],
    "loans": ["homeLoanEMI", "homeLoanOut", "carLoanEMI", "carLoanOut", "eduLoanEMI", "eduLoanOut",
              "personalLoanEMI", "personalLoanOut", "creditCardDue", "otherDebtEMI", "otherDebtOut"],
    "insurance": ["hasLifeInsurance", "lifeInsuranceCover", "hasHealthInsurance", "healthInsuranceCover"],
    "esops": ["hasEsops", "esopCompanyType", "esopVestedValue", "esopUnvestedValue"],
    "assets": ["homeValue", "carValue", "goldPhysical", "equityMF", "debtMF", "shares",
               "ppf", "epf", "fd", "nps", "goldFinancial", "cashBank", "otherInvestments"],
    "international": ["hasIntlExposure", "intlAssets"],
    "goals_comfort": ["comfortLevel"],
}

ALL_UPDATABLE = {field for fields in UPDATABLE_FIELDS.values() for field in fields}
