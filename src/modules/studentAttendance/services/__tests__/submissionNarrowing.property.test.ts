/**
 * Property-based test for submission narrowing (design Correctness Property 6),
 * exercising the pure, exported {@link narrowRosterStatus} and
 * {@link buildSubmissionRecords} helpers over arbitrary rosters with no store
 * or network access.
 *
 * Property 6 — Submission narrowing:
 *   Every roster entry maps to EXACTLY ONE persisted status in
 *   `{present, absent, unmarked}` (Req 14.1):
 *   - `present`               → `present`
 *   - `absent`                → `absent`
 *   - `pending` / `unmarked`  → `unmarked`
 *   and `buildSubmissionRecords` emits exactly one record per roster entry with
 *   a narrowed status and a deterministic, per-student id.
 *
 * **Validates: Requirements 14.1**
 *
 * (The decline half of Property 6 — declining the unmarked prompt persists
 * nothing and mutates no status, Req 14.3 — is verified against the real store
 * in `submissionDecline.test.ts`.)
 *
 * `studentAttendanceService.ts` transitively imports the Redux store and the
 * shared device services (vision-camera, expo-location/linking, secure-store,
 * async-storage). Those native leaf modules are unavailable under Node, so they
 * are mocked here — before the module import chain — purely so the pure helpers
 * can be imported. No device or store behaviour is asserted.
 */

// --- Native / heavy leaf module mocks (must precede the import chain) --------
// The real store index imports `react-redux`; the pure helpers need no store,
// so a dummy store stands in — this keeps the import chain loadable under Node.
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
import type {
  RosterStudent,
  RosterAttendanceStatus,
} from '../../../../shared/types/attendance';
import {
  narrowRosterStatus,
  buildSubmissionRecords,
  submissionRecordId,
  countUnmarked,
  type PersistedAttendanceStatus,
} from '../studentAttendanceService';

/** The full domain of roster attendance statuses (Req 14.1). */
const ALL_STATUSES: readonly RosterAttendanceStatus[] = [
  'present',
  'absent',
  'pending',
  'unmarked',
];

/** The exact persisted status set every roster entry must narrow into. */
const PERSISTED: readonly PersistedAttendanceStatus[] = [
  'present',
  'absent',
  'unmarked',
];

const attendanceStatusArb: fc.Arbitrary<RosterAttendanceStatus> =
  fc.constantFrom(...ALL_STATUSES);

/**
 * Generate a roster of unique-id students with random attendance/enrollment
 * status. Ids are unique by construction (drawn from a unique integer set).
 */
const rosterArb: fc.Arbitrary<RosterStudent[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: 99999 }), {
    minLength: 0,
    maxLength: 20,
  })
  .chain(ids =>
    fc.tuple(
      ...ids.map(n =>
        fc.record({
          n: fc.constant(n),
          attendanceStatus: attendanceStatusArb,
          enrolled: fc.boolean(),
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
        enrollmentStatus: it.enrolled ? 'enrolled' : 'not_enrolled',
        attendanceStatus: it.attendanceStatus,
        statusSource: null,
        faceMatchConfidence: null,
      }),
    ),
  );

/** A plausible ISO date string (YYYY-MM-DD) for the submission context. */
const dateArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(
    ({ year, month, day }) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );

const classIdArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .map(s => `class-${s.replace(/[^a-zA-Z0-9]/g, '') || 'x'}`);

describe('narrowRosterStatus — Property 6: total narrowing to the persisted set', () => {
  it('maps every RosterAttendanceStatus to exactly one of {present, absent, unmarked}', () => {
    fc.assert(
      fc.property(attendanceStatusArb, status => {
        const persisted = narrowRosterStatus(status);

        // Result is always a member of the persisted set (exactly one value).
        expect(PERSISTED).toContain(persisted);

        // The mapping is exactly as specified (Req 14.1).
        if (status === 'present') {
          expect(persisted).toBe('present');
        } else if (status === 'absent') {
          expect(persisted).toBe('absent');
        } else {
          // pending / unmarked collapse to unmarked.
          expect(persisted).toBe('unmarked');
        }
      }),
    );
  });

  it('is deterministic — the same status always narrows to the same value', () => {
    fc.assert(
      fc.property(attendanceStatusArb, status => {
        expect(narrowRosterStatus(status)).toBe(narrowRosterStatus(status));
      }),
    );
  });
});

describe('buildSubmissionRecords — Property 6: one narrowed record per roster entry', () => {
  it('emits exactly one record per roster entry, each with a persisted status', () => {
    fc.assert(
      fc.property(rosterArb, classIdArb, dateArb, (roster, classId, date) => {
        const records = buildSubmissionRecords(roster, classId, date);

        // Exactly one record per roster entry (Req 14.1).
        expect(records).toHaveLength(roster.length);

        records.forEach((record, i) => {
          const student = roster[i];
          // Each record's status is a member of the persisted set.
          expect(PERSISTED).toContain(record.status);
          // ...and equals the narrowing of that student's roster status.
          expect(record.status).toBe(narrowRosterStatus(student.attendanceStatus));
          // The record carries the student's identity.
          expect(record.personId).toBe(student.id);
          expect(record.personName).toBe(student.name);
          expect(record.date).toBe(date);
        });
      }),
    );
  });

  it('assigns deterministic ids — same inputs yield identical ids, unique per student', () => {
    fc.assert(
      fc.property(rosterArb, classIdArb, dateArb, (roster, classId, date) => {
        const first = buildSubmissionRecords(roster, classId, date);
        const second = buildSubmissionRecords(roster, classId, date);

        // Deterministic: same inputs -> same ids (so re-submits update, Req 14.4).
        expect(first.map(r => r.id)).toEqual(second.map(r => r.id));

        first.forEach((record, i) => {
          expect(record.id).toBe(
            submissionRecordId(classId, roster[i].id, date),
          );
        });

        // Ids are unique per student (roster ids are unique by construction).
        const ids = first.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
      }),
    );
  });

  it('countUnmarked equals the number of records narrowing to unmarked', () => {
    fc.assert(
      fc.property(rosterArb, classIdArb, dateArb, (roster, classId, date) => {
        const records = buildSubmissionRecords(roster, classId, date);
        const unmarkedRecords = records.filter(r => r.status === 'unmarked').length;
        expect(countUnmarked(roster)).toBe(unmarkedRecords);
      }),
    );
  });
});
