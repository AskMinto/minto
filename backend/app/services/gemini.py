from __future__ import annotations

import google.generativeai as genai

from ..core.config import GEMINI_API_KEY


class GeminiNotConfigured(Exception):
    pass


def generate_response(system_prompt: str, user_prompt: str) -> str:
    """Simple Gemini call without tools — used as a fallback."""
    if not GEMINI_API_KEY:
        raise GeminiNotConfigured("GEMINI_API_KEY is not configured")
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name="gemini-3-flash-preview",
        system_instruction=system_prompt,
    )
    result = model.generate_content(user_prompt)
    if not result or not result.text:
        return ""
    return result.text.strip()
