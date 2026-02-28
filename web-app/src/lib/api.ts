import { createClient } from "@/lib/supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "ngrok-skip-browser-warning": "true",
    ...(options.headers as Record<string, string>),
  };

  if (
    !(options.body instanceof FormData) &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  return response;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: "GET" });
  return response.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: "DELETE" });
  return response.json();
}

export async function apiPostForm<T>(
  path: string,
  formData: FormData
): Promise<T> {
  const response = await apiFetch(path, {
    method: "POST",
    body: formData,
  });
  return response.json();
}
