from supabase import create_client

from ..core.config import SUPABASE_URL, SUPABASE_ANON_KEY


class SupabaseNotConfigured(Exception):
    pass


def get_supabase_client(user_jwt: str):
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise SupabaseNotConfigured("Supabase is not configured")
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(user_jwt)
    return client
