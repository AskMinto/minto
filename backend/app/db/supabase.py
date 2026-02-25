from supabase import create_client, ClientOptions

from ..core.config import SUPABASE_URL, SUPABASE_ANON_KEY


class SupabaseNotConfigured(Exception):
    pass


def get_supabase_client(user_jwt: str):
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise SupabaseNotConfigured("Supabase is not configured")
    return create_client(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        options=ClientOptions(
            headers={
                "Authorization": f"Bearer {user_jwt}",
                "apikey": SUPABASE_ANON_KEY,
            }
        ),
    )
