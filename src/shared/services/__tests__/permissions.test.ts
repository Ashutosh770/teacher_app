/**
 * Unit tests for the pure permission-state mapping helpers in
 * `shared/services/permissions.ts` (task 4.2).
 *
 * These cover:
 *   - `mapLocationStatus` — expo-location foreground response -> PermissionState
 *   - `mapCameraStatus`   — vision-camera status -> PermissionState
 *   - the retry-vs-settings decision those states drive (Req 1.3, 1.4, 4.4)
 *
 * `permissions.ts` imports the native modules `expo-location`, `expo-linking`,
 * and `react-native-vision-camera` at module load. Those native modules are not
 * available in the Node test environment, so they are mocked minimally here —
 * just enough for the module to import and for `Location.PermissionStatus` to
 * carry the string values the helper compares against.
 */

jest.mock('expo-location', () => ({
  // expo-location's PermissionStatus is a string enum; the helper only reads
  // UNDETERMINED, so we reproduce the real string values here.
  PermissionStatus: {
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
    DENIED: 'denied',
  },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  openSettings: jest.fn(),
}));

jest.mock('react-native-vision-camera', () => ({
  Camera: {
    getCameraPermissionStatus: jest.fn(),
    requestCameraPermission: jest.fn(),
  },
}));

import * as Location from 'expo-location';
import {
  mapLocationStatus,
  mapCameraStatus,
  type PermissionState,
} from '../permissions';

/**
 * The behavioral decision the mapped state drives in the UI:
 *   - 'denied'  -> retry allowed (OS dialog can be shown again)   Req 1.3 / 4.4
 *   - 'blocked' -> must open device settings                      Req 1.4 / 4.4
 *   - 'undetermined' / 'granted' -> no retry control shown        Req 1.3 / 4.4
 */
function decisionFor(state: PermissionState): {
  showRetry: boolean;
  showOpenSettings: boolean;
} {
  return {
    showRetry: state === 'denied',
    showOpenSettings: state === 'blocked',
  };
}

describe('mapLocationStatus', () => {
  it('maps a granted response to "granted"', () => {
    expect(
      mapLocationStatus({
        status: Location.PermissionStatus.GRANTED,
        granted: true,
        canAskAgain: true,
      }),
    ).toBe('granted');
  });

  it('maps UNDETERMINED (never requested) to "undetermined"', () => {
    expect(
      mapLocationStatus({
        status: Location.PermissionStatus.UNDETERMINED,
        granted: false,
        canAskAgain: true,
      }),
    ).toBe('undetermined');
  });

  it('maps a not-granted response that can ask again to "denied"', () => {
    expect(
      mapLocationStatus({
        status: Location.PermissionStatus.DENIED,
        granted: false,
        canAskAgain: true,
      }),
    ).toBe('denied');
  });

  it('maps a not-granted response that cannot ask again to "blocked"', () => {
    expect(
      mapLocationStatus({
        status: Location.PermissionStatus.DENIED,
        granted: false,
        canAskAgain: false,
      }),
    ).toBe('blocked');
  });

  it('prefers "granted" even if canAskAgain is false', () => {
    // A granted permission should never be treated as blocked.
    expect(
      mapLocationStatus({
        status: Location.PermissionStatus.GRANTED,
        granted: true,
        canAskAgain: false,
      }),
    ).toBe('granted');
  });
});

describe('mapCameraStatus', () => {
  it('maps "granted" to "granted"', () => {
    expect(mapCameraStatus('granted')).toBe('granted');
  });

  it('maps "not-determined" to "undetermined"', () => {
    expect(mapCameraStatus('not-determined')).toBe('undetermined');
  });

  it('maps "denied" to "blocked" (no in-app re-prompt possible)', () => {
    expect(mapCameraStatus('denied')).toBe('blocked');
  });

  it('maps "restricted" to "blocked" (parental controls / MDM)', () => {
    expect(mapCameraStatus('restricted')).toBe('blocked');
  });
});

describe('retry-vs-settings decision driven by permission state (Req 1.3, 1.4, 4.4)', () => {
  it('shows a retry control only when location permission is "denied"', () => {
    const state = mapLocationStatus({
      status: Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: true,
    });
    expect(decisionFor(state)).toEqual({ showRetry: true, showOpenSettings: false });
  });

  it('shows the open-settings control only when location permission is "blocked"', () => {
    const state = mapLocationStatus({
      status: Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
    });
    expect(decisionFor(state)).toEqual({ showRetry: false, showOpenSettings: true });
  });

  it('shows neither control when location permission is "undetermined"', () => {
    const state = mapLocationStatus({
      status: Location.PermissionStatus.UNDETERMINED,
      granted: false,
      canAskAgain: true,
    });
    expect(decisionFor(state)).toEqual({ showRetry: false, showOpenSettings: false });
  });

  it('shows neither control when location permission is "granted"', () => {
    const state = mapLocationStatus({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
    });
    expect(decisionFor(state)).toEqual({ showRetry: false, showOpenSettings: false });
  });

  it('routes a denied camera permission to open-settings (blocked), not retry', () => {
    // vision-camera reports 'denied' once the OS will no longer prompt, so the
    // UI must offer settings rather than a no-op retry.
    const state = mapCameraStatus('denied');
    expect(decisionFor(state)).toEqual({ showRetry: false, showOpenSettings: true });
  });

  it('shows neither control when camera permission is "not-determined" or "granted"', () => {
    expect(decisionFor(mapCameraStatus('not-determined'))).toEqual({
      showRetry: false,
      showOpenSettings: false,
    });
    expect(decisionFor(mapCameraStatus('granted'))).toEqual({
      showRetry: false,
      showOpenSettings: false,
    });
  });
});
