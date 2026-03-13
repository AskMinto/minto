"""WhatsApp notification service via Twilio.

Sends alert notifications to users who have a phone number on file.
Phone numbers must be in E.164 format (e.g. +919876543210).
"""

from __future__ import annotations

import logging

from ..core.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

logger = logging.getLogger(__name__)


def send_whatsapp_alert(phone_number: str, message: str) -> bool:
    """Send a WhatsApp message via Twilio.

    Args:
        phone_number: User's phone in E.164 format (e.g. +919876543210).
        message: Plain text message body.

    Returns:
        True if the message was accepted by Twilio, False otherwise.
    """
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        logger.warning("Twilio credentials not configured — WhatsApp notification skipped")
        return False

    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        msg = client.messages.create(
            from_=TWILIO_WHATSAPP_FROM,
            to=f"whatsapp:{phone_number}",
            body=message,
        )
        logger.info(f"WhatsApp sent: sid={msg.sid}, to={phone_number}")
        return True
    except Exception as e:
        logger.error(f"WhatsApp send failed to {phone_number}: {e}")
        return False
