import { supabase } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  }
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }
  return response;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'GET' });
  return response.json();
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function apiPatch<T>(path: string, body?: any): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'DELETE' });
  return response.json();
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    body: formData,
  });
  return response.json();
}

export interface SSEEvent {
  type: 'token' | 'tool_started' | 'tool_completed' | 'done';
  content?: string;
  tool_name?: string;
  widgets?: any[];
}

export async function apiStream(
  path: string,
  body: any,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  }
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No readable stream available');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last potentially incomplete line in the buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (!jsonStr) continue;
      try {
        const event: SSEEvent = JSON.parse(jsonStr);
        onEvent(event);
      } catch {
        // Skip malformed events
      }
    }
  }

  // Process any remaining data in the buffer
  if (buffer.trim().startsWith('data: ')) {
    const jsonStr = buffer.trim().slice(6);
    if (jsonStr) {
      try {
        const event: SSEEvent = JSON.parse(jsonStr);
        onEvent(event);
      } catch {
        // Skip
      }
    }
  }
}
