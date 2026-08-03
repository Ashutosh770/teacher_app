/**
 * Envelope unwrapping.
 *
 * The backend answers `{ success, data }`. Unwrapping it with `body.data ?? body`
 * looks correct and is not: when `data` is legitimately null — "no attendance
 * record for today" — the fallback returns the whole envelope, a truthy object
 * that callers read as a real result.
 *
 * That produced a fake attendance record on every launch and reported "already
 * marked" for a user with nothing recorded, surviving rebuilds because it was
 * generated fresh each time rather than cached. Any endpoint whose answer can
 * legitimately be null is exposed to it, so it is pinned here rather than only
 * at the one call site where it was noticed.
 */
import { apiService } from '../api';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

/**
 * `postForm` uses XMLHttpRequest, not fetch.
 *
 * Not a style choice: Expo SDK 57 installs its WinterCG fetch as the global,
 * and that implementation rejects React Native's `{uri, name, type}` file part
 * with "Unsupported FormDataPart implementation" — its own source states `uri`
 * is unsupported. XHR goes through React Native's native networking, which
 * streams the file straight from its URI. Mocking it here keeps the test honest
 * about which transport is actually exercised.
 */
class MockXHR {
  static lastInstance: MockXHR | null = null;
  static nextResponse: { status: number; body: string } | { error: 'network' | 'timeout' } = {
    status: 200,
    body: '{}',
  };

  status = 0;
  responseText = '';
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  readonly headers: Record<string, string> = {};

  constructor() {
    MockXHR.lastInstance = this;
  }
  open(): void {}
  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value;
  }
  send(): void {
    const next = MockXHR.nextResponse;
    if ('error' in next) {
      if (next.error === 'timeout') this.ontimeout?.();
      else this.onerror?.();
      return;
    }
    this.status = next.status;
    this.responseText = next.body;
    this.onload?.();
  }
}
globalThis.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;

function respondXHR(body: unknown, status = 200) {
  MockXHR.nextResponse = { status, body: JSON.stringify(body) };
}

function respond(body: unknown, ok = true, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  apiService.setToken(null);
});

describe('backend envelope unwrapping', () => {
  it('returns null — not the envelope — when the payload is legitimately null', async () => {
    respond({ success: true, data: null });

    const response = await apiService.get<unknown>('/staff-attendance/today');

    expect(response.success).toBe(true);
    expect(response.data).toBeNull();
    // The regression: an envelope leaking through is truthy, so callers treat
    // "no record" as a record.
    expect(response.data).not.toEqual({ success: true, data: null });
  });

  it('unwraps a normal payload', async () => {
    respond({ success: true, data: { id: 'abc', status: 'present' } });

    const response = await apiService.get<{ id: string }>('/staff-attendance/today');

    expect(response.data).toEqual({ id: 'abc', status: 'present' });
  });

  it('preserves falsy-but-real payloads', async () => {
    respond({ success: true, data: 0 });
    expect((await apiService.get<number>('/x')).data).toBe(0);

    respond({ success: true, data: false });
    expect((await apiService.get<boolean>('/x')).data).toBe(false);

    respond({ success: true, data: [] });
    expect((await apiService.get<unknown[]>('/x')).data).toEqual([]);
  });

  it('passes through a response that is not enveloped', async () => {
    respond({ id: 'raw', status: 'present' });

    const response = await apiService.get<{ id: string }>('/x');

    expect(response.data).toEqual({ id: 'raw', status: 'present' });
  });

  it('applies the same unwrapping to multipart posts', async () => {
    respondXHR({ success: true, data: null }, 201);

    const response = await apiService.postForm<unknown>('/faces/enroll', new FormData());

    expect(response.success).toBe(true);
    expect(response.data).toBeNull();
    expect(response.status).toBe(201);
  });

  it('reports the status on a rejected multipart post so callers can tell a refusal from a dropped connection', async () => {
    respondXHR({ success: false, message: 'Face not recognized.' }, 422);

    const response = await apiService.postForm<unknown>('/staff-attendance/mark-with-face', new FormData());

    expect(response.success).toBe(false);
    expect(response.status).toBe(422);
    expect(response.error).toBe('Face not recognized.');
  });

  it('leaves status undefined on a transport failure, so a refusal is never mistaken for a dropped connection', async () => {
    // This distinction decides whether a failure gets queued for offline retry.
    // Queueing a server refusal would retry forever against something the
    // server will always reject.
    MockXHR.nextResponse = { error: 'network' };

    const response = await apiService.postForm<unknown>('/faces/verify', new FormData());

    expect(response.success).toBe(false);
    expect(response.error).toBe('Network error');
    expect(response.status).toBeUndefined();
    expect(response.detail).toContain('unreachable');
  });

  it('surfaces a timeout as a transport failure with the elapsed budget', async () => {
    MockXHR.nextResponse = { error: 'timeout' };

    const response = await apiService.postForm<unknown>('/faces/enroll', new FormData());

    expect(response.error).toBe('Network error');
    expect(response.status).toBeUndefined();
    expect(response.detail).toContain('timed out');
  });

  it('does NOT set Content-Type, so the multipart boundary is generated', async () => {
    // Setting it by hand omits the boundary and the server parses zero fields.
    respondXHR({ success: true, data: {} }, 200);
    apiService.setToken('tok');

    await apiService.postForm<unknown>('/faces/verify', new FormData());

    const headers = MockXHR.lastInstance!.headers;
    expect(headers['Authorization']).toBe('Bearer tok');
    expect(Object.keys(headers).map(k => k.toLowerCase())).not.toContain('content-type');
  });
});
