"""
Prompt loader — reads all prompts and config from prompts.yaml.

Usage:
    from app.core.prompts import prompts

    prompts.system_prompt_base          # str
    prompts.agent_instructions          # list[str]
    prompts.agent_config["model"]       # str
    prompts.guardrail_patterns          # list[str]
    prompts.format_user_prompt(...)     # assembled user prompt
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import yaml


_YAML_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts.yaml")


@lru_cache(maxsize=1)
def _load_yaml() -> dict[str, Any]:
    with open(_YAML_PATH, "r") as f:
        return yaml.safe_load(f)


def reload():
    """Clear cache and reload prompts from disk."""
    _load_yaml.cache_clear()


class Prompts:
    """Accessor for all prompt configuration."""

    @property
    def _data(self) -> dict[str, Any]:
        return _load_yaml()

    # ── System Prompt ────────────────────────────────────

    @property
    def system_prompt_base(self) -> str:
        return self._data["system_prompt"]["base"].strip()

    @property
    def system_prompt_risk_section(self) -> str:
        return self._data["system_prompt"]["risk_profile_section"].strip()

    def build_system_prompt(self, risk_profile: dict | None = None) -> str:
        prompt = self.system_prompt_base
        if risk_profile:
            level = risk_profile.get("risk_level", "unknown")
            score = risk_profile.get("risk_score", "N/A")
            prompt += "\n" + self.system_prompt_risk_section.format(
                level=level, score=score
            )
        return prompt

    # ── Agent Instructions ───────────────────────────────

    @property
    def agent_instructions(self) -> list[str]:
        return self._data["agent_instructions"]

    # ── User Prompt ──────────────────────────────────────

    def build_user_prompt(
        self,
        message: str,
        memory: str,
        portfolio: dict[str, Any],
    ) -> str:
        cfg = self._data["user_prompt"]
        totals = portfolio.get("totals", {})
        top_holdings = portfolio.get("top_holdings", [])

        portfolio_summary = (
            f"Invested: ₹{totals.get('invested', 0):,.0f}, "
            f"P&L: {totals.get('pnl_pct', 0):.1f}%"
        )

        max_holdings = self.agent_config.get("max_holdings_in_prompt", 10)
        holdings_lines = []
        for h in top_holdings[:max_holdings]:
            scheme_code = h.get("scheme_code")
            if scheme_code:
                name = h.get("scheme_name") or f"MF:{scheme_code}"
                holdings_lines.append(
                    cfg["holding_mf"].format(name=name, scheme_code=scheme_code)
                )
            else:
                name = h.get("symbol") or h.get("isin") or "Unknown"
                holdings_lines.append(cfg["holding_eq"].format(name=name))

        holdings_block = (
            "\n".join(holdings_lines) if holdings_lines else cfg["no_holdings"]
        )

        parts = []
        if memory:
            parts.append(cfg["memory_section"].format(memory=memory).strip())
        parts.append(
            cfg["portfolio_section"]
            .format(
                portfolio_summary=portfolio_summary,
                holdings_block=holdings_block,
            )
            .strip()
        )
        parts.append(cfg["message_section"].format(message=message).strip())
        return "\n\n".join(parts)

    # ── Guardrails ───────────────────────────────────────

    @property
    def guardrail_patterns(self) -> list[str]:
        return self._data["guardrails"]["blocked_patterns"]

    @property
    def guardrail_safe_response(self) -> str:
        return self._data["guardrails"]["safe_response"].strip()

    @property
    def disclaimer_strip_patterns(self) -> list[str]:
        return self._data["guardrails"]["disclaimer_strip_patterns"]

    # ── Agent Config ─────────────────────────────────────

    @property
    def agent_config(self) -> dict[str, Any]:
        return self._data["agent_config"]


prompts = Prompts()
