import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/chat";

  // Cloud Run terminates TLS before the container — reconstruct the real origin
  // from forwarded headers so cookies and redirects use the correct HTTPS URL.
  const host = request.headers.get("host") || url.host;
  const protocol = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const origin = `${protocol}://${host}`;

  if (code) {
    const cookieStore = await cookies();

    // Build the redirect response first so we can set cookies on it directly.
    // In Next.js App Router route handlers, cookies must be set on the Response
    // object — cookieStore.set() alone does not attach them to the redirect.
    const redirectResponse = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            // Write to both the mutable cookieStore and the redirect response
            // so the session cookies travel with the redirect to /chat.
            cookiesToSet.forEach(({ name, value, options }) => {
              try { cookieStore.set(name, value, options as never); } catch { /* read-only in some contexts */ }
              redirectResponse.cookies.set(name, value, options as never);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectResponse;
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
