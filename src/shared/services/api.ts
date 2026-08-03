import { ApiResponse } from '../types';

// Expo only inlines env vars prefixed EXPO_PUBLIC_ into the client bundle
// (static `process.env.EXPO_PUBLIC_*` access is required for the bundler to
// substitute it — no babel/metro config needed on SDK 57+). Falls back to the
// documented localhost default so a missing .env doesn't silently point at
// nothing.
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:5000/api/v1';

/**
 * Upload timeout. Well above a normal request because enrollment runs one face
 * inference per captured pose on the server, on CPU.
 */
const MULTIPART_TIMEOUT_MS = 120_000;

/**
 * Unwraps the backend's `{ success, data }` envelope to the inner payload.
 *
 * Detects the envelope by KEY, not by `body.data ?? body`. That fallback looks
 * equivalent but breaks on a legitimate null payload — `{"success":true,"data":null}`
 * means "no record", and `??` would return the whole envelope instead: a truthy
 * object callers then read as a real result. It is why a cleared attendance
 * record still reported "already marked" on every launch, and it would affect
 * any endpoint whose answer can legitimately be null.
 */
function unwrapEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === 'object' && 'data' in (body as object)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T> & { status?: number }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      // `status` is reported so callers can distinguish a definite server answer
      // (a 404 meaning 'no such record') from a transport failure where nothing
      // is known. Without it every failure looks the same and callers cannot
      // tell 'not enrolled' from 'could not ask'.
      if (!response.ok) {
        return { success: false, error: data.message || 'Request failed', status: response.status };
      }

      return { success: true, data: unwrapEnvelope<T>(data), status: response.status };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T> & { status?: number }> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * POSTs multipart/form-data — used by the endpoints that take photo files
   * rather than JSON (`/faces/enroll`, `/staff-attendance/mark-with-face`),
   * where the server computes the embedding or the match from the image.
   *
   * Content-Type is deliberately NOT set: fetch derives it from the FormData and
   * appends the multipart boundary. Setting it by hand omits the boundary and
   * the server parses zero fields.
   *
   * `statusOf` is reported separately from `success` so callers can distinguish
   * "the server rejected this" from "the request never arrived" — queueing a
   * 4xx for offline retry would retry forever against a request the server will
   * always refuse.
   */
  async postForm<T>(
    endpoint: string,
    form: FormData
  ): Promise<ApiResponse<T> & { status?: number; detail?: string }> {
    return new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}${endpoint}`);

      // Content-Type is deliberately unset: the networking layer derives it from
      // the FormData and appends the multipart boundary. Setting it by hand
      // omits the boundary and the server parses zero fields.
      if (this.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      }

      // Generous, because enrollment runs one face inference PER captured pose
      // server-side. Timing out here is worse than waiting: the server still
      // completes and stores the result while the app reports failure.
      xhr.timeout = MULTIPART_TIMEOUT_MS;

      const fail = (detail: string) => {
        if (__DEV__) {
          console.warn(`[api] multipart POST ${endpoint} failed: ${detail}`);
        }
        // `error` stays exactly 'Network error': callers compare against that
        // string to decide whether a failure is worth queueing for offline
        // retry. The cause goes in `detail`, which is additive.
        resolve({ success: false, error: 'Network error', detail });
      };

      xhr.onload = () => {
        let body: unknown;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          return fail(`Malformed response (HTTP ${xhr.status})`);
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          const message = (body as { message?: string })?.message ?? 'Request failed';
          // A server rejection is NOT a transport failure. `status` being present
          // is how callers tell "the server refused this" from "it never
          // arrived", which decides whether a retry could ever succeed.
          return resolve({ success: false, error: message, status: xhr.status });
        }
        resolve({ success: true, data: unwrapEnvelope<T>(body), status: xhr.status });
      };

      xhr.onerror = () => fail('Upload failed (network unreachable)');
      xhr.ontimeout = () => fail(`Upload timed out after ${MULTIPART_TIMEOUT_MS}ms`);
      xhr.onabort = () => fail('Upload aborted');

      xhr.send(form);
    });
  }

  async patch<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async put<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiService = new ApiService();
