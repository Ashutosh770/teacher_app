/**
 * Property-based tests for the status-source precedence rule in
 * `modules/studentAttendance/state/studentAttendanceSlice.ts` (task 12.5).
 *
 * Validates design Correctness Property 10 (Status-source precedence):
 *  - A `face_match` change during the active session ALWAYS overrides any prior
 *    manual status; the result records status `face_match` regardless of the
 *    student's current status/source (Req 12.5).
 *  - A `manual` change against a student locked by a current-session face match
 *    (present + face_match) is REJECTED; the current status/source is preserved
 *    unchanged, and `canManuallyMark` is false for that student (Req 12.3).
 *  - A `manual` change against a non-locked student applies with source
 *    `manual` and clears face-match confidence to null (Req 12.4), and
 *    `canManuallyMark` is true for that student.
 *  - `isLockedByFaceMatch` is true IFF the student is `present` with source
 *    `face_match`.
 *
 * Targets the pure exported helpers directly (no store/camera/provider needed).
 *
 * Validates: Requirements 12.3, 12.5
 * Property: 10
 */

import fc from 'fast-check';
import {
  isLockedByFaceMatch,
  canManuallyMark,
  resolveStatusChange,
  type StatusChange,
} from '../studentAttendanceSlice';
import type {
  RosterStudent,
  RosterAttendanceStatus,
  StatusSource,
  EnrollmentStatus,
} from '../../../../shared/types/attendance';

const attendanceStatusArb = fc.constantFrom<RosterAttendanceStatus>(
  'present',
  'absent',
  'pending',
  'unmarked',
);

const statusSourceArb = fc.constantFrom<StatusSource | null>(
  'face_match',
  'manual',
  null,
);

const enrollmentStatusArb = fc.constantFrom<EnrollmentStatus>(
  'enrolled',
  'not_enrolled',
);

/** An arbitrary roster student across the full status/source/enrollment space. */
const rosterStudentArb: fc.Arbitrary<RosterStudent> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  name: fc.string({ minLength: 1, maxLength: 12 }),
  rollNo: fc.integer({ min: 1, max: 200 }).map(n => String(n)),
  enrollmentStatus: enrollmentStatusArb,
  attendanceStatus: attendanceStatusArb,
  statusSource: statusSourceArb,
  faceMatchConfidence: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), {
    nil: null,
  }),
});

/** A student guaranteed to be locked by a current-session face match. */
const lockedStudentArb: fc.Arbitrary<RosterStudent> = rosterStudentArb.map(
  s => ({
    ...s,
    attendanceStatus: 'present' as RosterAttendanceStatus,
    statusSource: 'face_match' as StatusSource,
  }),
);

/** A student guaranteed NOT to be locked (any state except present+face_match). */
const nonLockedStudentArb: fc.Arbitrary<RosterStudent> = rosterStudentArb.filter(
  s => !(s.attendanceStatus === 'present' && s.statusSource === 'face_match'),
);

const faceMatchChangeArb: fc.Arbitrary<StatusChange> = fc.record({
  status: attendanceStatusArb,
  source: fc.constant<'face_match'>('face_match'),
  faceMatchConfidence: fc.option(
    fc.double({ min: 0, max: 100, noNaN: true }),
    { nil: null },
  ),
});

const manualChangeArb: fc.Arbitrary<StatusChange> = fc.record({
  status: attendanceStatusArb,
  source: fc.constant<'manual'>('manual'),
  faceMatchConfidence: fc.option(
    fc.double({ min: 0, max: 100, noNaN: true }),
    { nil: null },
  ),
});

describe('isLockedByFaceMatch — Property 10: lock definition', () => {
  it('is true IFF the student is present with source face_match', () => {
    fc.assert(
      fc.property(rosterStudentArb, student => {
        const expected =
          student.attendanceStatus === 'present' &&
          student.statusSource === 'face_match';
        expect(isLockedByFaceMatch(student)).toBe(expected);
        // canManuallyMark is exactly the complement of isLockedByFaceMatch.
        expect(canManuallyMark(student)).toBe(!expected);
      }),
    );
  });
});

describe('resolveStatusChange — Property 10: status-source precedence', () => {
  it('a face_match change ALWAYS applies and records source face_match (Req 12.5)', () => {
    fc.assert(
      fc.property(rosterStudentArb, faceMatchChangeArb, (current, change) => {
        const result = resolveStatusChange(current, change);
        // Face wins during the session regardless of prior status/source,
        // including overriding a prior manual status.
        expect(result.attendanceStatus).toBe(change.status);
        expect(result.statusSource).toBe('face_match');
      }),
    );
  });

  it('a manual change against a LOCKED student is rejected and preserves state (Req 12.3)', () => {
    fc.assert(
      fc.property(lockedStudentArb, manualChangeArb, (locked, change) => {
        // A locked student cannot be manually marked.
        expect(canManuallyMark(locked)).toBe(false);

        const result = resolveStatusChange(locked, change);
        // Current status/source/confidence are preserved unchanged.
        expect(result.attendanceStatus).toBe(locked.attendanceStatus);
        expect(result.statusSource).toBe(locked.statusSource);
        expect(result.faceMatchConfidence).toBe(locked.faceMatchConfidence);
      }),
    );
  });

  it('a manual change against a NON-locked student applies as manual and clears confidence (Req 12.4)', () => {
    fc.assert(
      fc.property(nonLockedStudentArb, manualChangeArb, (nonLocked, change) => {
        // A non-locked student is eligible for manual marking.
        expect(canManuallyMark(nonLocked)).toBe(true);

        const result = resolveStatusChange(nonLocked, change);
        expect(result.attendanceStatus).toBe(change.status);
        expect(result.statusSource).toBe('manual');
        // Manual marking clears any face-match confidence.
        expect(result.faceMatchConfidence).toBeNull();
      }),
    );
  });
});
