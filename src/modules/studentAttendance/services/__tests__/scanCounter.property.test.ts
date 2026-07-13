/**
 * Property-based test for scan-counter monotonicity & bound
 * (design Correctness Property 4), exercising the pure, exported
 * {@link classifyMatchResult} helper together with the studentAttendance slice
 * reducer over arbitrary simulated face-match sequences with no device access.
 *
 * Property 4 — Scan counter monotonicity & bound:
 *   Within a single session the present count is
 *   - non-decreasing across every step;
 *   - never greater than the number of face-enrolled students (in the real
 *     flow only enrolled students are match candidates, so a provider result
 *     only ever names an enrolled id — the model mirrors that);
 *   - unchanged when an already-present student is re-matched (Req 11.4).
 *
 * **Validates: Requirements 10.3, 11.4**
 *
 * `studentAttendanceService.ts` transitively imports the Redux store and the
 * shared device services (vision-camera, expo-location/linking, secure-store,
 * async-storage). Those native leaf modules are unavailable under Node, so they
 * are mocked here — before the module import chain — purely so the pure
 * `classifyMatchResult` helper can be imported. No device behaviour is asserted.
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
import type { RosterStudent } from '../../../../shared/types/attendance';
import type { FaceMatchResult } from '../../../../shared/services/faceMatch/types';
import reducer, {
  setRoster,
  updateRosterStudentStatus,
  selectRosterSummary,
} from '../../state/studentAttendanceSlice';
import { classifyMatchResult } from '../studentAttendanceService';

const THRESHOLD = attendanceConfig.face.studentThreshold; // 75 (Req 10.3)

/** Slice state type as produced by the reducer. */
type SliceState = ReturnType<typeof reducer>;

/** Wrap slice state so `selectRosterSummary` (a root selector) can read it. */
const present = (state: SliceState): number =>
  selectRosterSummary({ studentAttendance: state }).present;

/** Number of face-enrolled students in a roster. */
const enrolledCount = (roster: RosterStudent[]): number =>
  roster.filter(s => s.enrollmentStatus === 'enrolled').length;

/**
 * Generate a roster of unique-id students, a mix of face-enrolled and
 * not-enrolled, all starting `pending`. Ids are unique by construction.
 */
const rosterArb: fc.Arbitrary<RosterStudent[]> = fc
  .uniqueArray(fc.record({ n: fc.integer({ min: 0, max: 9999 }), enrolled: fc.boolean() }), {
    selector: r => r.n,
    minLength: 1,
    maxLength: 12,
  })
  .map(items =>
    items.map(
      (it, i): RosterStudent => ({
        id: `s-${it.n}`,
        name: `Student ${i + 1}`,
        rollNo: String(i + 1),
        enrollmentStatus: it.enrolled ? 'enrolled' : 'not_enrolled',
        attendanceStatus: 'pending',
        statusSource: null,
        faceMatchConfidence: null,
      }),
    ),
  );

/**
 * A roster paired with a sequence of simulated provider results. `personId` is
 * drawn from the roster's face-enrolled ids (or `null`), mirroring the real
 * flow where only enrolled students are 1:N candidates; `confidence` straddles
 * the threshold so both match and below-threshold no-match paths are exercised.
 */
const sessionArb = rosterArb.chain(roster => {
  const enrolledIds = roster
    .filter(s => s.enrollmentStatus === 'enrolled')
    .map(s => s.id);
  const personIdArb: fc.Arbitrary<string | null> =
    enrolledIds.length > 0
      ? fc.oneof(fc.constant<string | null>(null), fc.constantFrom(...enrolledIds))
      : fc.constant<string | null>(null);
  const resultArb: fc.Arbitrary<FaceMatchResult> = fc.record({
    personId: personIdArb,
    confidence: fc.integer({ min: 60, max: 90 }),
  });
  return fc.tuple(fc.constant(roster), fc.array(resultArb, { maxLength: 60 }));
});

describe('classifyMatchResult + slice — Property 4: scan counter monotonicity & bound', () => {
  it('keeps present count non-decreasing and bounded by the enrolled count across a session', () => {
    fc.assert(
      fc.property(sessionArb, ([roster, results]) => {
        const enrolled = enrolledCount(roster);
        let state = reducer(undefined, setRoster(roster));

        // Freshly loaded roster: nobody present yet.
        expect(present(state)).toBe(0);

        for (const result of results) {
          const prev = present(state);
          const decision = classifyMatchResult(result, state.roster, THRESHOLD);

          if (decision.kind === 'present') {
            state = reducer(
              state,
              updateRosterStudentStatus({
                studentId: decision.studentId,
                status: 'present',
                statusSource: 'face_match',
                faceMatchConfidence: decision.confidence,
              }),
            );
          }
          // 'already_present' and 'no_match' apply no status change (Req 11.4).

          const now = present(state);
          // Monotonic: never decreases within the session.
          expect(now).toBeGreaterThanOrEqual(prev);
          // A single step marks at most one student present.
          expect(now).toBeLessThanOrEqual(prev + 1);
          // Bounded by the number of face-enrolled students.
          expect(now).toBeLessThanOrEqual(enrolled);
          // slice-maintained counter agrees with the derived summary.
          expect(state.scan.presentCount).toBe(now);
        }
      }),
    );
  });

  it('classifies a re-match of an already-present student as already_present and leaves counts unchanged (Req 11.4)', () => {
    fc.assert(
      fc.property(
        rosterArb.filter(r => r.some(s => s.enrollmentStatus === 'enrolled')),
        fc.integer({ min: THRESHOLD, max: 100 }),
        (roster, confidence) => {
          const target = roster.find(s => s.enrollmentStatus === 'enrolled')!;

          // Mark the target present via a first face match.
          let state = reducer(undefined, setRoster(roster));
          const first = classifyMatchResult(
            { personId: target.id, confidence },
            state.roster,
            THRESHOLD,
          );
          expect(first.kind).toBe('present');
          state = reducer(
            state,
            updateRosterStudentStatus({
              studentId: target.id,
              status: 'present',
              statusSource: 'face_match',
              faceMatchConfidence: confidence,
            }),
          );
          const countAfterFirst = present(state);

          // Re-matching the same student must be classified as already_present
          // and applying the (no-op) decision leaves the counts unchanged.
          const second = classifyMatchResult(
            { personId: target.id, confidence },
            state.roster,
            THRESHOLD,
          );
          expect(second.kind).toBe('already_present');
          // No status-changing dispatch happens for already_present.
          expect(present(state)).toBe(countAfterFirst);
          expect(state.scan.presentCount).toBe(countAfterFirst);
        },
      ),
    );
  });
});
