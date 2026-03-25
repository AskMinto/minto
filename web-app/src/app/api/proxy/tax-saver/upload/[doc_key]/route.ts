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

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ doc_key: string }> }
): Promise<NextResponse> {
  const { doc_key } = await params;
  const backendUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  // Preserve the ?password= query param if present
  const searchParams = request.nextUrl.searchParams.toString();
  const targetUrl = `${backendUrl}/tax-saver/upload/${doc_key}${searchParams ? `?${searchParams}` : ""}`;

  const headers: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  if (auth) headers["authorization"] = auth;
  const contentType = request.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  const bodyBuffer = await request.arrayBuffer();

  const response = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: bodyBuffer,
  });

  const data = await response.json();

  return NextResponse.json(data, { status: response.status });
}

export { handler as POST };
