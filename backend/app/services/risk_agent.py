from __future__ import annotations

import json
import logging
from typing import Literal

from pydantic import BaseModel, Field
from agno.agent import Agent
from agno.models.google import Gemini

from ..core.config import GEMINI_API_KEY

logger = logging.getLogger(__name__)


class ConcentrationFlag(BaseModel):
    type: Literal["stock", "sector", "top_concentration", "overlap", "currency", "esop"]
    label: str
    pct: float | None = None
    severity: Literal["red", "yellow", "green"]
    why: str


class RiskAnalysis(BaseModel):
    risk_score: float = Field(ge=0, le=100, description="Overall portfolio risk score 0-100")
    risk_level: Literal["low", "moderate", "high", "very_high"]
    concentration_flags: list[ConcentrationFlag] = Field(default_factory=list)
    diversification_notes: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    summary: str = Field(description="2-3 sentence executive summary")


_RISK_AGENT_INSTRUCTIONS = """You are a portfolio risk analyst specializing in Indian equity and mutual fund markets. Analyze the provided portfolio data and produce a structured risk assessment.

## Core Analysis Rules

1. **Distinguish single stocks from mutual funds.** A diversified mutual fund (flexi cap, multi cap, large cap, index fund, large & mid cap, ELSS diversified, balanced advantage, hybrid) holding 40% of the portfolio is NOT the same risk as a single stock at 40%. Diversified MFs internally hold 30-80+ stocks across multiple sectors. Only flag diversified MFs as concentration risk if they dominate at extreme levels (>60%).

2. **Identify concentrated MFs.** Sectoral funds, thematic funds (e.g., IT sector, pharma, infrastructure, PSU, banking sector, consumption) ARE concentrated. If a sectoral/thematic MF is a large holding, flag it similarly to a single stock. Infer the fund type from the scheme name.

3. **Check sector overlap.** If the user holds IT stocks (e.g., TCS, Infosys) AND an IT sector fund, that's real concentration even if each individually looks fine. Sum up the effective sector exposure.

4. **Flag ESOP concentration.** If user data suggests ESOP holdings concentrated in a single employer, flag the risk relative to total financial assets.

5. **Check currency exposure.** For users earning in INR but holding international funds or US-listed equities, note the currency risk.

6. **Top-N concentration.** Check if top 3 holdings represent >50% of portfolio. Weight mutual fund holdings as diversified (lower risk) unless they are sectoral/thematic.

7. **Use financial profile context.** If a financial profile is provided, consider:
   - Risk comfort level and investment horizon — higher risk tolerance means fewer yellow flags
   - DTI ratio — high DTI + concentrated portfolio is worse
   - Liquidity ratio — low liquidity + high equity concentration is risky
   - Goals timeline — short-term goals need less volatile allocation

8. **Never give buy/sell advice.** Only provide analytical risk observations and general recommendations like "consider diversifying" or "review sector exposure."

9. **Be concise.** Each flag's `why` field should be 1-2 sentences max. The `summary` should be a crisp 2-3 sentence overview.

10. **Risk score guidelines:**
    - 0-25: Low risk — well-diversified, no major concentration issues
    - 26-50: Moderate risk — some concentration but manageable
    - 51-75: High risk — significant concentration or overlap issues
    - 76-100: Very high risk — extreme concentration, lack of diversification

11. **Severity guidelines for flags:**
    - green: Informational, no action needed
    - yellow: Worth monitoring, consider rebalancing
    - red: Significant risk, should be addressed

12. **If portfolio is empty or has very few holdings**, note limited diversification but don't over-flag.
"""


def _empty_analysis() -> dict:
    """Return a default empty analysis dict."""
    return RiskAnalysis(
        risk_score=0,
        risk_level="low",
        concentration_flags=[],
        diversification_notes=["No portfolio data available for analysis."],
        recommendations=[],
        summary="No holdings found to analyze.",
    ).model_dump()


def run_risk_analysis(portfolio: dict, financial_profile: dict | None = None) -> dict:
    """Run AI risk analysis on portfolio data. Returns RiskAnalysis as dict."""
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not configured, skipping risk analysis")
        return _empty_analysis()

    holdings = portfolio.get("holdings", [])
    if not holdings:
        return _empty_analysis()

    # Build context string with portfolio data
    context_parts = ["## Portfolio Data", json.dumps(portfolio, default=str, indent=2)]

    if financial_profile:
        context_parts.append("\n## Financial Profile")
        context_parts.append(json.dumps(financial_profile, default=str, indent=2))

    context_str = "\n".join(context_parts)

    try:
        agent = Agent(
            model=Gemini(id="gemini-2.0-flash", temperature=0.2),
            description="Portfolio risk analyst for Indian equity and mutual fund markets.",
            instructions=_RISK_AGENT_INSTRUCTIONS.strip().split("\n"),
            additional_context=context_str,
            output_schema=RiskAnalysis,
            markdown=False,
            tool_call_limit=0,
            add_datetime_to_context=True,
            timezone_identifier="Asia/Kolkata",
        )

        result = agent.run("Analyze this portfolio for concentration and diversification risks.")

        if result and result.content:
            if isinstance(result.content, RiskAnalysis):
                return result.content.model_dump()
            elif isinstance(result.content, dict):
                return RiskAnalysis(**result.content).model_dump()
            elif isinstance(result.content, str):
                parsed = json.loads(result.content)
                return RiskAnalysis(**parsed).model_dump()

        logger.warning("Risk agent returned no content")
        return _empty_analysis()

    except Exception:
        logger.exception("Risk analysis agent failed")
        return _empty_analysis()
