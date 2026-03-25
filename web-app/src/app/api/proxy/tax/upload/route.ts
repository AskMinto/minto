/**
 * Dedicated Next.js API route for /api/proxy/tax/upload (legacy redirect).
 *
 * The new tax saver upload endpoint is /tax-saver/upload/{doc_key}.
 * This file is kept to avoid 404s from any cached references, but redirects
 * to the correct endpoint are handled by the generic proxy rewrite.
 *
 * For the new upload path see: /api/proxy/tax-saver/upload/[doc_key]/route.ts
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handler(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    { error: "This endpoint has moved. Use /tax-saver/upload/{doc_key}" },
    { status: 410 }
  );
}

export { handler as POST };
