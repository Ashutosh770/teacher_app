import { apiService } from '../../../shared/services/api';
import { secureStorage } from '../../../shared/services/storage';
import type { ApiResponse, Session, User } from '../../../shared/types';

// expo-secure-store only permits alphanumeric characters plus ".", "-", and "_"
// in keys — a ":" throws "Invalid key provided to SecureStore" on every
// get/set/delete, which previously crashed session restore on boot.
const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';

/**
 * Every signed-in account gets both attendance modules by default — this
 * mirrors the previous mock accounts (`mockAuthService.ts`, now retired),
 * which granted the same `allowedModules` regardless of role. The backend's
 * `User` model has no per-user module ACL yet, so this stays a client-side
 * default rather than a real authorization source; `authorize()` /
 * `PermissionGate` still gate the sensitive actions server/client-side by role.
 */
const DEFAULT_ALLOWED_MODULES = ['staffAttendance', 'studentAttendance'];

interface BackendUser {
  id: number;
  username: string;
  email: string;
  name: string | null;
  role: string;
  roleCategory?: string;
  roleID?: string;
}

interface LoginResponseData {
  accessToken: string;
  refreshToken: string;
  user: BackendUser;
}

/**
 * KVS role codes -> app role. `KV` accounts are individual school users
 * (teachers); the office/regional/zonal/HQ/admin codes are treated as admins
 * (this only gates the Admin Dashboard tab client-side — the server still
 * enforces role on sensitive endpoints). Adjust this set if the product
 * requires a different split.
 */
const ADMIN_ROLE_CODES = ['AD', 'HQ', 'RO', 'ZT'];

function toUser(backendUser: BackendUser): User {
  return {
    id: String(backendUser.id),
    username: backendUser.username,
    email: backendUser.email,
    name: backendUser.name ?? backendUser.username,
    role: ADMIN_ROLE_CODES.includes(backendUser.role) ? 'admin' : 'teacher',
    allowedModules: DEFAULT_ALLOWED_MODULES,
  };
}

/** Decodes a JWT's `exp` claim (seconds since epoch) to milliseconds, without verifying the signature — verification already happened server-side; this is purely to know when to treat the session as stale client-side. */
function decodeJwtExpiryMs(token: string): number {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(decodeAtob(payload));
    return typeof json.exp === 'number' ? json.exp * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000;
  } catch {
    return Date.now() + 7 * 24 * 60 * 60 * 1000;
  }
}

/** `atob` isn't available in the RN JS engine by default; base64-decode manually. */
function decodeAtob(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of padded) {
    if (char === '=') break;
    buffer = (buffer << 6) | chars.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

async function persistTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    secureStorage.set(ACCESS_TOKEN_KEY, accessToken),
    secureStorage.set(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

/** Clears any persisted session tokens (logout / failed restore). */
export async function clearSession(): Promise<void> {
  apiService.setToken(null);
  await Promise.all([secureStorage.remove(ACCESS_TOKEN_KEY), secureStorage.remove(REFRESH_TOKEN_KEY)]);
}

export async function login(username: string, password: string): Promise<ApiResponse<Session>> {
  const response = await apiService.post<LoginResponseData>('/auth/login', { username, password });
  if (!response.success || !response.data) {
    return { success: false, error: response.error ?? 'Invalid username or password' };
  }

  const { accessToken, refreshToken, user } = response.data;
  apiService.setToken(accessToken);
  await persistTokens(accessToken, refreshToken);

  const session: Session = {
    token: accessToken,
    expiresAt: decodeJwtExpiryMs(accessToken),
    user: toUser(user),
  };
  return { success: true, data: session };
}

/**
 * Restores a session from a persisted access token on app boot (Req: session
 * restore). Returns `null` (not an error) when there is simply no persisted
 * token — that's the normal logged-out state, not a failure.
 */
export async function restoreSession(): Promise<ApiResponse<Session> | null> {
  const accessToken = await secureStorage.get(ACCESS_TOKEN_KEY);
  if (!accessToken) {
    return null;
  }

  apiService.setToken(accessToken);
  const response = await apiService.get<BackendUser>('/auth/me');
  if (!response.success || !response.data) {
    // Token expired/invalid — clear it so we don't keep retrying every boot.
    await clearSession();
    return { success: false, error: response.error ?? 'Session expired' };
  }

  const session: Session = {
    token: accessToken,
    expiresAt: decodeJwtExpiryMs(accessToken),
    user: toUser(response.data),
  };
  return { success: true, data: session };
}

export async function logout(): Promise<void> {
  try {
    await apiService.post('/auth/logout', {});
  } catch {
    // Logout is a client-side-effective no-op server-side; ignore network failures.
  }
  await clearSession();
}
