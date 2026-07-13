/**
 * Decline half of design Correctness Property 6 (Submission narrowing):
 * declining the unmarked-confirmation prompt persists ZERO records and mutates
 * NO roster status (Req 14.3).
 *
 * Unlike the pure-helper property in `submissionNarrowing.property.test.ts`,
 * this behaviour spans the orchestration + real Redux store, so this file uses
 * the REAL store (it is NOT mocked here) and only mocks the network client
 * (`apiService`) plus the native leaf modules the service import chain pulls in.
 * Because a single module cannot both mock and use the real store, the two
 * halves of Property 6 live in separate files.
 *
 * **Validates: Requirements 14.1, 14.3**
 */

// --- Native / heavy leaf module mocks (must precede the import chain) --------
// NOTE: the store is intentionally NOT mocked — this test drives the real store.
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

// Mock the network client so we can assert NOTHING is persisted on decline.
jest.mock('../../../../shared/services/api', () => ({
  apiService: {
    get: jest.fn(async () => ({ success: true, data: [] })),
    post: jest.fn(async () => ({ success: true, data: {} })),
    put: jest.fn(async () => ({ success: true, data: {} })),
    delete: jest.fn(async () => ({ success: true, data: {} })),
    setToken: jest.fn(),
  },
}));

import fc from 'fast-check';
import { store } from '../../../../store';
import { apiService } from '../../../../shared/services/api';
import type { RosterStudent } from '../../../../shared/types/attendance';
import {
  setRoster,
  setSelectedClass,
  setSelectedDate,
  setSessionState,
} from '../../state/studentAttendanceSlice';
import { submitAttendance, cancelSubmit } from '../studentAttendanceService';

const mockedPost = apiService.post as jest.Mock;

/**
 * Generate a roster of unique-id students that contains AT LEAST ONE entry
 * narrowing to `unmarked` (a `pending` or `unmarked` attendance status), so
 * submission always blocks on the confirmation prompt.
 */
const rosterWithUnmarkedArb: fc.Arbitrary<RosterStudent[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: 99999 }), {
    minLength: 1,
    maxLength: 12,
  })
  .chain(ids =>
    fc.tuple(
      ...ids.map(n =>
        fc.record({
          n: fc.constant(n),
          attendanceStatus: fc.constantFrom(
            'present' as const,
            'absent' as const,
            'pending' as const,
            'unmarked' as const,
          ),
        }),
      ),
    ),
  )
  .map(items =>
    items.map(
      (it, i): RosterStudent => ({
        id: `s-${it.n}`,
        name: `Student ${i + 1}`,
        rollNo: String(i + 1),
        enrollmentStatus: 'enrolled',
        attendanceStatus: it.attendanceStatus,
        statusSource: null,
        faceMatchConfidence: null,
      }),
    ),
  )
  // Force at least one unmarked-narrowing entry.
  .map(roster => {
    if (roster.some(s => s.attendanceStatus === 'pending' || s.attendanceStatus === 'unmarked')) {
      return roster;
    }
    return roster.map((s, i) =>
      i === 0 ? { ...s, attendanceStatus: 'unmarked' as const } : s,
    );
  });

describe('cancelSubmit — Property 6 (decline): persists nothing, mutates no status', () => {
  beforeEach(() => {
    mockedPost.mockClear();
  });

  it('declining the unmarked prompt leaves the roster unchanged and posts nothing', async () => {
    await fc.assert(
      fc.asyncProperty(rosterWithUnmarkedArb, async roster => {
        mockedPost.mockClear();

        // Seed the store with the roster + submission context (Req 14.1).
        store.dispatch(setSelectedClass('class-under-test'));
        store.dispatch(setSelectedDate('2025-01-15'));
        store.dispatch(setRoster(roster));
        store.dispatch(setSessionState('roster_ready'));

        // Snapshot the roster exactly as persisted in the store.
        const before = JSON.parse(
          JSON.stringify(store.getState().studentAttendance.roster),
        );

        // Submitting blocks on the confirmation prompt because there is at
        // least one unmarked entry (Req 14.2). Nothing is persisted yet.
        const result = await submitAttendance();
        expect(result.status).toBe('confirm_needed');
        expect(store.getState().studentAttendance.sessionState).toBe(
          'confirm_unmarked',
        );
        expect(mockedPost).not.toHaveBeenCalled();

        // Decline the prompt (Req 14.3): persists nothing, mutates no status.
        cancelSubmit();

        // No records were ever posted.
        expect(mockedPost).not.toHaveBeenCalled();
        // The roster is byte-for-byte unchanged.
        expect(store.getState().studentAttendance.roster).toEqual(before);
        // The session returned to the review view.
        expect(store.getState().studentAttendance.sessionState).toBe(
          'roster_ready',
        );
      }),
    );
  });
});
