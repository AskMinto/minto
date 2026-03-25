/**
 * Dedicated Next.js API route for /api/proxy/tax-saver/upload/[doc_key].
 *
 * Why this exists instead of the generic /api/proxy rewrite:
 * PDF extraction via the Gemini File API takes 60–120+ seconds for large PDFs.
 * The generic rewrite uses the default Next.js server timeout (~60s),
 * which causes a 502 before the backend finishes. This route sets
 * maxDuration = 300 (5 minutes) to give Gemini enough time to extract tables.
 *
 * The ?password= query param is forwarded as-is to the backend.
 */

/**
 * Dedicated proxy for POST /api/proxy/tax-saver/upload/[doc_key]
 *
 * PDF extraction via Gemini File API takes 60-120s for large CAS PDFs.
 * The generic rewrite has no timeout control — Cloud Run drops the connection
 * before FastAPI finishes, causing a false 500 even though the backend
 * successfully saves the extracted text to the database.
 *
 * Fix: maxDuration=300 + stream the response body directly (no buffering).
 * Buffering via response.json() holds the connection open waiting for the
 * complete JSON before returning — same timeout problem. Streaming the body
 * passes bytes through as they arrive, keeping the connection alive.
 */

import { NextRequest } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ doc_key: string }> }
): Promise<Response> {
  const { doc_key } = await params;
  const backendUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const searchParams = request.nextUrl.searchParams.toString();
  const targetUrl = `${backendUrl}/tax-saver/upload/${doc_key}${searchParams ? `?${searchParams}` : ""}`;

  const headers: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  if (auth) headers["authorization"] = auth;
  const contentType = request.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  const bodyBuffer = await request.arrayBuffer();

  const upstream = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: bodyBuffer,
  });

  // Stream directly — no buffering, no timeout racing
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
