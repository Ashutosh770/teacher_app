/**
 * Staff face-step enrollment guard (Req 7.1).
 *
 * Teachers with no `FaceEnrollmentRecord` are hard-blocked from the staff face
 * verification step — including direct navigation attempts. The staff flow (task
 * 10) MUST call `ensureStaffEnrollment` / `useStaffEnrollmentGuard` at flow start
 * and before entering the face step; the guard is what decides whether the face
 * step may proceed. It does not rely on UI visibility alone: it drives the shared
 * `staffAttendance` slice into `needs_enrollment` and reports a decision the caller
 * uses to redirect to `FaceEnrollmentScreen`.
 *
 * The core `ensureStaffEnrollment` function is dependency-injected (teacherId,
 * dispatch, enrollment service, redirect callback) so it can be unit-tested
 * without React or native modules. `useStaffEnrollmentGuard` wires it to the real
 * store + shared service for screens/navigators to consume.
 *
 * Requirements: 7.1
 */
import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../../store';
import type { AppDispatch } from '../../../store';
import {
  faceEnrollmentService,
  type FaceEnrollmentService,
} from '../../../shared/services/faceEnrollment';
import { setFlowState, setHasEnrollmentRecord } from '../state/staffAttendanceSlice';

/**
 * Outcome of the staff enrollment guard.
 *
 * - `allowed: true`  — a record exists; the face verification step may proceed.
 * - `allowed: false` — the face step is blocked. `reason` distinguishes a missing
 *   enrollment record (redirect to enrollment) from a missing signed-in teacher
 *   (an auth precondition the caller should surface, never silently allow).
 */
export type StaffEnrollmentGuardDecision =
  | { allowed: true; hasRecord: true }
  | { allowed: false; hasRecord: false; reason: 'needs_enrollment' | 'no_teacher' };

export interface EnsureStaffEnrollmentDeps {
  /** The signed-in teacher's id (auth `state.auth.user?.id`). */
  teacherId: string | null | undefined;
  /** Store dispatch, used to drive the flow into `needs_enrollment`. */
  dispatch: AppDispatch;
  /** Enrollment service; defaults to the shared singleton. Injectable for tests. */
  service?: Pick<FaceEnrollmentService, 'hasEnrollment'>;
  /**
   * Called when enrollment is missing so the caller can redirect to
   * `FaceEnrollmentScreen` (Req 7.1). Invoked after the slice is driven into
   * `needs_enrollment`.
   */
  onNeedsEnrollment?: () => void;
}

/**
 * Determines whether the staff face verification step may proceed for a teacher
 * and enforces the block as a side effect.
 *
 * - No signed-in teacher → blocked (`no_teacher`); the flow is left untouched.
 * - No `FaceEnrollmentRecord` → mark `hasRecord=false`, drive the flow into
 *   `needs_enrollment`, invoke `onNeedsEnrollment`, and block (`needs_enrollment`).
 * - Record exists → mark `hasRecord=true` and allow.
 *
 * Never throws: this is a hard gate, so any failure to confirm enrollment is
 * treated as "not enrolled" and blocks the face step.
 */
export async function ensureStaffEnrollment({
  teacherId,
  dispatch,
  service = faceEnrollmentService,
  onNeedsEnrollment,
}: EnsureStaffEnrollmentDeps): Promise<StaffEnrollmentGuardDecision> {
  if (!teacherId) {
    return { allowed: false, hasRecord: false, reason: 'no_teacher' };
  }

  let hasRecord = false;
  try {
    hasRecord = await service.hasEnrollment('staff', teacherId);
  } catch {
    // Fail closed: if we cannot confirm a record exists, block the face step.
    hasRecord = false;
  }

  if (!hasRecord) {
    dispatch(setHasEnrollmentRecord(false));
    dispatch(setFlowState('needs_enrollment'));
    onNeedsEnrollment?.();
    return { allowed: false, hasRecord: false, reason: 'needs_enrollment' };
  }

  dispatch(setHasEnrollmentRecord(true));
  return { allowed: true, hasRecord: true };
}

/**
 * React hook binding `ensureStaffEnrollment` to the live store (signed-in teacher
 * id + dispatch) and the shared enrollment service. Screens and the staff flow
 * router (task 10) call the returned function at flow start / before the face
 * step, passing an `onNeedsEnrollment` navigation callback to redirect to
 * `FaceEnrollmentScreen`.
 *
 * @param onNeedsEnrollment redirect-to-enrollment callback (typically a
 *   `navigation.navigate('FaceEnrollment')`).
 */
export function useStaffEnrollmentGuard(
  onNeedsEnrollment?: () => void
): () => Promise<StaffEnrollmentGuardDecision> {
  const dispatch = useAppDispatch();
  const teacherId = useAppSelector((state) => state.auth.user?.id ?? null);

  return useCallback(
    () => ensureStaffEnrollment({ teacherId, dispatch, onNeedsEnrollment }),
    [teacherId, dispatch, onNeedsEnrollment]
  );
}
