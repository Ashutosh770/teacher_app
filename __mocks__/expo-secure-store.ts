/**
 * Manual mock for `expo-secure-store`.
 *
 * Provides a deterministic in-memory implementation so tests that exercise the
 * `secureStorage` wrapper (shared/services/storage.ts) run without the native
 * keychain/keystore. Applied automatically because the file name matches the
 * `expo-secure-store` package.
 */
const store = new Map<string, string>();

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

/** Test-only helper to reset state between tests. */
export function __resetSecureStoreMock(): void {
  store.clear();
}
