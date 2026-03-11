from __future__ import annotations

import json
import logging
from typing import Literal

from pydantic import BaseModel, Field
from agno.agent import Agent
from agno.models.google import Gemini

from ..core.config import GEMINI_API_KEY
from ..core.prompts import prompts
from ..core.model_config import model_config

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
        cfg = model_config.risk_agent
        agent = Agent(
            model=Gemini(id=cfg.get("model", "gemini-3-flash-preview"), temperature=cfg.get("temperature", 0.2)),
            description=prompts.risk_agent_description,
            instructions=prompts.risk_agent_instructions,
            additional_context=context_str,
            output_schema=RiskAnalysis,
            markdown=False,
            tool_call_limit=cfg.get("tool_call_limit", 0),
            add_datetime_to_context=True,
            timezone_identifier=model_config.timezone,
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
