import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import { Camera, type CameraPermissionStatus } from 'react-native-vision-camera';

/**
 * Normalized permission state shared across the attendance flows.
 *
 * - `granted`      — permission is granted; the feature may proceed.
 * - `denied`       — denied but the OS dialog can be shown again (retry is possible).
 * - `blocked`      — permanently denied / restricted; the user must go to Settings.
 * - `undetermined` — never requested yet; the OS dialog has not been shown.
 *
 * The `denied` vs `blocked` distinction is what drives the "show retry" vs
 * "open settings" decision in Requirements 1.3/1.4 and 4.4.
 */
export type PermissionState = 'granted' | 'denied' | 'blocked' | 'undetermined';

export interface PermissionManager {
  /** Read the current permission state without prompting the user. */
  check(): Promise<PermissionState>;
  /** Prompt the user (if possible) and resolve with the resulting state. */
  request(): Promise<PermissionState>;
  /** Deep-link into the OS application settings screen. */
  openSettings(): Promise<void>;
}

/**
 * Pure mapping from an `expo-location` foreground-permission response to a
 * `PermissionState`. Kept pure and exported so task 4.2 can unit test it
 * without touching the native module.
 *
 * Mapping (Req 1.1–1.4):
 *   granted === true                          -> 'granted'
 *   status === 'undetermined'                 -> 'undetermined'
 *   not granted && canAskAgain === false      -> 'blocked'   (permanently denied)
 *   not granted && canAskAgain === true       -> 'denied'    (can prompt again)
 */
export function mapLocationStatus(response: {
  status: Location.PermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
}): PermissionState {
  if (response.granted) {
    return 'granted';
  }
  if (response.status === Location.PermissionStatus.UNDETERMINED) {
    return 'undetermined';
  }
  return response.canAskAgain ? 'denied' : 'blocked';
}

/**
 * Pure mapping from a `react-native-vision-camera` permission status to a
 * `PermissionState`. Exported so task 4.2 can unit test it directly.
 *
 * vision-camera v4 statuses are 'granted' | 'not-determined' | 'denied' | 'restricted'.
 * Unlike expo-location, vision-camera does NOT expose a `canAskAgain`-style flag:
 * once a request has been made, a subsequent denial is reported as 'denied' and the
 * OS will no longer show the prompt (calling `requestCameraPermission()` again returns
 * 'denied' immediately). We therefore map 'denied' to 'blocked' so the UI routes the
 * user to Settings rather than offering a retry that would silently no-op. 'restricted'
 * (parental controls / MDM) is likewise unrecoverable in-app, so it maps to 'blocked'.
 *
 * Mapping (Req 4.1–4.4):
 *   'granted'        -> 'granted'
 *   'not-determined' -> 'undetermined'
 *   'denied'         -> 'blocked'
 *   'restricted'     -> 'blocked'
 */
export function mapCameraStatus(status: CameraPermissionStatus): PermissionState {
  switch (status) {
    case 'granted':
      return 'granted';
    case 'not-determined':
      return 'undetermined';
    case 'denied':
    case 'restricted':
    default:
      return 'blocked';
  }
}

export const locationPermissionManager: PermissionManager = {
  async check(): Promise<PermissionState> {
    return mapLocationStatus(await Location.getForegroundPermissionsAsync());
  },

  async request(): Promise<PermissionState> {
    return mapLocationStatus(await Location.requestForegroundPermissionsAsync());
  },

  async openSettings(): Promise<void> {
    await Linking.openSettings();
  },
};

export const cameraPermissionManager: PermissionManager = {
  async check(): Promise<PermissionState> {
    return mapCameraStatus(Camera.getCameraPermissionStatus());
  },

  async request(): Promise<PermissionState> {
    // `requestCameraPermission()` resolves with only 'granted' | 'denied'. Re-read the
    // full status afterwards so a fresh denial can be distinguished from 'restricted'
    // and mapped consistently through `mapCameraStatus`.
    await Camera.requestCameraPermission();
    return mapCameraStatus(Camera.getCameraPermissionStatus());
  },

  async openSettings(): Promise<void> {
    await Linking.openSettings();
  },
};
