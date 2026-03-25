/**
 * Dedicated proxy for POST /api/proxy/tax-saver/chat
 *
 * Same reasoning as the analyse route — SSE streams need maxDuration=300
 * and direct body streaming to survive Cloud Run's default request timeout.
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

  const upstream = await fetch(`${backendUrl}/tax-saver/chat`, {
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
