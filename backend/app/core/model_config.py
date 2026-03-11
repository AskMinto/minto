"""
Model configuration loader — reads all model IDs and runtime config from model_config.yaml.

Usage:
    from app.core.model_config import model_config

    model_config.research_agent["model"]        # "gemini-3-flash-preview"
    model_config.voice_agent["voice"]           # "verse"
    model_config.timezone                       # "Asia/Kolkata"
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import yaml


_YAML_PATH = os.path.join(os.path.dirname(__file__), "..", "model_config.yaml")


@lru_cache(maxsize=1)
def _load_yaml() -> dict[str, Any]:
    with open(_YAML_PATH, "r") as f:
        return yaml.safe_load(f)


def reload():
    """Clear cache and reload config from disk."""
    _load_yaml.cache_clear()


class ModelConfig:
    """Typed accessors for model_config.yaml."""

    @property
    def _data(self) -> dict[str, Any]:
        return _load_yaml()

    @property
    def timezone(self) -> str:
        return self._data["defaults"]["timezone"]

    @property
    def research_agent(self) -> dict[str, Any]:
        return self._data["research_agent"]

    @property
    def alert_agent(self) -> dict[str, Any]:
        return self._data["alert_agent"]

    @property
    def team_router(self) -> dict[str, Any]:
        return self._data["team_router"]

    @property
    def risk_agent(self) -> dict[str, Any]:
        return self._data["risk_agent"]

    @property
    def voice_agent(self) -> dict[str, Any]:
        return self._data["voice_agent"]


model_config = ModelConfig()
