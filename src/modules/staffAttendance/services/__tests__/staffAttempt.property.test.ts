/**
 * Property-based test for staff face attempt-count discipline
 * (design Correctness Property 8), exercising the pure, exported
 * {@link nextAttemptState} helper over arbitrary outcome sequences with no
 * device access.
 *
 * Property 8 — Attempt-count discipline for staff face:
 *   - a provider timeout (`service_error`) NEVER increments the attempt count;
 *   - a below-threshold match (`attempt_failed`) increments by exactly 1;
 *   - reaching the max then retrying RESTARTS the count at 1;
 *   - the count always stays within [0, max].
 *
 * **Validates: Requirements 5.5, 5.6, 5.9, 17.2**
 *
 * `staffAttendanceService.ts` transitively imports the Redux store and the
 * shared device services (vision-camera, expo-location/linking, secure-store,
 * async-storage). Those native leaf modules are unavailable under Node, so they
 * are mocked here — before the module import chain — purely so the pure helper
 * can be imported. No device behaviour is asserted.
 */

// --- Native / heavy leaf module mocks (must precede the import chain) --------
// The real store index imports `react-redux` (shipped as ESM and not
// transformed under this jest config). The pure helper needs no store, so a
// dummy store stands in — this keeps the import chain loadable under Node.
jest.mock('../../../../store', () => ({
  store: {
    dispatch: () => undefined,
    getState: () => ({}),
    subscribe: () => () => undefined,
  },
}));
jest.mock('react-native-vision-camera', () => ({
  Camera: {
    getAvailableCameraDevices: () => [],
    getCameraPermissionStatus: () => 'granted',
    requestCameraPermission: async () => 'granted',
  },
}));
jest.mock('expo-location', () => ({
  PermissionStatus: { UNDETERMINED: 'undetermined' },
  getForegroundPermissionsAsync: async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
  }),
  requestForegroundPermissionsAsync: async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
  }),
  getCurrentPositionAsync: async () => ({
    coords: { latitude: 0, longitude: 0, accuracy: 5 },
  }),
}));
jest.mock('expo-linking', () => ({ openSettings: async () => undefined }));
jest.mock('expo-secure-store', () => ({
  setItemAsync: async () => undefined,
  getItemAsync: async () => null,
  deleteItemAsync: async () => undefined,
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      setItem: async (k: string, v: string) => {
        store[k] = v;
      },
      getItem: async (k: string) => store[k] ?? null,
      removeItem: async (k: string) => {
        delete store[k];
      },
      clear: async () => {
        store = {};
      },
      getAllKeys: async () => Object.keys(store),
    },
  };
});

import fc from 'fast-check';
import { attendanceConfig } from '../../../../shared/config/attendanceConfig';
import {
  nextAttemptState,
  type StaffFaceOutcome,
} from '../staffAttendanceService';

/** The three ways a single face capture+match attempt can resolve. */
const outcome = (): fc.Arbitrary<StaffFaceOutcome> =>
  fc.constantFrom<StaffFaceOutcome>('service_error', 'attempt_failed', 'verified');

describe('nextAttemptState — Property 8: staff attempt-count discipline', () => {
  it('folds arbitrary outcome sequences while honouring attempt-count discipline', () => {
    fc.assert(
      fc.property(
        fc.array(outcome(), { maxLength: 40 }),
        fc.integer({ min: 1, max: 6 }),
        (outcomes, max) => {
          let attempts = 0;

          for (const step of outcomes) {
            const prev = attempts;
            const next = nextAttemptState({ attempts: prev }, step, max);

            if (step === 'service_error') {
              // Provider timeout/unavailable never counts (Req 5.9/17.2).
              expect(next.attempts).toBe(prev);
              expect(next.flowState).toBe('service_error');
            } else if (step === 'verified') {
              // A successful match ends the step without touching the counter.
              expect(next.attempts).toBe(prev);
              expect(next.flowState).toBe('confirm');
            } else {
              // attempt_failed: restart at 1 once the cap was reached (Req 5.6),
              // otherwise increment by exactly 1 (Req 5.5).
              if (prev >= max) {
                expect(next.attempts).toBe(1);
              } else {
                expect(next.attempts).toBe(prev + 1);
              }
              expect(next.flowState).toBe(
                next.attempts >= max ? 'face_failed' : 'attempt_failed',
              );
            }

            // The counter always stays within [0, max].
            expect(next.attempts).toBeGreaterThanOrEqual(0);
            expect(next.attempts).toBeLessThanOrEqual(max);

            attempts = next.attempts;
          }
        },
      ),
    );
  });

  it('defaults maxAttempts to the configured staff cap and never increments on timeout', () => {
    fc.assert(
      fc.property(fc.array(outcome(), { maxLength: 40 }), (outcomes) => {
        const max = attendanceConfig.face.maxStaffAttempts;
        let attempts = 0;

        for (const step of outcomes) {
          const prev = attempts;
          // Exercise the default-parameter path (no explicit maxAttempts).
          const next = nextAttemptState({ attempts: prev }, step);

          if (step === 'service_error') {
            expect(next.attempts).toBe(prev);
          }
          expect(next.attempts).toBeGreaterThanOrEqual(0);
          expect(next.attempts).toBeLessThanOrEqual(max);

          attempts = next.attempts;
        }
      }),
    );
  });
});
