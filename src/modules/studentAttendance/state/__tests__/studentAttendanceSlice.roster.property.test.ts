/**
 * Property-based tests for the roster reducer in
 * `modules/studentAttendance/state/studentAttendanceSlice.ts` (task 11.3).
 *
 * Validates design Correctness Property 3 (Roster count invariant): after any
 * sequence of scan/manual/add operations, `present + pending === total`, all
 * counts are `>= 0`, and `total` equals the roster length.
 *
 * The real reducer is driven directly as the state model. Starting from an
 * initial roster (random students with unique roll numbers), a random sequence
 * of operations is applied — marking an existing student
 * present/absent/pending/unmarked via `updateRosterStudentStatus`, and adding a
 * fresh student with a unique roll number via `addRosterStudent`. After each
 * operation the summary is derived via `selectRosterSummary` and the invariant
 * is asserted. `selectRosterSummary` is memoized, so each derivation is fed a
 * fresh wrapper object to avoid stale cache reuse across steps.
 *
 * Validates: Requirements 9.2, 9.3
 * Property: 3
 */

import fc from 'fast-check';
import reducer, {
  setRoster,
  updateRosterStudentStatus,
  addRosterStudent,
  selectRosterSummary,
} from '../studentAttendanceSlice';
import type {
  RosterStudent,
  RosterAttendanceStatus,
  EnrollmentStatus,
} from '../../../../shared/types/attendance';

type SliceState = ReturnType<typeof reducer>;

const ROSTER_STATUSES: readonly RosterAttendanceStatus[] = [
  'present',
  'absent',
  'pending',
  'unmarked',
];

/** Derive the roster summary from a slice state via the real selector. */
const summaryOf = (state: SliceState) =>
  // Fresh wrapper each call so the memoized selector recomputes per step.
  selectRosterSummary({ studentAttendance: state });

/**
 * Build a RosterStudent from a numeric roll number. Non-roster fields are
 * filled with plausible values; they do not affect the count invariant.
 */
const makeStudent = (
  rollNumber: number,
  attendanceStatus: RosterAttendanceStatus,
  enrollmentStatus: EnrollmentStatus,
): RosterStudent => ({
  id: `stu-${rollNumber}`,
  name: `Student ${rollNumber}`,
  rollNo: String(rollNumber),
  enrollmentStatus,
  attendanceStatus,
  statusSource: null,
  faceMatchConfidence: null,
});

/**
 * Initial roster of students with unique roll numbers. Roll numbers are drawn
 * from a shuffled prefix of a range to guarantee uniqueness while still
 * exercising unsorted input into `setRoster`.
 */
const initialRosterArb: fc.Arbitrary<RosterStudent[]> = fc
  .record({
    size: fc.integer({ min: 0, max: 8 }),
    statuses: fc.array(fc.constantFrom(...ROSTER_STATUSES), {
      minLength: 8,
      maxLength: 8,
    }),
    enrollments: fc.array(
      fc.constantFrom<EnrollmentStatus>('enrolled', 'not_enrolled'),
      { minLength: 8, maxLength: 8 },
    ),
    rollOrder: fc.shuffledSubarray(
      Array.from({ length: 20 }, (_, i) => i + 1),
      { minLength: 8, maxLength: 8 },
    ),
  })
  .map(({ size, statuses, enrollments, rollOrder }) =>
    rollOrder
      .slice(0, size)
      .map((roll, i) => makeStudent(roll, statuses[i], enrollments[i])),
  );

/** Operation applied to the reducer between assertions. */
type Op =
  | { kind: 'mark'; index: number; status: RosterAttendanceStatus }
  | { kind: 'add'; status: RosterAttendanceStatus; enrollment: EnrollmentStatus };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant<'mark'>('mark'),
    // 0..1 fraction selecting an existing student (resolved against live length).
    index: fc.double({ min: 0, max: 0.999, noNaN: true }),
    status: fc.constantFrom(...ROSTER_STATUSES),
  }),
  fc.record({
    kind: fc.constant<'add'>('add'),
    status: fc.constantFrom(...ROSTER_STATUSES),
    enrollment: fc.constantFrom<EnrollmentStatus>('enrolled', 'not_enrolled'),
  }),
);

describe('studentAttendanceSlice roster — Property 3: roster count invariant', () => {
  it('maintains present + pending === total (counts >= 0, total === roster length) after every operation', () => {
    fc.assert(
      fc.property(
        initialRosterArb,
        fc.array(opArb, { minLength: 0, maxLength: 40 }),
        (initialRoster, ops) => {
          let state = reducer(undefined, setRoster(initialRoster));

          const assertInvariant = () => {
            const { present, pending, total } = summaryOf(state);
            expect(present).toBeGreaterThanOrEqual(0);
            expect(pending).toBeGreaterThanOrEqual(0);
            expect(total).toBeGreaterThanOrEqual(0);
            expect(present + pending).toBe(total);
            expect(total).toBe(state.roster.length);
          };

          // Invariant holds on the freshly loaded roster.
          assertInvariant();

          // Track used roll numbers so every add stays unique.
          const usedRolls = new Set(initialRoster.map(s => s.rollNo));
          let nextRoll = 1000;

          for (const op of ops) {
            if (op.kind === 'mark') {
              if (state.roster.length > 0) {
                const idx = Math.min(
                  state.roster.length - 1,
                  Math.floor(op.index * state.roster.length),
                );
                const target = state.roster[idx];
                state = reducer(
                  state,
                  updateRosterStudentStatus({
                    studentId: target.id,
                    status: op.status,
                    statusSource: op.status === 'present' ? 'manual' : null,
                  }),
                );
              }
            } else {
              // Ensure a fresh, unique roll number for the added student.
              while (usedRolls.has(String(nextRoll))) {
                nextRoll += 1;
              }
              usedRolls.add(String(nextRoll));
              state = reducer(
                state,
                addRosterStudent(
                  makeStudent(nextRoll, op.status, op.enrollment),
                ),
              );
              nextRoll += 1;
            }

            assertInvariant();
          }
        },
      ),
    );
  });
});
