"""
Prompt loader — reads all prompts from prompts.yaml.

Usage:
    from app.core.prompts import prompts

    prompts.system_prompt_base          # str
    prompts.agent_instructions          # list[str]
    prompts.guardrail_patterns          # list[str]
    prompts.build_user_prompt(...)      # assembled user prompt

Model config (model IDs, temperatures, limits) lives in model_config.yaml.
See app.core.model_config for those accessors.
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
        financial_profile: dict[str, Any] | None = None,
    ) -> str:
        cfg = self._data["user_prompt"]
        totals = portfolio.get("totals", {})
        top_holdings = portfolio.get("top_holdings", [])

        portfolio_summary = (
            f"Invested: ₹{totals.get('invested', 0):,.0f}, "
            f"P&L: {totals.get('pnl_pct', 0):.1f}%"
        )

        from .model_config import model_config
        max_holdings = model_config.research_agent.get("max_holdings_in_prompt", 10)
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
        if financial_profile:
            fp_block = self._format_financial_profile(financial_profile)
            if fp_block:
                parts.append(fp_block)
        if message:
            parts.append(cfg["message_section"].format(message=message).strip())
        return "\n\n".join(parts)

    def _format_financial_profile(self, profile: dict[str, Any]) -> str:
        """Format the financial profile into a concise context block."""
        template = self._data["user_prompt"].get("financial_profile_section", "")
        if not template:
            return ""

        responses = profile.get("responses", {})
        metrics = profile.get("metrics", {})

        def fmt(n: Any) -> str:
            if n is None or n == "" or n == 0:
                return "—"
            try:
                num = float(n)
                if num >= 10000000:
                    return f"₹{num / 10000000:.2f}Cr"
                if num >= 100000:
                    return f"₹{num / 100000:.1f}L"
                if num >= 1000:
                    return f"₹{num / 1000:.0f}K"
                return f"₹{num:,.0f}"
            except (TypeError, ValueError):
                return str(n)

        def pct(n: Any) -> str:
            if n is None:
                return "—"
            try:
                return f"{float(n):.1f}%"
            except (TypeError, ValueError):
                return "—"

        name = responses.get("name", "—")
        age = responses.get("age", "—")
        job = responses.get("jobNature", "—")
        earners = responses.get("earningMembers", "—")
        dependents = responses.get("dependents", "—")

        total_income = metrics.get("total_income", 0)
        monthly_surplus = metrics.get("monthly_surplus", 0)
        total_debt = metrics.get("total_debt", 0)
        total_assets = metrics.get("total_assets", 0)
        net_worth = metrics.get("net_worth", 0)

        savings_ratio = metrics.get("savings_ratio")
        dti = metrics.get("dti")
        liquidity_ratio = metrics.get("liquidity_ratio")
        solvency_ratio = metrics.get("solvency_ratio")
        esop_concentration = metrics.get("esop_concentration")

        has_life_ins = responses.get("hasLifeInsurance")
        life_cover = responses.get("lifeInsuranceCover", 0)
        has_health_ins = responses.get("hasHealthInsurance")
        health_cover = responses.get("healthInsuranceCover", 0)

        has_esops = responses.get("hasEsops")
        esop_type = responses.get("esopCompanyType", "")
        esop_vested = responses.get("esopVestedValue", 0)

        goals = responses.get("goals", [])
        goals_str = (
            ", ".join(
                f"{g.get('name', '?')} ({fmt(g.get('amount'))} in {g.get('years', '?')}y)"
                for g in goals[:5]
            )
            if goals
            else "None set"
        )

        comfort = responses.get("comfortLevel", "—")
        comfort_labels = {
            "buy_more": "Buy more in a dip",
            "calm": "Hold calmly",
            "anxious": "Gets anxious",
            "sell": "Likely to sell",
        }
        comfort_str = comfort_labels.get(comfort, comfort)

        allocation = metrics.get("allocation", {})
        alloc_str = (
            ", ".join(f"{k}: {v}%" for k, v in allocation.items())
            if allocation
            else "—"
        )

        insurance_str = ""
        if has_life_ins is not None:
            insurance_str += (
                f"Life: {'Yes ' + fmt(life_cover) if has_life_ins else 'No'}"
            )
        if has_health_ins is not None:
            insurance_str += (
                f", Health: {'Yes ' + fmt(health_cover) if has_health_ins else 'No'}"
            )

        esop_str = "None"
        if has_esops:
            esop_str = f"{esop_type} company, vested: {fmt(esop_vested)}"

        return template.format(
            name=name,
            age=age,
            job=job,
            earners=earners,
            dependents=dependents,
            total_income=fmt(total_income),
            monthly_surplus=fmt(monthly_surplus),
            total_debt=fmt(total_debt),
            total_assets=fmt(total_assets),
            net_worth=fmt(net_worth),
            savings_ratio=pct(savings_ratio),
            dti=pct(dti),
            liquidity_ratio=f"{liquidity_ratio:.1f} months" if liquidity_ratio else "—",
            solvency_ratio=pct(solvency_ratio),
            esop_concentration=pct(esop_concentration),
            insurance=insurance_str or "—",
            esops=esop_str,
            goals=goals_str,
            comfort=comfort_str,
            allocation=alloc_str,
        ).strip()

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

    # ── Risk Agent ───────────────────────────────────────

    @property
    def risk_agent_description(self) -> str:
        return self._data["risk_agent"]["description"].strip()

    @property
    def risk_agent_instructions(self) -> list[str]:
        return self._data["risk_agent"]["instructions"]

    # ── Voice Agent ──────────────────────────────────────

    @property
    def voice_agent_hint(self) -> str:
        return self._data["voice_agent"]["hint"].strip()

    # ── Alert Agent ──────────────────────────────────────

    @property
    def alert_agent_role(self) -> str:
        return self._data["alert_agent"].get("role", "Manage price alerts")

    @property
    def alert_agent_instructions(self) -> list[str]:
        return self._data["alert_agent"].get("instructions", [])

    # ── Team Router ──────────────────────────────────────

    @property
    def team_router_instructions(self) -> list[str]:
        return self._data["team_router"].get("instructions", [])


prompts = Prompts()
