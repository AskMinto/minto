/**
 * Dedicated Next.js API route for /api/proxy/tax/upload.
 *
 * Why this exists instead of the generic /api/proxy rewrite:
 * Next.js rewrites don't support per-route timeout configuration.
 * Document parsing via the Gemini File API can take 60–120+ seconds
 * for large PDFs (upload → wait for ACTIVE state → generate_content).
 * The generic rewrite uses the default Next.js server timeout (~60s),
 * which causes a 502 to the browser before the backend finishes, even
 * though the backend is still processing and eventually returns 200 OK.
 *
 * This route intercepts /api/proxy/tax/upload specifically and sets
 * maxDuration = 300 (5 minutes), giving the Gemini parse enough time
 * to complete. All other /api/proxy/* routes continue to use the rewrite.
 */

import { NextRequest, NextResponse } from "next/server";

// 5 minutes — enough for large CAS PDFs going through Gemini File API
export const maxDuration = 300;

// Must be dynamic since this proxies to an external service
export const dynamic = "force-dynamic";

async function handler(request: NextRequest): Promise<NextResponse> {
  const backendUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const targetUrl = `${backendUrl}/tax/upload`;

  // Forward the Authorization header from the browser
  const headers: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  if (auth) headers["authorization"] = auth;

  // Forward the body as-is (multipart/form-data — don't touch Content-Type,
  // the browser set the correct boundary)
  const response = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: request.body,
    // @ts-expect-error — duplex is required for streaming body in Node.js fetch
    duplex: "half",
  });

  const data = await response.json();

  return NextResponse.json(data, { status: response.status });
}

export { handler as POST };
