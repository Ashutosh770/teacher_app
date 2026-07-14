import { store } from '../../../store';
import { apiService } from '../../../shared/services/api';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import { queueForSync } from '../../offlineSync';
import type { AttendanceRecord } from '../../../shared/types';
import type {
  RosterStudent,
  RosterAttendanceStatus,
} from '../../../shared/types/attendance';
import { faceCaptureService, type CapturedFrame } from '../../../shared/services/faceCapture';
import {
  faceMatchProvider,
  type FaceMatchResult,
  type RosterCandidate,
} from '../../../shared/services/faceMatch';
import { cameraPermissionManager } from '../../../shared/services/permissions';
import { faceEnrollmentService } from '../../../shared/services/faceEnrollment';
import {
  setRoster,
  addRosterStudent,
  setSessionState,
  setError,
  setCameraPermission,
  setProviderMode,
  updateRosterStudentStatus,
  setConsecutiveTimeouts,
  resetConsecutiveTimeouts,
  setLastMatch,
  addUnresolvedDetection,
  compareRollNo,
  canManuallyMark,
  resolveStatusChange,
  setSubmitting,
} from '../state/studentAttendanceSlice';

/**
 * Roster load + mid-session onboarding logic for the batch face-scan flow
 * (Req 9.1, 9.4, 13.1, 13.2, 13.3).
 *
 * Following the module convention (see `offlineSync/services/syncService.ts`),
 * async work lives here and dispatches plain slice actions rather than using
 * thunks. Validation and orchestration live in the service; the ordered insert
 * is delegated to the `addRosterStudent` reducer so it stays pure/testable.
 */

// Validation bounds for mid-session onboarding (Req 13.1).
const NAME_MIN = 1;
const NAME_MAX = 100;
const ROLL_MIN = 1;
const ROLL_MAX = 20;

export interface AddStudentInput {
  name: string;
  rollNo: string;
}

export type AddStudentResult =
  | { ok: true; student: RosterStudent }
  | { ok: false; error: string };

/**
 * Sort a roster copy by ascending roll number without mutating the input.
 */
function sortRoster(roster: RosterStudent[]): RosterStudent[] {
  return [...roster].sort((a, b) => compareRollNo(a.rollNo, b.rollNo));
}

/**
 * Generate a stable, collision-resistant id for a locally-added student.
 * Mirrors the id shape used by `offlineSync`'s `queueForSync`.
 */
function generateStudentId(rollNo: string): string {
  return `student-${rollNo}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Load the roster for a class and drive the roster lifecycle (Req 9.1, 9.4).
 *
 * Transitions `loading_roster` → `roster_ready` on success (dispatching the
 * roster sorted by ascending roll number), or → `roster_error` on failure. On
 * failure no partial/stale roster is written: the existing roster in state is
 * left untouched and an error message is set for the UI to surface + retry.
 */
export async function loadRoster(classId: string): Promise<void> {
  store.dispatch(setSessionState('loading_roster'));
  store.dispatch(setError(null));

  const response = await apiService.get<RosterStudent[]>(
    `/student-attendance/roster/${encodeURIComponent(classId)}`,
  );

  if (response.success && response.data) {
    // Sort by ascending roll number before it reaches the store (Req 9.1).
    store.dispatch(setRoster(sortRoster(response.data)));
    store.dispatch(setSessionState('roster_ready'));
    return;
  }

  // Failure: keep any prior roster untouched (no partial/stale write) and
  // surface the error so the UI can offer a retry (Req 9.4).
  store.dispatch(setError(response.error ?? 'Failed to load roster'));
  store.dispatch(setSessionState('roster_error'));
}

/**
 * Add a student to the roster mid-session (Req 13.1, 13.2, 13.3).
 *
 * Validates the name (1–100 chars, non-empty when trimmed), the roll number
 * (1–20 chars, non-empty when trimmed), and roll-number uniqueness against the
 * current roster. On any validation failure the roster is left unmodified, a
 * specific error is set, and a failure result is returned. On success a new
 * `pending` / `not_enrolled` entry is inserted in roll-number order without
 * ending the scan session.
 */
export function addStudent(input: AddStudentInput): AddStudentResult {
  const name = input.name.trim();
  const rollNo = input.rollNo.trim();

  // --- Name validation (Req 13.1, 13.3) ---
  if (name.length < NAME_MIN) {
    return fail('Name is required');
  }
  if (name.length > NAME_MAX) {
    return fail(`Name must be ${NAME_MAX} characters or fewer`);
  }

  // --- Roll number validation (Req 13.1, 13.3) ---
  if (rollNo.length < ROLL_MIN) {
    return fail('Roll number is required');
  }
  if (rollNo.length > ROLL_MAX) {
    return fail(`Roll number must be ${ROLL_MAX} characters or fewer`);
  }

  // --- Uniqueness (Req 13.3) ---
  const roster = store.getState().studentAttendance.roster;
  const duplicate = roster.some(s => s.rollNo === rollNo);
  if (duplicate) {
    return fail(`Roll number "${rollNo}" already exists`);
  }

  // Valid: insert a pending / not-enrolled entry in roll-number order without
  // ending the session (Req 13.1, 13.2).
  const student: RosterStudent = {
    id: generateStudentId(rollNo),
    name,
    rollNo,
    enrollmentStatus: 'not_enrolled',
    attendanceStatus: 'pending',
    statusSource: null,
    faceMatchConfidence: null,
  };

  store.dispatch(addRosterStudent(student));
  store.dispatch(setError(null));
  return { ok: true, student };
}

/**
 * Set a validation error (leaving the roster unmodified) and return a failure
 * result carrying the same message.
 */
function fail(error: string): AddStudentResult {
  store.dispatch(setError(error));
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Manual override & status-source precedence (Req 12.1–12.5)
// ---------------------------------------------------------------------------
//
// The manual marking controls (task 14.2) call into `markManually`, which
// enforces the status-source precedence rules via the pure helpers
// `canManuallyMark` / `resolveStatusChange` in the slice. A student matched by
// the Face_Match_Provider this session (`present` + source `face_match`) is
// locked: manual marking is rejected while the match is in effect (Req 12.3).
// A later face match still overrides a prior manual status because the scan
// path (`applyMatchDecision`) always dispatches with source `face_match`
// (Req 12.5).

export type ManualMarkResult =
  | { ok: true; student: RosterStudent }
  | { ok: false; reason: 'not_found' | 'locked' };

/**
 * Manually mark a roster student `present` or `absent` (Req 12.1, 12.2, 12.4).
 *
 * Rejected as `locked` when the student was matched by face this session
 * (Req 12.3); otherwise the status is applied with `statusSource = 'manual'`
 * and any prior face-match confidence is cleared. The precedence decision is
 * delegated to the pure `resolveStatusChange` helper so it stays testable.
 */
export function markManually(
  studentId: string,
  status: 'present' | 'absent',
): ManualMarkResult {
  const student = store
    .getState()
    .studentAttendance.roster.find(s => s.id === studentId);
  if (!student) {
    return { ok: false, reason: 'not_found' };
  }

  // Locked by a current-session face match: no-op / reject (Req 12.3).
  if (!canManuallyMark(student)) {
    return { ok: false, reason: 'locked' };
  }

  const resolved = resolveStatusChange(student, { status, source: 'manual' });
  store.dispatch(
    updateRosterStudentStatus({
      studentId: student.id,
      status: resolved.attendanceStatus,
      statusSource: resolved.statusSource,
      faceMatchConfidence: resolved.faceMatchConfidence,
    }),
  );

  const updated = store
    .getState()
    .studentAttendance.roster.find(s => s.id === studentId)!;
  return { ok: true, student: updated };
}

// ---------------------------------------------------------------------------
// Batch face-scan session (Req 10.2–10.5, 10.7, 10.8, 11.1–11.4, 17.3, 17.4)
// ---------------------------------------------------------------------------
//
// While `scanning`, the service pulls frames from the FaceCaptureService at
// >= scanFramesPerSecond and races each `matchRoster` call against
// `matchTimeoutMs`. Match-result classification is factored into the pure
// `classifyMatchResult` helper so it stays testable; the loop itself only owns
// timing, cancellation, and dispatching plain slice actions (following the
// module service-dispatches-into-slice pattern).

/** A per-frame match decision derived purely from a provider result + roster. */
export type MatchDecision =
  | { kind: 'present'; studentId: string; confidence: number }
  | { kind: 'already_present'; studentId: string }
  | { kind: 'no_match'; confidence: number };

/**
 * Sentinel resolved by the match/timeout race when the provider does not
 * respond within `matchTimeoutMs` (Req 10.8/17.3).
 */
const MATCH_TIMEOUT = Symbol('match_timeout');

// Cancellable frame-loop handle + re-entrancy guard so a slow tick (capture +
// match) never overlaps the next scheduled tick.
let scanLoopHandle: ReturnType<typeof setInterval> | null = null;
let scanTickInFlight = false;

/**
 * Classify a provider result against the current roster (Req 10.3, 11.2–11.4).
 *
 * - matched, at/above `threshold`, and not yet present → `present`.
 * - matched but the student is already present this session → `already_present`
 *   (no counter change, Req 11.4).
 * - no personId, below threshold, or unknown id → `no_match` (Req 11.3).
 *
 * Pure and exported so the scan-counter and status-source properties can be
 * exercised without the camera or provider.
 */
export function classifyMatchResult(
  result: FaceMatchResult,
  roster: RosterStudent[],
  threshold: number,
): MatchDecision {
  const { personId, confidence } = result;
  if (personId !== null && confidence >= threshold) {
    const student = roster.find(s => s.id === personId);
    if (student) {
      return student.attendanceStatus === 'present'
        ? { kind: 'already_present', studentId: student.id }
        : { kind: 'present', studentId: student.id, confidence };
    }
  }
  return { kind: 'no_match', confidence };
}

/** Generate a stable id for an unresolved (low-confidence) detection. */
function generateDetectionId(): string {
  return `detection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Build the 1:N match candidates for a frame: roster students that are
 * face-enrolled AND not already marked present this session (Req 10.2), each
 * paired with their cached FaceEnrollmentRecord. Students whose enrollment
 * record cannot be resolved are skipped rather than blocking the scan.
 */
async function buildCandidates(roster: RosterStudent[]): Promise<RosterCandidate[]> {
  const eligible = roster.filter(
    s => s.enrollmentStatus === 'enrolled' && s.attendanceStatus !== 'present',
  );
  const candidates: RosterCandidate[] = [];
  for (const student of eligible) {
    const enrollment = await faceEnrollmentService.getEnrollmentRecord(
      'student',
      student.id,
    );
    if (enrollment) {
      candidates.push({ personId: student.id, enrollment });
    }
  }
  return candidates;
}

/**
 * Race a single `matchRoster` call against the provider timeout. Resolves with
 * the provider result, or `MATCH_TIMEOUT` when `matchTimeoutMs` elapses first
 * (Req 10.8/17.3). Never rejects for the timeout path so the caller can discard
 * the frame silently.
 */
async function matchWithTimeout(
  frame: CapturedFrame,
  candidates: RosterCandidate[],
  timeoutMs: number,
): Promise<FaceMatchResult | typeof MATCH_TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof MATCH_TIMEOUT>(resolve => {
    timer = setTimeout(() => resolve(MATCH_TIMEOUT), timeoutMs);
  });
  try {
    return await Promise.race([
      faceMatchProvider.matchRoster(frame, candidates),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Apply a classified match decision to the store (Req 10.3, 10.4, 11.2–11.4).
 * Marks present + emits match feedback, emits already-present feedback with no
 * counter change, or records a capped unresolved detection + no-match feedback.
 */
function applyMatchDecision(decision: MatchDecision, roster: RosterStudent[]): void {
  switch (decision.kind) {
    case 'present': {
      const student = roster.find(s => s.id === decision.studentId);
      if (!student) {
        return;
      }
      // Mark present via face match, replacing any prior manual status (Req
      // 10.3, 12.5). The reducer recomputes the present count so the counter
      // updates within the 1s budget (Req 11.1).
      store.dispatch(
        updateRosterStudentStatus({
          studentId: student.id,
          status: 'present',
          statusSource: 'face_match',
          faceMatchConfidence: decision.confidence,
        }),
      );
      store.dispatch(
        setLastMatch({
          studentId: student.id,
          name: student.name,
          rollNo: student.rollNo,
          kind: 'match',
          timestamp: Date.now(),
        }),
      );
      return;
    }
    case 'already_present': {
      // Duplicate match: feedback only, no counter change (Req 11.4).
      const student = roster.find(s => s.id === decision.studentId);
      if (!student) {
        return;
      }
      store.dispatch(
        setLastMatch({
          studentId: student.id,
          name: student.name,
          rollNo: student.rollNo,
          kind: 'already_present',
          timestamp: Date.now(),
        }),
      );
      return;
    }
    case 'no_match': {
      // Below threshold / unknown: record for manual resolution (FIFO cap 50,
      // Req 10.4) and surface no-match feedback (Req 11.3).
      store.dispatch(
        addUnresolvedDetection({
          id: generateDetectionId(),
          confidence: decision.confidence,
          timestamp: Date.now(),
        }),
      );
      store.dispatch(
        setLastMatch({
          studentId: '',
          name: '',
          rollNo: '',
          kind: 'no_match',
          timestamp: Date.now(),
        }),
      );
      return;
    }
  }
}

/**
 * Handle a provider timeout: increment the consecutive-timeout counter and, at
 * `consecutiveTimeoutLimit`, pause the session with an error notification while
 * preserving all recorded roster statuses (Req 10.8/17.4). Individual timeouts
 * are otherwise silent (Req 17.3).
 */
function handleTimeout(): void {
  const current = store.getState().studentAttendance.scan.consecutiveTimeouts;
  const next = current + 1;
  store.dispatch(setConsecutiveTimeouts(next));
  if (next >= attendanceConfig.face.consecutiveTimeoutLimit) {
    stopFrameLoop();
    faceCaptureService.stopPreview();
    store.dispatch(
      setError('The face-match service is not responding. The scan was paused.'),
    );
    store.dispatch(setSessionState('scan_paused'));
  }
}

/** Whether the session is still actively scanning (guards async ticks). */
function isScanning(): boolean {
  return store.getState().studentAttendance.sessionState === 'scanning';
}

/**
 * Run a single scan tick: capture a frame, build candidates, race the match,
 * then either handle the timeout or apply the decision. Re-entrant ticks are
 * skipped, and the session state is re-checked after every await so a tick that
 * finishes after the session stops never mutates the roster.
 */
async function runScanTick(): Promise<void> {
  if (scanTickInFlight || !isScanning()) {
    return;
  }
  scanTickInFlight = true;
  try {
    let frame: CapturedFrame;
    try {
      frame = await faceCaptureService.captureFrame();
    } catch {
      // A failed/timed-out capture is not a provider timeout; skip this frame
      // silently and let the next tick try again.
      return;
    }
    if (!isScanning()) {
      return;
    }

    const roster = store.getState().studentAttendance.roster;
    const candidates = await buildCandidates(roster);
    if (!isScanning() || candidates.length === 0) {
      return;
    }

    const result = await matchWithTimeout(
      frame,
      candidates,
      attendanceConfig.face.matchTimeoutMs,
    );
    if (!isScanning()) {
      return;
    }

    if (result === MATCH_TIMEOUT) {
      handleTimeout();
      return;
    }

    // A successful result resets the consecutive-timeout counter (Req 10.8).
    store.dispatch(resetConsecutiveTimeouts());
    const decision = classifyMatchResult(
      result,
      store.getState().studentAttendance.roster,
      attendanceConfig.face.studentThreshold,
    );
    applyMatchDecision(decision, store.getState().studentAttendance.roster);
  } finally {
    scanTickInFlight = false;
  }
}

/**
 * Start the cancellable frame loop at >= `scanFramesPerSecond` (Req 10.2). Any
 * previous loop is cleared first so starts are idempotent.
 */
function startFrameLoop(): void {
  stopFrameLoop();
  const fps = Math.max(1, attendanceConfig.face.scanFramesPerSecond);
  const periodMs = Math.floor(1000 / fps);
  scanLoopHandle = setInterval(() => {
    void runScanTick();
  }, periodMs);
}

/** Stop the frame loop and clear the re-entrancy guard. Safe to call twice. */
function stopFrameLoop(): void {
  if (scanLoopHandle !== null) {
    clearInterval(scanLoopHandle);
    scanLoopHandle = null;
  }
  scanTickInFlight = false;
}

/**
 * Start a batch face-scan session (Req 10.1, 10.7).
 *
 * Ensures camera permission (checking, then requesting only if needed) and
 * records it in state. If it is not granted the session never starts:
 * `scan_blocked` is set with an error offering a route to settings (Req 10.7).
 * Otherwise the provider mode is published (for the mock-mode banner, Req 10.6),
 * the preview is activated (falling back to `scan_blocked` on a camera-init
 * failure, Req 10.1), the session moves to `scanning`, and the frame loop starts.
 */
export async function startScanSession(): Promise<void> {
  store.dispatch(setError(null));

  let permission = await cameraPermissionManager.check();
  if (permission !== 'granted') {
    permission = await cameraPermissionManager.request();
  }
  store.dispatch(setCameraPermission(permission));

  if (permission !== 'granted') {
    store.dispatch(
      setError('Camera access is required to scan attendance. Enable it in settings.'),
    );
    store.dispatch(setSessionState('scan_blocked'));
    return;
  }

  store.dispatch(setProviderMode(faceMatchProvider.mode));
  store.dispatch(resetConsecutiveTimeouts());

  try {
    await faceCaptureService.startPreview();
  } catch {
    store.dispatch(setError('The camera could not be started. Please try again.'));
    store.dispatch(setSessionState('scan_blocked'));
    return;
  }

  store.dispatch(setSessionState('scanning'));
  startFrameLoop();
}

/**
 * End the scan session (Req 10.5): stop the loop, deactivate capture, and
 * return to the roster review view. Recorded statuses and unresolved detections
 * are preserved in state for review/submission.
 */
export function stopScanSession(): void {
  stopFrameLoop();
  faceCaptureService.stopPreview();
  store.dispatch(setSessionState('roster_ready'));
}

/**
 * Pause the scan session (Req 17.4): stop the loop and deactivate capture while
 * preserving all recorded roster statuses. Used by the resume/end controls.
 */
export function pauseScanSession(): void {
  stopFrameLoop();
  faceCaptureService.stopPreview();
  store.dispatch(setSessionState('scan_paused'));
}

/**
 * Resume a paused scan session (Req 17.4): clear the error + consecutive-timeout
 * counter, re-activate the preview (falling back to `scan_blocked` on failure),
 * return to `scanning`, and restart the frame loop.
 */
export async function resumeScanSession(): Promise<void> {
  store.dispatch(setError(null));
  store.dispatch(resetConsecutiveTimeouts());

  try {
    await faceCaptureService.startPreview();
  } catch {
    store.dispatch(setError('The camera could not be started. Please try again.'));
    store.dispatch(setSessionState('scan_blocked'));
    return;
  }

  store.dispatch(setSessionState('scanning'));
  startFrameLoop();
}

// ---------------------------------------------------------------------------
// Attendance submission (Req 14.1–14.5, 17.5)
// ---------------------------------------------------------------------------
//
// Submission narrows each roster entry to the persisted status set
// (`present | absent | unmarked`, Req 14.1), optionally blocks on an
// unmarked-confirmation prompt reporting the count (Req 14.2/14.3), then
// persists the whole batch — updating existing same-day/class records rather
// than duplicating (Req 14.4) and routing through the Offline_Sync_Queue on a
// network failure (Req 14.5). Non-network failures preserve the roster and
// surface a descriptive error for retry (Req 17.5).
//
// The narrowing/record-building/counting helpers are kept PURE and exported so
// the submission-narrowing property test (task 13.2) can exercise them without
// the store or network.

/** The subset of `AttendanceRecord['status']` used for persisted student rows. */
export type PersistedAttendanceStatus = 'present' | 'absent' | 'unmarked';

/**
 * Narrow a roster attendance status to exactly one persisted status
 * (Req 14.1).
 *
 * - `present` → `present`
 * - `absent`  → `absent`
 * - `pending` / `unmarked` → `unmarked`
 *
 * Total over `RosterAttendanceStatus`: every roster entry maps to EXACTLY ONE
 * value in `{present, absent, unmarked}`. Pure and exported for Property 6.
 */
export function narrowRosterStatus(
  status: RosterAttendanceStatus,
): PersistedAttendanceStatus {
  switch (status) {
    case 'present':
      return 'present';
    case 'absent':
      return 'absent';
    case 'pending':
    case 'unmarked':
      return 'unmarked';
  }
}

/**
 * Deterministic Attendance_Record id for a student on a given class+date. The
 * same student+class+date always yields the same id so a re-submission updates
 * the existing record rather than creating a duplicate (Req 14.4).
 */
export function submissionRecordId(
  classId: string,
  studentId: string,
  date: string,
): string {
  return `att-${classId}-${studentId}-${date}`;
}

/**
 * Build the persisted Attendance_Record batch for a roster (Req 14.1, 14.4).
 *
 * Maps each `RosterStudent` to exactly one `AttendanceRecord` carrying the
 * narrowed status and a deterministic id, so the result has the same length as
 * the roster and re-submitting the same class+date updates in place. Pure and
 * exported for Property 6.
 */
export function buildSubmissionRecords(
  roster: RosterStudent[],
  classId: string,
  date: string,
): AttendanceRecord[] {
  return roster.map(student => ({
    id: submissionRecordId(classId, student.id, date),
    date,
    personId: student.id,
    personName: student.name,
    status: narrowRosterStatus(student.attendanceStatus),
  }));
}

/**
 * Count how many roster entries narrow to `unmarked` (Req 14.2). Pure and
 * exported so the UI can size the confirmation prompt and the property test can
 * assert against it.
 */
export function countUnmarked(roster: RosterStudent[]): number {
  return roster.filter(s => narrowRosterStatus(s.attendanceStatus) === 'unmarked')
    .length;
}

/** Outcome of a submission attempt / confirmation decision. */
export type SubmitResult =
  | { status: 'confirm_needed'; unmarkedCount: number }
  | { status: 'done'; records: AttendanceRecord[] }
  | { status: 'pending_sync'; records: AttendanceRecord[] }
  | { status: 'submit_error'; error: string }
  | { status: 'no_roster' };

/**
 * Persist the current roster as an Attendance_Record batch (Req 14.1, 14.4,
 * 14.5, 17.5).
 *
 * Moves to `submitting`, builds the records (deterministic ids so existing
 * same-day/class records update in place, Req 14.4), and POSTs the batch. On
 * success → `done`. On a network failure the batch is queued via the
 * Offline_Sync_Queue and the session moves to `pending_sync` (Req 14.5). Any
 * other (non-network) failure moves to `submit_error` with a descriptive
 * message while leaving the roster untouched for retry (Req 17.5).
 *
 * Not exported: callers reach persistence through {@link submitAttendance}
 * (direct path when nothing is unmarked) or {@link confirmSubmit} (after the
 * unmarked prompt is approved).
 */
async function persistSubmission(): Promise<SubmitResult> {
  const state = store.getState().studentAttendance;
  const roster = state.roster;
  const classId = state.selectedClassId;
  const date = state.selectedDate;

  if (!classId) {
    // No class selected: nothing to persist. Preserve roster/state.
    store.dispatch(setError('No class selected for submission.'));
    store.dispatch(setSessionState('submit_error'));
    return { status: 'submit_error', error: 'No class selected for submission.' };
  }

  store.dispatch(setError(null));
  store.dispatch(setSubmitting(true));
  store.dispatch(setSessionState('submitting'));

  const records = buildSubmissionRecords(roster, classId, date);
  const payload = { classId, date, records };

  const response = await apiService.post('/student-attendance/submit', payload);

  if (response.success) {
    store.dispatch(setSubmitting(false));
    store.dispatch(setSessionState('done'));
    return { status: 'done', records };
  }

  // The apiService normalizes a thrown fetch (no connectivity) to the
  // 'Network error' message; treat that as offline and queue for later sync
  // (Req 14.5). Every other failure is a non-network persist error (Req 17.5).
  const isNetworkError = response.error === 'Network error';
  store.dispatch(setSubmitting(false));

  if (isNetworkError) {
    queueForSync('studentAttendance', 'submitAttendance', payload);
    store.dispatch(setSessionState('pending_sync'));
    return { status: 'pending_sync', records };
  }

  const error = response.error ?? 'Failed to submit attendance';
  store.dispatch(setError(error));
  store.dispatch(setSessionState('submit_error'));
  return { status: 'submit_error', error };
}

/**
 * Submit the class attendance (Req 14.1, 14.2, 14.4, 14.5).
 *
 * If any roster entry narrows to `unmarked`, persistence is BLOCKED: the
 * session moves to `confirm_unmarked` and the unmarked count is returned so the
 * UI can prompt the teacher (Req 14.2). Nothing is persisted and no status is
 * mutated until the teacher approves via {@link confirmSubmit}. When there are
 * no unmarked entries the batch is persisted immediately.
 */
export async function submitAttendance(): Promise<SubmitResult> {
  const roster = store.getState().studentAttendance.roster;
  if (roster.length === 0) {
    return { status: 'no_roster' };
  }

  const unmarkedCount = countUnmarked(roster);
  if (unmarkedCount > 0) {
    // Block persistence and prompt for confirmation (Req 14.2). No records are
    // built or persisted, and no roster status is mutated.
    store.dispatch(setSessionState('confirm_unmarked'));
    return { status: 'confirm_needed', unmarkedCount };
  }

  return persistSubmission();
}

/**
 * Approve the unmarked-confirmation prompt and persist the batch (Req 14.2).
 * Called after the teacher explicitly confirms; performs the actual
 * persistence, including the offline/error routing of {@link persistSubmission}.
 */
export async function confirmSubmit(): Promise<SubmitResult> {
  return persistSubmission();
}

/**
 * Decline the unmarked-confirmation prompt (Req 14.3). Cancels the submission:
 * persists NOTHING, mutates no roster status, clears any transient error, and
 * returns the session to the roster review view.
 */
export function cancelSubmit(): void {
  store.dispatch(setError(null));
  store.dispatch(setSessionState('roster_ready'));
}
