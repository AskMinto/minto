import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Exclude static files, images, and the auth callback route.
    // The callback must not be intercepted — it needs to set cookies itself.
    "/((?!_next/static|_next/image|favicon.ico|minto.png|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
