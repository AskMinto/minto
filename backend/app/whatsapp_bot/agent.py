"""WhatsApp Tax Bot Agno Agent.

Single shared Agent instance constructed once at import time.
The Agent object itself is stateless — session_state is loaded from
Supabase (via session_store.py) before each arun() call and saved back
after, using the existing SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
credentials (same pattern as alert_poller.py).

No direct Postgres connection required.
"""

from __future__ import annotations

import logging

from agno.agent import Agent
from agno.models.google import Gemini

from ..core.config import GEMINI_API_KEY
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

_instructions = prompts.raw.get("whatsapp_tax_agent", {}).get("instructions", "")
_description = prompts.raw.get("whatsapp_tax_agent", {}).get("description", "Minto Tax Bot for WhatsApp")


def build_wa_agent() -> Agent:
    """Build and return the shared WhatsApp Tax Bot agent.

    No db= kwarg — session persistence is handled explicitly in router.py
    via session_store.load_session() / session_store.save_session() using
    the existing Supabase service-role client.
    """
    return Agent(
        name="Minto Tax Bot",
        description=_description,
        instructions=_instructions,
        model=Gemini(id="gemini-2.0-flash", api_key=GEMINI_API_KEY),
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
        # session_state is injected per-call in router.py; set an empty default here
        session_state={},
        add_session_state_to_context=True,
        # History is reconstructed from the messages list stored in Supabase and
        # injected via additional_context each turn — no built-in DB history needed
        add_history_to_context=False,
        add_datetime_to_context=True,
        timezone_identifier="Asia/Kolkata",
        markdown=False,
    )


# Shared singleton — stateless; session_state is passed per-arun() call
wa_agent: Agent = build_wa_agent()
