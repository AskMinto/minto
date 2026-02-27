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

/**
 * Stream SSE events from a POST endpoint using XMLHttpRequest.
 * Uses XHR instead of fetch ReadableStream for React Native compatibility.
 */
export function apiStream(
  path: string,
  body: any,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    if (!API_BASE_URL) {
      reject(new Error('EXPO_PUBLIC_API_BASE_URL is not configured'));
      return;
    }

    const token = await getAccessToken();
    const url = `${API_BASE_URL}${path}`;
    let processedLength = 0;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    function parseSSEChunk(text: string) {
      const lines = text.split('\n');
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

    xhr.onprogress = () => {
      const newText = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;
      if (newText) {
        parseSSEChunk(newText);
      }
    };

    xhr.onload = () => {
      // Process any remaining data not caught by onprogress
      const remaining = xhr.responseText.slice(processedLength);
      if (remaining) {
        parseSSEChunk(remaining);
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(xhr.responseText || xhr.statusText));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during streaming'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Stream request timed out'));
    };

    xhr.timeout = 120000; // 2 minute timeout for long research queries
    xhr.send(JSON.stringify(body));
  });
}
