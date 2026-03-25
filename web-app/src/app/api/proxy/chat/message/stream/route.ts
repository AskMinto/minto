/**
 * Dedicated proxy for POST /api/proxy/chat/message/stream
 *
 * The generic /api/proxy rewrite has no timeout control. Cloud Run's minto-web
 * service kills connections after 60s, but the research agent can take 50-90s
 * when tool calls are slow (search_instrument alone can take 15s on a bad day).
 *
 * This route sets maxDuration=300 and streams the SSE body directly so the
 * connection stays alive for the full agent run.
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

  const body = await request.text();

  const upstream = await fetch(`${backendUrl}/chat/message/stream`, {
    method: "POST",
    headers,
    body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
