"""Web Tax Agent — Agno agent for the /tax-saver web interface.

Same tools and tax logic as wa_agent (WhatsApp bot) but with:
- markdown=True  (web interface renders markdown; WhatsApp does not)
- tax_web_agent prompts from prompts.yaml (web-appropriate formatting — no 1600-char limit,
  no split-message rule, rich markdown tables allowed)
- session_id = user_id (Supabase auth UUID, not phone number)

Session persistence is handled explicitly in tax_chat.py via web_session_store,
identical to how router.py uses session_store for the WhatsApp bot.
"""

from __future__ import annotations

import logging

from agno.agent import Agent
from agno.models.google import Gemini

from ..core.config import GEMINI_API_KEY
from ..core.model_config import model_config
from ..core.prompts import prompts
from .tools import (
    delete_user_data,
    generate_pdf_report,
    get_days_to_deadline,
    get_gains_harvest_plan,
    get_loss_harvest_plan,
    get_user_data_summary,
    opt_in_reminder,
    process_uploaded_document,
    run_tax_analysis,
    save_notification_contact,
    save_onboarding_answer,
    unlock_and_parse_document,
)

logger = logging.getLogger(__name__)

# Fall back to whatsapp_tax_agent instructions if tax_web_agent section not yet in YAML
_web_instructions = (
    prompts.raw.get("tax_web_agent", {}).get("instructions")
    or prompts.raw.get("whatsapp_tax_agent", {}).get("instructions", "")
)
_web_description = (
    prompts.raw.get("tax_web_agent", {}).get("description")
    or prompts.raw.get("whatsapp_tax_agent", {}).get("description", "Minto Tax Bot")
)


def build_web_tax_agent() -> Agent:
    """Build the shared web tax agent (markdown enabled, no message-length constraints)."""
    return Agent(
        name="Minto Tax Bot",
        description=_web_description,
        instructions=_web_instructions,
        model=Gemini(
            id=model_config._data.get("tax_web_agent", {}).get(
                "model",
                model_config._data.get("whatsapp_bot", {}).get("model", "gemini-3-flash-preview"),
            ),
            api_key=GEMINI_API_KEY,
        ),
        tools=[
            save_onboarding_answer,
            process_uploaded_document,
            unlock_and_parse_document,
            run_tax_analysis,
            get_loss_harvest_plan,
            get_gains_harvest_plan,
            opt_in_reminder,
            generate_pdf_report,
            save_notification_contact,
            get_days_to_deadline,
            delete_user_data,
            get_user_data_summary,
        ],
        session_state={},
        add_session_state_to_context=True,
        add_history_to_context=False,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
        markdown=True,  # Key difference from WhatsApp agent
    )


# Shared singleton — stateless; session_state is passed per-arun() call
web_tax_agent: Agent = build_web_tax_agent()
