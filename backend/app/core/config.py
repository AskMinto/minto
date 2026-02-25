import os
from dotenv import load_dotenv

load_dotenv()


def _get_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    return value


SUPABASE_URL = _get_env("SUPABASE_URL") or _get_env("EXPO_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = _get_env("SUPABASE_ANON_KEY") or _get_env("EXPO_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_JWKS_URL = _get_env("SUPABASE_JWKS_URL")
SUPABASE_JWT_SECRET = _get_env("SUPABASE_JWT_SECRET")

GEMINI_API_KEY = _get_env("GEMINI_API_KEY")

MEM0_PROJECT_KEY = _get_env("MEM0_PROJECT_KEY")
MEM0_API_KEY = _get_env("MEM0_API_KEY")
MEM0_BASE_URL = _get_env("MEM0_BASE_URL", "https://api.mem0.ai/v1")
MEM0_AUTH_HEADER = _get_env("MEM0_AUTH_HEADER", "Authorization")
MEM0_AUTH_SCHEME = _get_env("MEM0_AUTH_SCHEME", "Bearer")
MEM0_PROJECT_HEADER = _get_env("MEM0_PROJECT_HEADER", "x-project-key")

MFAPI_BASE_URL = _get_env("MFAPI_BASE_URL", "https://api.mfapi.in")

YFINANCE_MAX_RESULTS = int(_get_env("YFINANCE_MAX_RESULTS", "12"))
YFINANCE_NEWS_COUNT = int(_get_env("YFINANCE_NEWS_COUNT", "6"))

DISCLAIMER_VERSION = _get_env("DISCLAIMER_VERSION", "v1")
ASSISTANT_DISCLAIMER = _get_env(
    "ASSISTANT_DISCLAIMER",
    "Minto provides informational insights, not investment advice. "
    "Consider consulting a SEBI-registered advisor before making decisions.",
)
