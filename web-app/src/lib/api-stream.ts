import { createClient } from "@/lib/supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export interface SSEEvent {
  type: "token" | "tool_started" | "tool_completed" | "done";
  content?: string;
  tool_name?: string;
  widgets?: Record<string, unknown>[];
}

export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: SSEEvent) => void
): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const jsonStr = trimmed.slice(6);
      if (!jsonStr) continue;
      try {
        const event: SSEEvent = JSON.parse(jsonStr);
        onEvent(event);
      } catch {
        // skip malformed JSON
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim().startsWith("data: ")) {
    const jsonStr = buffer.trim().slice(6);
    if (jsonStr) {
      try {
        onEvent(JSON.parse(jsonStr));
      } catch {
        // skip
      }
    }
  }
}
