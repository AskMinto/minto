/**
 * Dedicated proxy for POST /api/proxy/tax-saver/analyse
 *
 * The generic /api/proxy rewrite has no timeout control — Cloud Run's default
 * request timeout drops the connection while Gemini is still generating the
 * analysis (30-90s). This route sets maxDuration=300 and streams the SSE
 * response body directly so the connection stays alive throughout.
 */

import { NextRequest } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const backendUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = request.headers.get("authorization");
  if (auth) headers["authorization"] = auth;

  const upstream = await fetch(`${backendUrl}/tax-saver/analyse`, {
    method: "POST",
    headers,
  });

  // Stream the SSE body directly — buffering would timeout waiting for completion
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
