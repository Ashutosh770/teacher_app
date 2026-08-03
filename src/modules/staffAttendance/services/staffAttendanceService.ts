/**
 * Staff attendance orchestration state machine (design.md → "Staff Attendance
 * Flow"). This service owns the transitions of the flow; the slice reducers only
 * apply them. It follows the `offlineSync/syncService` pattern: a plain module
 * service that dispatches slice actions into the Redux store rather than a
 * `createAsyncThunk`.
 *
 * Flow: enrollment check → location permission → GPS acquisition → geo-fence
 * evaluate → camera permission → face capture → face match → confirm/submit.
 *
 * Two properties are load-bearing and deliberately isolated:
 *
 *  1. The location/geo-fence result is captured in slice state (`gps.reading` /
 *     `gps.result`) during the location phase and is NEVER re-acquired during
 *     face retries, so a face failure can never force the user to redo GPS
 *     (Req 5.5/5.6/17.5).
 *  2. Face attempt-count discipline is expressed as the pure, exported
 *     {@link nextAttemptState} helper so it can be property-tested (task 9.3 /
 *     design Property 8) without any device access.
 *
 * Device access (GPS, permissions, camera, face-match provider) is injected via
 * {@link StaffAttendanceServiceDeps} and defaults to the shared singletons, so
 * the state machine can be unit-tested with fakes.
 *
 * Requirements: 1.6, 2.5, 3.3, 5.5, 5.6, 5.9, 6.3, 6.4, 6.5, 17.1, 17.2, 17.5
 */
import { store, type RootState, type AppDispatch } from '../../../store';
import {
  setFlowState,
  setGpsReading,
  setGeoFenceResult,
  incrementAccuracyRetries,
  resetAccuracyRetries,
  setLocationPermission,
  setCameraPermission,
  incrementFaceAttempts,
  resetFaceAttempts,
  setLastConfidence,
  setTodayRecord,
  setHasEnrollmentRecord,
  setSubmitting,
  setError,
  type StaffFlowState,
} from '../state/staffAttendanceSlice';
import {
  geoFenceService,
  TimeoutError,
  type GeoFenceService,
} from '../../../shared/services/geoFence';
import {
  locationPermissionManager,
  cameraPermissionManager,
  type PermissionManager,
} from '../../../shared/services/permissions';
import {
  faceCaptureService,
  CaptureTimeoutError,
  CameraInitError,
  type FaceCaptureService,
  type CapturedFrame,
} from '../../../shared/services/faceCapture';
import {
  faceMatchProvider,
  type FaceMatchProvider,
  type FaceMatchResult,
} from '../../../shared/services/faceMatch';
import {
  faceEnrollmentService,
  type FaceEnrollmentService,
} from '../../../shared/services/faceEnrollment';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import { apiService } from '../../../shared/services/api';
import { appStorage } from '../../../shared/services/storage';
import { queueForSync } from '../../offlineSync';
import type { SchoolLocation, StaffAttendanceRecord } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Pure attempt-count discipline (design Property 8 / task 9.3)
// ---------------------------------------------------------------------------

/**
 * The three ways a single face capture+match attempt can resolve, as seen by
 * the attempt-count state machine:
 *
 * - `service_error`  — provider timeout / unavailable (Req 5.9/17.2). Does NOT
 *                      count as an attempt; the user retries without penalty.
 * - `attempt_failed` — below-threshold match OR capture-window expiry
 *                      (Req 5.5/5.8). Counts as exactly one attempt.
 * - `verified`       — score >= staff threshold (Req 5.4). Ends the face step.
 */
export type StaffFaceOutcome = 'service_error' | 'attempt_failed' | 'verified';

/** Result of folding an outcome onto the current attempt count. */
export interface StaffFaceAttemptState {
  /** Attempt count AFTER applying the outcome. */
  attempts: number;
  /** Flow state the machine transitions to. */
  flowState: StaffFlowState;
}

/**
 * Pure transition for the staff face attempt counter. This is the single source
 * of truth for attempt-count discipline (Req 5.5/5.6/5.9/17.2) and is exported
 * so the property test (task 9.3 / design Property 8) can exercise it over
 * arbitrary outcome sequences with no device access.
 *
 * Rules, given the current attempt count and `maxAttempts` (default
 * `attendanceConfig.face.maxStaffAttempts`):
 *
 *  - `service_error` → attempts unchanged, transition to `service_error`
 *    (retry re-captures WITHOUT incrementing — Req 5.9/17.2).
 *  - `verified`      → attempts unchanged, transition to `confirm` (Req 5.4).
 *  - `attempt_failed`:
 *      - if the count has already reached the cap (i.e. the previous state was
 *        `face_failed`), the counter RESTARTS at 1 (Req 5.6);
 *      - otherwise it increments by exactly 1 (Req 5.5);
 *      - reaching the cap transitions to `face_failed`, below the cap to
 *        `attempt_failed`.
 *
 * @param current      Object carrying the attempt count before this outcome.
 * @param outcome      How the attempt resolved.
 * @param maxAttempts  Attempt cap; defaults to the configured staff cap.
 */
export function nextAttemptState(
  current: { attempts: number },
  outcome: StaffFaceOutcome,
  maxAttempts: number = attendanceConfig.face.maxStaffAttempts,
): StaffFaceAttemptState {
  const max = Math.max(1, Math.trunc(maxAttempts));
  const attempts = Math.max(0, Math.trunc(current.attempts));

  if (outcome === 'service_error') {
    // Provider timeout/unavailable is not the user's fault; never counts.
    return { attempts, flowState: 'service_error' };
  }

  if (outcome === 'verified') {
    return { attempts, flowState: 'confirm' };
  }

  // attempt_failed: a fresh count starts once the cap has been reached.
  const base = attempts >= max ? 0 : attempts;
  const nextCount = base + 1;
  const flowState: StaffFlowState = nextCount >= max ? 'face_failed' : 'attempt_failed';
  return { attempts: nextCount, flowState };
}

// ---------------------------------------------------------------------------
// Service dependencies (injectable for testing; default to shared singletons)
// ---------------------------------------------------------------------------

/** Storage key for the cached school geo-fence location. */
export const SCHOOL_LOCATION_STORAGE_KEY = 'attendance:schoolLocation';

/**
 * Collaborators the state machine depends on. Defaults wire the real store and
 * shared device services; tests can substitute fakes to drive every branch
 * deterministically.
 */
export interface StaffAttendanceServiceDeps {
  dispatch: AppDispatch;
  getState: () => RootState;
  geoFence: GeoFenceService;
  locationPermission: PermissionManager;
  cameraPermission: PermissionManager;
  capture: FaceCaptureService;
  matchProvider: FaceMatchProvider;
  enrollment: Pick<FaceEnrollmentService, 'getEnrollmentRecord' | 'hasEnrollment'>;
  api: Pick<typeof apiService, 'get' | 'post' | 'postForm'>;
  queue: typeof queueForSync;
  config: typeof attendanceConfig;
  /** Wall-clock source (ms since epoch); injectable for deterministic tests. */
  now: () => number;
  /** Loads the school geo-fence location (backend + local cache). */
  loadSchoolLocation: () => Promise<SchoolLocation | null>;
}

/** Discriminated outcome returned by {@link StaffAttendanceService.submit}. */
export type StaffSubmitResult =
  | { outcome: 'success'; record: StaffAttendanceRecord }
  | { outcome: 'already_marked'; record: StaffAttendanceRecord }
  | { outcome: 'pending_sync'; record: StaffAttendanceRecord }
  | { outcome: 'persist_error'; message: string }
  | { outcome: 'no_user'; message: string };

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * Narrows an unknown payload to a real attendance record.
 *
 * Guards against anything truthy-but-wrong being read as "already marked" —
 * an API envelope, an error body, a partially-parsed response. A phantom
 * record is uniquely nasty here: it blocks the user from marking attendance,
 * and no amount of clearing data server-side removes it, because the server
 * was never the source.
 */
function isAttendanceRecord(value: unknown): value is StaffAttendanceRecord {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<StaffAttendanceRecord>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.personId === 'string'
  );
}

export class StaffAttendanceService {
  private readonly deps: StaffAttendanceServiceDeps;

  /**
   * True once the current flow has fallen back to manual marking. Determines
   * whether {@link submit} builds a geo-unverified record. Reset by {@link begin}.
   */
  private manualFallback = false;

  /**
   * The frame the server verified at the face step, held so submit can send it
   * to `mark-with-face` — which re-verifies and records atomically, so the
   * attendance row can never exist without a server-checked face behind it.
   */
  private lastVerifiedFrame: CapturedFrame | null = null;

  /**
   * Wall-clock time (ms) the current GPS acquisition phase began, spanning all
   * retries. Used to offer manual fallback once the overall timeout is exceeded
   * (Req 1.6). Reset on entry to the location phase.
   */
  private gpsPhaseStartedAt: number | null = null;

  constructor(deps: StaffAttendanceServiceDeps) {
    this.deps = deps;
  }

  // -- Phase 0: enrollment gate + today's record ---------------------------

  /**
   * Entry point. Resets per-flow state, enforces the enrollment guard
   * (Req 7.1), then either surfaces an existing record for today (Req 6.3) or
   * advances into the location phase.
   */
  async begin(): Promise<void> {
    this.manualFallback = false;
    this.gpsPhaseStartedAt = null;

    const user = this.deps.getState().auth.user;
    if (!user) {
      this.fail('You must be signed in to mark attendance.');
      return;
    }

    this.deps.dispatch(setError(null));
    this.deps.dispatch(setFlowState('check_enrollment'));

    const enrolled = await this.deps.enrollment.hasEnrollment('staff', user.id);
    this.deps.dispatch(setHasEnrollmentRecord(enrolled));
    if (!enrolled) {
      // Hard block: the face step requires an enrollment record (Req 7.1).
      this.deps.dispatch(setFlowState('needs_enrollment'));
      return;
    }

    // Duplicate-day guard: if a record already exists for today, show it
    // instead of starting a new flow (Req 6.3).
    const existing = await this.loadTodayRecord();
    if (existing) {
      this.deps.dispatch(setTodayRecord(existing));
      this.deps.dispatch(setFlowState('already_marked'));
      return;
    }

    await this.requestLocation();
  }

  // -- Phase 1: location permission + GPS + geo-fence ----------------------

  /**
   * Requests location permission (checking first, only prompting when needed)
   * and, when granted, begins GPS acquisition. Denied/blocked → `location_denied`
   * (Req 1.2–1.4).
   */
  async requestLocation(): Promise<void> {
    this.deps.dispatch(setFlowState('location_permission'));

    let permission = await this.deps.locationPermission.check();
    if (permission !== 'granted') {
      permission = await this.deps.locationPermission.request();
    }
    this.deps.dispatch(setLocationPermission(permission));

    if (permission !== 'granted') {
      this.deps.dispatch(setFlowState('location_denied'));
      return;
    }

    this.gpsPhaseStartedAt = this.deps.now();
    this.deps.dispatch(resetAccuracyRetries());
    await this.acquireAndEvaluate();
  }

  /**
   * Re-acquires GPS after a recoverable failure WITHOUT re-requesting
   * permission (Req 17.1). The overall acquisition clock keeps running so the
   * manual-fallback affordance can appear once {@link canFallBackFromGps} is
   * true (Req 1.6).
   */
  async retryLocation(): Promise<void> {
    if (this.gpsPhaseStartedAt === null) {
      this.gpsPhaseStartedAt = this.deps.now();
    }
    await this.acquireAndEvaluate();
  }

  /**
   * Whether the overall GPS acquisition timeout has elapsed, so the UI may
   * offer manual fallback instead of another retry (Req 1.6). Meaningful while
   * in `gps_error` / `unreliable` / `out_of_fence` / `mock_detected`.
   */
  canFallBackFromGps(): boolean {
    if (this.gpsPhaseStartedAt === null) return false;
    return this.deps.now() - this.gpsPhaseStartedAt >= this.deps.config.geoFence.overallTimeoutMs;
  }

  private async acquireAndEvaluate(): Promise<void> {
    this.deps.dispatch(setFlowState('acquiring_gps'));
    this.deps.dispatch(setError(null));

    let reading;
    try {
      reading = await this.deps.geoFence.getReading(this.deps.config.geoFence.readingTimeoutMs);
    } catch (error) {
      // Timeout or any hardware error is a recoverable GPS error (Req 1.6/2.3).
      const message =
        error instanceof TimeoutError
          ? 'Could not get a GPS fix in time. Move to an open area and retry.'
          : 'Location hardware error. Please retry.';
      this.deps.dispatch(setError(message));
      this.deps.dispatch(setFlowState('gps_error'));
      return;
    }

    const school = await this.deps.loadSchoolLocation();
    if (!school) {
      this.deps.dispatch(setError('School location is unavailable. Please retry when online.'));
      this.deps.dispatch(setFlowState('gps_error'));
      return;
    }

    this.deps.dispatch(setGpsReading(reading));
    const result = this.deps.geoFence.evaluate(reading, school);
    this.deps.dispatch(setGeoFenceResult(result));
    this.applyGeoFenceResult(result.status);
  }

  /**
   * Maps a geo-fence status to the next flow state, applying the accuracy-retry
   * budget (Req 3.3) and the mock/out-of-fence branches (Req 2.5/2.6).
   */
  private applyGeoFenceResult(status: SchoolFenceStatus): void {
    switch (status) {
      case 'verified':
        this.deps.dispatch(resetAccuracyRetries());
        this.deps.dispatch(setFlowState('location_verified'));
        return;
      case 'unreliable_accuracy': {
        this.deps.dispatch(incrementAccuracyRetries());
        const retries = this.deps.getState().staffAttendance.gps.accuracyRetries;
        if (retries >= this.deps.config.geoFence.maxAccuracyRetries) {
          // Exhausted accuracy retries → manual fallback (Req 3.3).
          this.deps.dispatch(setFlowState('manual_fallback'));
          this.manualFallback = true;
        } else {
          this.deps.dispatch(setFlowState('unreliable'));
        }
        return;
      }
      case 'mock_detected':
        this.deps.dispatch(setFlowState('mock_detected'));
        return;
      case 'out_of_fence':
      default:
        this.deps.dispatch(setFlowState('out_of_fence'));
        return;
    }
  }

  // -- Phase 2: camera permission + face capture + match -------------------

  /**
   * Enters the face step after location verification: ensures camera permission
   * (Req 4.3/4.4), resets the attempt counter, and readies capture. Does not
   * re-run GPS — the held location result is preserved (Req 5.5/5.6/17.5).
   */
  async startFaceStep(): Promise<void> {
    this.deps.dispatch(setFlowState('camera_permission'));

    let permission = await this.deps.cameraPermission.check();
    if (permission !== 'granted') {
      permission = await this.deps.cameraPermission.request();
    }
    this.deps.dispatch(setCameraPermission(permission));

    if (permission !== 'granted') {
      this.deps.dispatch(setFlowState('camera_denied'));
      return;
    }

    this.deps.dispatch(resetFaceAttempts());
    this.deps.dispatch(setLastConfidence(null));
    this.deps.dispatch(setFlowState('face_capture'));
  }

  /**
   * Captures a single frame and matches it 1:1 against the teacher's enrollment
   * record, then applies attempt-count discipline via {@link nextAttemptState}.
   *
   * Outcome mapping:
   *  - capture-window expiry → `attempt_failed` (counts, Req 5.8);
   *  - no usable camera → `camera_denied` (offer manual fallback, Req 4.5);
   *  - provider timeout/unavailable → `service_error` (no increment, Req 5.9/17.2);
   *  - score >= threshold → `verified` (Req 5.4);
   *  - score < threshold → `attempt_failed` (Req 5.5).
   */
  async captureAndMatch(): Promise<void> {
    const user = this.deps.getState().auth.user;
    if (!user) {
      this.fail('You must be signed in to mark attendance.');
      return;
    }

    const enrollment = await this.deps.enrollment.getEnrollmentRecord('staff', user.id);
    if (!enrollment) {
      // Enrollment vanished between the gate and the face step (Req 7.1).
      this.deps.dispatch(setFlowState('needs_enrollment'));
      return;
    }

    this.deps.dispatch(setFlowState('face_capture'));

    let frame: CapturedFrame;
    try {
      await this.deps.capture.startPreview();
      frame = await this.deps.capture.captureFrame();
    } catch (error) {
      if (error instanceof CaptureTimeoutError) {
        // Capture window expired → counts as a failed attempt (Req 5.8).
        this.applyMatchOutcome('attempt_failed');
        return;
      }
      if (error instanceof CameraInitError) {
        // No usable camera → route to manual fallback (Req 4.5).
        this.deps.dispatch(setError('The camera is unavailable. You can mark attendance manually.'));
        this.deps.dispatch(setFlowState('camera_denied'));
        return;
      }
      // Unexpected capture failure: treat as a transient service error.
      this.applyMatchOutcome('service_error');
      return;
    } finally {
      this.deps.capture.stopPreview();
    }

    this.deps.dispatch(setFlowState('face_matching'));

    // Server-authoritative verification. The client used to decide the match
    // locally and post the verdict, which the backend cannot trust and now
    // discards — `/staff-attendance/mark` forces faceMatchConfidence to null.
    // Asking the server means the decision is made against the enrolled
    // templates it holds, using the same model and threshold as every other
    // check, rather than against whatever the device had cached.
    const verification = await this.verifyFaceOnServer(user.id, frame);

    if (verification.outcome === 'service_error') {
      this.deps.dispatch(setError(verification.message));
      this.applyMatchOutcome('service_error');
      return;
    }

    // Retained for submit: `mark-with-face` re-verifies server-side and records
    // in one atomic step, so the photo has to survive the confirm screen.
    this.lastVerifiedFrame = frame;
    this.deps.dispatch(setLastConfidence(verification.confidence));
    this.applyMatchOutcome(verification.outcome);
  }

  /**
   * 1:1 verifies a captured frame against the signed-in user's enrolled
   * templates, server-side.
   *
   * Distinguishes a genuine non-match (a failed attempt, which burns one of the
   * user's tries) from the service being unreachable (retryable, which must not
   * — otherwise a flaky network locks someone out of marking attendance).
   */
  private async verifyFaceOnServer(
    userId: string,
    frame: CapturedFrame
  ): Promise<
    | { outcome: 'verified' | 'attempt_failed'; confidence: number }
    | { outcome: 'service_error'; message: string }
  > {
    const form = new FormData();
    form.append('personId', userId);
    form.append('personType', 'staff');
    form.append('file', {
      uri: frame.uri,
      name: 'verify.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);

    let response: Awaited<ReturnType<typeof apiService.postForm>>;
    try {
      response = await this.deps.api.postForm<{ match: boolean; confidence: number | null }>(
        '/faces/verify',
        form
      );
    } catch {
      return { outcome: 'service_error', message: 'Face verification is temporarily unavailable. Please retry.' };
    }

    if (!response.success) {
      // 422 means a face could not be found in the frame at all — that is a bad
      // capture, so it costs an attempt rather than being retried for free.
      if (response.status === 422) {
        return { outcome: 'attempt_failed', confidence: 0 };
      }
      // In dev, show the underlying cause on screen. "Network error" alone is
      // indistinguishable between the server being unreachable, a malformed
      // request body, and a permission failure — which cost a lot of time to
      // untangle by other means.
      const detail = (response as { detail?: string }).detail;
      return {
        outcome: 'service_error',
        message:
          __DEV__ && detail
            ? `${response.error ?? 'Request failed'} — ${detail}`
            : (response.error ?? 'Face verification is temporarily unavailable. Please retry.'),
      };
    }

    const data = response.data as { match: boolean; confidence: number | null } | undefined;
    return {
      outcome: data?.match ? 'verified' : 'attempt_failed',
      confidence: data?.confidence ?? 0,
    };
  }

  /**
   * Re-triggers a face capture after `attempt_failed`, `face_failed`, or
   * `service_error`. The attempt counter is NOT reset here — the pure helper
   * restarts it at 1 on the next failure once the cap has been reached
   * (Req 5.6). GPS is never re-run (Req 5.5/17.5).
   */
  async retryFace(): Promise<void> {
    await this.captureAndMatch();
  }

  /**
   * Applies a face outcome to the slice: syncs the attempt counter to the value
   * computed by {@link nextAttemptState} and transitions the flow state.
   */
  private applyMatchOutcome(outcome: StaffFaceOutcome): void {
    const current = this.deps.getState().staffAttendance.face.attempts;
    const next = nextAttemptState({ attempts: current }, outcome, this.deps.config.face.maxStaffAttempts);
    this.syncFaceAttempts(next.attempts);
    this.deps.dispatch(setFlowState(next.flowState));
  }

  /**
   * Drives the slice's attempt counter to `target` using only the available
   * `incrementFaceAttempts` / `resetFaceAttempts` reducers (the counter can only
   * grow by one or reset to zero).
   */
  private syncFaceAttempts(target: number): void {
    const current = this.deps.getState().staffAttendance.face.attempts;
    let value = current;
    if (target < current) {
      this.deps.dispatch(resetFaceAttempts());
      value = 0;
    }
    while (value < target) {
      this.deps.dispatch(incrementFaceAttempts());
      value += 1;
    }
  }

  private matchWithTimeout(
    frame: CapturedFrame,
    enrollment: Parameters<FaceMatchProvider['matchOne']>[1],
  ): Promise<FaceMatchResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Face match timed out')),
        this.deps.config.face.matchTimeoutMs,
      );
    });
    return Promise.race([this.deps.matchProvider.matchOne(frame, enrollment), timeout]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }

  // -- Manual fallback -----------------------------------------------------

  /**
   * Switches the flow to manual marking, producing a geo-unverified record on
   * submit (`markedManually: true`, `locationStatus: 'failed'`). Reachable from
   * location or camera errors (Req 1.6/3.3/4.5).
   */
  useManualFallback(): void {
    this.manualFallback = true;
    this.deps.dispatch(setFlowState('confirm'));
  }

  // -- Phase 3: submission -------------------------------------------------

  /**
   * Builds and persists the staff attendance record from the confirmed flow.
   *
   *  - Duplicate-day guard: an existing record for today short-circuits to
   *    `already_marked` (Req 6.3).
   *  - Online success → `success`, record marked `synced`.
   *  - Offline / network failure → queued for sync + `pending_sync` (Req 6.5).
   *  - Non-network create failure → `persist_error`, preserving all verification
   *    data so a retry needs no re-verification (Req 6.4/17.5).
   */
  async submit(): Promise<StaffSubmitResult> {
    const state = this.deps.getState();
    const user = state.auth.user;
    if (!user) {
      this.fail('You must be signed in to mark attendance.');
      return { outcome: 'no_user', message: 'You must be signed in to mark attendance.' };
    }

    // Re-check the duplicate-day guard against any record already in state
    // (Req 6.3) — never create a second record for the same day.
    const existing = state.staffAttendance.todayRecord ?? this.findTodayRecordInState();
    if (existing) {
      this.deps.dispatch(setTodayRecord(existing));
      this.deps.dispatch(setFlowState('already_marked'));
      return { outcome: 'already_marked', record: existing };
    }

    this.deps.dispatch(setSubmitting(true));
    try {
      const record = this.buildRecord();

      let response: { success: boolean; error?: string };
      try {
        response = this.manualFallback
          ? // Manual fallback carries no photo by definition; the server records
            // it with a null confidence and `markedManually` set.
            await this.deps.api.post('/staff-attendance/mark', record)
          : await this.submitWithFace(record);
      } catch {
        response = { success: false, error: 'Network error' };
      }

      if (response.success) {
        const saved: StaffAttendanceRecord = { ...record, syncState: 'synced' };
        this.deps.dispatch(setTodayRecord(saved));
        this.deps.dispatch(setFlowState('success'));
        return { outcome: 'success', record: saved };
      }

      // Offline / network failure → queue for later sync and mark pending
      // (Req 6.5). apiService reports transport failures as 'Network error'.
      if (response.error === 'Network error') {
        this.deps.queue('staffAttendance', 'markAttendance', record);
        const pending: StaffAttendanceRecord = { ...record, syncState: 'pending' };
        this.deps.dispatch(setTodayRecord(pending));
        this.deps.dispatch(setFlowState('pending_sync'));
        return { outcome: 'pending_sync', record: pending };
      }

      // Non-network create failure → surface an error but preserve verification
      // data so the user can retry submit() without redoing GPS/face (Req 6.4/17.5).
      const message = response.error ?? 'Could not save attendance. Please retry.';
      this.deps.dispatch(setError(message));
      this.deps.dispatch(setFlowState('persist_error'));
      return { outcome: 'persist_error', message };
    } finally {
      this.deps.dispatch(setSubmitting(false));
    }
  }

  /**
   * Builds a {@link StaffAttendanceRecord} from the held verification state. For
   * the manual-fallback path the record is geo-unverified (Req 6.1).
   */
  /**
   * Submits the face path: uploads the verified photo to `mark-with-face`,
   * which re-verifies 1:1 server-side and only then records, stamping its own
   * computed confidence.
   *
   * Re-verifying at submit rather than trusting the face step is the point.
   * `/staff-attendance/mark` deliberately nulls any client-supplied confidence,
   * so a record created through it carries no evidence a face was ever checked.
   * Going through this endpoint means an attendance row cannot exist without the
   * server having matched the photo itself.
   *
   * A 422 here is the server declining the match. That is NOT queued for offline
   * retry: replaying it would only be refused again, and treating a refusal as
   * "pending sync" would show the user attendance that is never going to land.
   */
  private async submitWithFace(
    record: StaffAttendanceRecord
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.lastVerifiedFrame) {
      return { success: false, error: 'Face verification is missing. Please capture again.' };
    }

    // The RAW reading goes up, not this device's verdict on it. The server
    // recomputes the distance and decides — `locationStatus` and
    // `distanceMeters` are no longer sent at all, because a client able to
    // assert "verified" could mark attendance from anywhere. The local
    // evaluation remains, but only to guide the user before they submit.
    const reading = this.deps.getState().staffAttendance.gps.reading;
    if (!reading) {
      return { success: false, error: 'Location reading is missing. Please try again.' };
    }

    const form = new FormData();
    form.append('date', record.date);
    form.append('status', record.status);
    form.append('latitude', String(reading.latitude));
    form.append('longitude', String(reading.longitude));
    form.append('gpsAccuracy', String(reading.accuracy));
    form.append('isMockLocation', reading.isMock ? 'true' : 'false');
    form.append('capturedAt', new Date(reading.timestamp).toISOString());
    form.append('file', {
      uri: this.lastVerifiedFrame.uri,
      name: 'attendance.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);

    const response = await this.deps.api.postForm('/staff-attendance/mark-with-face', form);
    if (response.success) {
      return { success: true };
    }
    // Only a transport failure (no status) is reported as 'Network error', which
    // is what the caller uses to decide whether queueing for sync is sensible.
    return {
      success: false,
      error: response.status === undefined ? 'Network error' : response.error,
    };
  }

  private buildRecord(): StaffAttendanceRecord {
    const state = this.deps.getState();
    const user = state.auth.user!;
    const { gps, face, selectedDate } = state.staffAttendance;
    const date = selectedDate || new Date(this.deps.now()).toISOString().split('T')[0];
    const markedAt = new Date(this.deps.now()).toISOString();

    if (this.manualFallback) {
      return {
        id: `staff-${user.id}-${date}`,
        date,
        personId: user.id,
        personName: user.name,
        status: 'present',
        markedAt,
        locationStatus: 'failed',
        distanceMeters: null,
        faceMatchConfidence: null,
        markedManually: true,
        syncState: 'pending',
      };
    }

    return {
      id: `staff-${user.id}-${date}`,
      date,
      personId: user.id,
      personName: user.name,
      status: 'present',
      markedAt,
      locationStatus: 'verified',
      distanceMeters: gps.result?.distanceMeters ?? null,
      faceMatchConfidence: face.lastConfidence,
      markedManually: false,
      syncState: 'pending',
    };
  }

  // -- Helpers -------------------------------------------------------------

  /**
   * Loads today's staff record for the signed-in user (backend, best-effort),
   * falling back to any record already held in slice state. Used by the
   * duplicate-day guard (Req 6.3). Network failures are swallowed so the flow
   * proceeds offline.
   */
  async loadTodayRecord(): Promise<StaffAttendanceRecord | null> {
    const state = this.deps.getState();
    const user = state.auth.user;
    if (!user) return null;

    const date = state.staffAttendance.selectedDate || new Date(this.deps.now()).toISOString().split('T')[0];

    try {
      const response = await this.deps.api.get<StaffAttendanceRecord | null>(
        `/staff-attendance/today?date=${encodeURIComponent(date)}`,
      );
      if (response.success) {
        // The server answered. Its answer wins — including when the answer is
        // "no record". Previously an authoritative null fell through to the
        // locally-held record, so a record deleted or corrected on the server
        // could never clear on the device: the user was told "already marked"
        // forever, with nothing on the server to back it up.
        //
        // The shape is checked rather than trusted for truthiness. An envelope
        // or error body leaking through here is truthy but has no `id`/`date`,
        // and treating it as a record showed attendance as already marked when
        // nothing had been recorded at all — a phantom that no amount of
        // clearing server-side could remove.
        if (!isAttendanceRecord(response.data)) {
          this.deps.dispatch(setTodayRecord(null));
          return null;
        }
        return response.data;
      }
    } catch {
      // Fall through: unreachable server, not an authoritative "no record".
    }

    // Only reached when the server could not be asked, so a locally-held record
    // is the best available answer.
    return this.findTodayRecordInState();
  }

  /**
   * Finds a same-day record for the SIGNED-IN user already present in slice
   * state, if any.
   *
   * The identity and date checks are load-bearing. These tablets are shared
   * between teachers, so returning a record belonging to someone else — or to a
   * previous day — would show one person another's attendance as their own and
   * block them from marking their own.
   */
  private findTodayRecordInState(): StaffAttendanceRecord | null {
    const state = this.deps.getState();
    const existing = state.staffAttendance.todayRecord;
    if (!isAttendanceRecord(existing)) return null;
    const date = state.staffAttendance.selectedDate;
    const user = state.auth.user;
    if (user && existing.personId === user.id && (!date || existing.date === date)) {
      return existing;
    }
    return null;
  }

  /** Puts the flow into a terminal error state with a message. */
  private fail(message: string): void {
    this.deps.dispatch(setError(message));
    this.deps.dispatch(setFlowState('service_error'));
  }
}

// ---------------------------------------------------------------------------
// Default school-location loader + singleton
// ---------------------------------------------------------------------------

/**
 * Loads the school geo-fence location: prefers a fresh backend value (cached to
 * `appStorage`), falling back to the cached copy when offline (design →
 * "SchoolLocation" note).
 */
async function loadSchoolLocationDefault(): Promise<SchoolLocation | null> {
  try {
    const response = await apiService.get<SchoolLocation>('/staff-attendance/school-location');
    if (response.success && response.data) {
      await appStorage.set(SCHOOL_LOCATION_STORAGE_KEY, response.data);
      return response.data;
    }
  } catch {
    // fall through to cache
  }
  return appStorage.get<SchoolLocation>(SCHOOL_LOCATION_STORAGE_KEY);
}

/**
 * Shared singleton wired to the real store and device services, mirroring the
 * `syncService` pattern. Screens (task 10) drive the flow through this instance.
 */
export const staffAttendanceService = new StaffAttendanceService({
  dispatch: store.dispatch,
  getState: store.getState,
  geoFence: geoFenceService,
  locationPermission: locationPermissionManager,
  cameraPermission: cameraPermissionManager,
  capture: faceCaptureService,
  matchProvider: faceMatchProvider,
  enrollment: faceEnrollmentService,
  api: apiService,
  queue: queueForSync,
  config: attendanceConfig,
  now: () => Date.now(),
  loadSchoolLocation: loadSchoolLocationDefault,
});

/** Local alias for the geo-fence status union (kept private to this module). */
type SchoolFenceStatus = ReturnType<GeoFenceService['evaluate']>['status'];
