from __future__ import annotations

import logging

from agno.agent import Agent
from agno.models.google import Gemini

from ..core.prompts import prompts
from ..core.model_config import model_config
from ..agent_tools.alert_tools import make_alert_tools
from ..agent_tools.research_tools import search_instrument

logger = logging.getLogger(__name__)


def make_alert_agent(supabase_client, user_id: str) -> Agent:
    """Build a per-request alert management agent backed by Supabase tools."""
    create_alert, list_alerts, cancel_alert, request_alert_widget = make_alert_tools(supabase_client, user_id)
    cfg = model_config.alert_agent

    return Agent(
        name="Alert Agent",
        role=prompts.alert_agent_role,
        model=Gemini(
            id=cfg.get("model", "gemini-3-flash-preview"),
            temperature=cfg.get("temperature", 0.1),
        ),
        tools=[create_alert, list_alerts, cancel_alert, request_alert_widget, search_instrument],
        instructions=prompts.alert_agent_instructions,
        markdown=False,
        add_datetime_to_context=True,
        timezone_identifier=model_config.timezone,
    )
