from __future__ import annotations

import re

from ..core.config import ASSISTANT_DISCLAIMER

BLOCKED_PATTERNS = [
    r"\bstrong buy\b",
    r"\bstrong sell\b",
    r"\btarget price\b",
    r"\bentry price\b",
    r"\bexit price\b",
    r"\bstop.?loss\b",
    r"\byou should buy\b",
    r"\byou should sell\b",
    r"\byou must buy\b",
    r"\byou must sell\b",
    r"\bI recommend buying\b",
    r"\bI recommend selling\b",
    r"\bbuy (?:this|it|now|today|immediately)\b",
    r"\bsell (?:this|it|now|today|immediately)\b",
    r"\baccumulate\b",
]

BLOCKED_REGEX = re.compile("|".join(BLOCKED_PATTERNS), flags=re.IGNORECASE)


def contains_blocked_phrase(text: str) -> bool:
    return bool(BLOCKED_REGEX.search(text or ""))


def safe_response(original: str) -> str:
    base = (
        "I can't provide buy/sell instructions. I can help explain concepts, "
        "risk factors, and how your holdings are performing based on available data."
    )
    return f"{base}\n\n{ASSISTANT_DISCLAIMER}"


def append_disclaimer(text: str) -> str:
    if ASSISTANT_DISCLAIMER in text:
        return text
    return f"{text}\n\n{ASSISTANT_DISCLAIMER}"
