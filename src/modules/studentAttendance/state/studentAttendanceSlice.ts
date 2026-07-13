import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { AttendanceRecord } from '../../../shared/types';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import type {
  RosterStudent,
  RosterAttendanceStatus,
  StatusSource,
  UnresolvedDetection,
  EnrollmentStatus,
} from '../../../shared/types/attendance';
import type { PermissionState } from '../../../shared/services/permissions';

/**
 * Lifecycle of a batch face-scan session (Req 9.x/10.x/11.x).
 *
 *  - `loading_roster`    — fetching the class roster.
 *  - `roster_error`      — roster fetch failed.
 *  - `roster_ready`      — roster loaded, not yet scanning.
 *  - `camera_permission` — awaiting/handling the camera permission decision.
 *  - `scan_blocked`      — camera denied/unavailable; scanning cannot start.
 *  - `scanning`          — scan loop actively running.
 *  - `scan_paused`       — paused (e.g. after consecutive provider timeouts).
 *  - `submitting`        — persisting the attendance batch.
 *  - `confirm_unmarked`  — prompting the user to confirm unmarked students.
 *  - `done`              — submitted successfully.
 *  - `pending_sync`      — queued offline, awaiting sync.
 *  - `submit_error`      — submission failed.
 */
export type ScanSessionState =
  | 'loading_roster'
  | 'roster_error'
  | 'roster_ready'
  | 'camera_permission'
  | 'scan_blocked'
  | 'scanning'
  | 'scan_paused'
  | 'submitting'
  | 'confirm_unmarked'
  | 'done'
  | 'pending_sync'
  | 'submit_error';

/** Transient feedback describing the most recent scan match attempt (Req 11.x). */
export interface MatchFeedback {
  studentId: string;
  name: string;
  rollNo: string;
  kind: 'match' | 'no_match' | 'already_present';
  timestamp: number;
}

interface StudentAttendanceState {
  // existing fields (retained)
  records: AttendanceRecord[];
  selectedClassId: string | null;
  selectedDate: string;
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
  // batch face-scan fields
  roster: RosterStudent[];
  sessionState: ScanSessionState;
  scan: {
    presentCount: number;
    consecutiveTimeouts: number;
    lastMatch: MatchFeedback | null;
  };
  unresolvedDetections: UnresolvedDetection[];
  cameraPermission: PermissionState;
  providerMode: 'real' | 'mock';
}

/**
 * Numeric-aware comparator for roll numbers. Roll numbers are stored as
 * strings, but classes usually number students `1, 2, 10` rather than
 * lexicographically (`1, 10, 2`). When both values parse as finite numbers we
 * compare them numerically (tie-breaking on the raw string so `"7"` and
 * `"07"` are stable); purely numeric roll numbers sort before non-numeric
 * ones, and any remaining comparisons fall back to a locale compare with
 * numeric collation so alphanumeric roll numbers (`"10A"`) still order
 * sensibly (Req 9.1, 13.2).
 */
export function compareRollNo(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  const aIsNum = a.trim() !== '' && Number.isFinite(na);
  const bIsNum = b.trim() !== '' && Number.isFinite(nb);
  if (aIsNum && bIsNum) {
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  }
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Pure FIFO cap for the unresolved-detections list (Req 10.4). Appends `item`
 * and, if the resulting list exceeds `cap`, drops the oldest entries from the
 * front so the returned list length never exceeds `cap`. Never mutates `list`.
 * Kept pure and exported so the FIFO-cap invariant (Property 5) can be tested
 * directly and reused by the `addUnresolvedDetection` reducer.
 */
export function capUnresolved(
  list: UnresolvedDetection[],
  item: UnresolvedDetection,
  cap: number,
): UnresolvedDetection[] {
  const next = [...list, item];
  if (cap <= 0) {
    return [];
  }
  if (next.length <= cap) {
    return next;
  }
  return next.slice(next.length - cap);
}

/**
 * A student is "locked" by a face match when they were successfully matched
 * during the current Scan_Session — i.e. marked `present` with source
 * `face_match` (Req 12.3). While locked, no manual marking control is offered
 * and manual status changes must be rejected. Using the roster's own
 * `attendanceStatus === 'present' && statusSource === 'face_match'` captures
 * the "matched-this-session" condition without a separate flag.
 *
 * Pure and exported so the status-source precedence property (Property 10) can
 * target it directly.
 */
export function isLockedByFaceMatch(student: RosterStudent): boolean {
  return (
    student.attendanceStatus === 'present' && student.statusSource === 'face_match'
  );
}

/**
 * Whether the teacher may manually mark this student (Req 12.1, 12.2, 12.3).
 * Manual marking is offered for not-enrolled students and for enrolled students
 * who have not been matched in the current/most-recent session, and is rejected
 * for students locked by a current-session face match. This is exactly the
 * complement of {@link isLockedByFaceMatch}: any student who is not locked is
 * eligible for manual marking.
 */
export function canManuallyMark(student: RosterStudent): boolean {
  return !isLockedByFaceMatch(student);
}

/** Origin of a proposed roster status change (face scan vs. teacher). */
export type StatusChangeSource = Extract<StatusSource, 'face_match' | 'manual'>;

/** A proposed change to a roster student's attendance status. */
export interface StatusChange {
  status: RosterAttendanceStatus;
  source: StatusChangeSource;
  faceMatchConfidence?: number | null;
}

/** The resolved status fields to apply to a roster student. */
export interface ResolvedStatus {
  attendanceStatus: RosterAttendanceStatus;
  statusSource: StatusSource | null;
  faceMatchConfidence: number | null;
}

/**
 * Pure status-source precedence resolver (Req 12.3, 12.4, 12.5).
 *
 * - A `face_match` change ALWAYS applies, overriding any prior manual status
 *   and recording source `face_match` (Req 12.5). Face wins during the session.
 * - A `manual` change is REJECTED when the student is locked by a
 *   current-session face match — the current status/source is preserved
 *   unchanged (Req 12.3).
 * - Otherwise a `manual` change applies with source `manual` and clears any
 *   face-match confidence (Req 12.4).
 *
 * Exported and pure so Property 10 can exercise the precedence rule without the
 * store, camera, or provider.
 */
export function resolveStatusChange(
  current: RosterStudent,
  change: StatusChange,
): ResolvedStatus {
  if (change.source === 'manual' && isLockedByFaceMatch(current)) {
    return {
      attendanceStatus: current.attendanceStatus,
      statusSource: current.statusSource,
      faceMatchConfidence: current.faceMatchConfidence,
    };
  }
  return {
    attendanceStatus: change.status,
    statusSource: change.source,
    faceMatchConfidence:
      change.source === 'face_match' ? change.faceMatchConfidence ?? null : null,
  };
}

const initialState: StudentAttendanceState = {
  records: [],
  selectedClassId: null,
  selectedDate: new Date().toISOString().split('T')[0],
  isLoading: false,
  error: null,
  isSubmitting: false,
  roster: [],
  sessionState: 'roster_ready',
  scan: {
    presentCount: 0,
    consecutiveTimeouts: 0,
    lastMatch: null,
  },
  unresolvedDetections: [],
  cameraPermission: 'undetermined',
  providerMode: 'real',
};

const studentAttendanceSlice = createSlice({
  name: 'studentAttendance',
  initialState,
  reducers: {
    setRecords(state, action: PayloadAction<AttendanceRecord[]>) {
      state.records = action.payload;
    },
    updateRecord(state, action: PayloadAction<{ id: string; status: 'present' | 'absent' | 'late' }>) {
      const record = state.records.find(r => r.id === action.payload.id);
      if (record) {
        record.status = action.payload.status;
      }
    },
    setSelectedClass(state, action: PayloadAction<string | null>) {
      state.selectedClassId = action.payload;
    },
    setSelectedDate(state, action: PayloadAction<string>) {
      state.selectedDate = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setSubmitting(state, action: PayloadAction<boolean>) {
      state.isSubmitting = action.payload;
    },

    // --- Roster ---
    setRoster(state, action: PayloadAction<RosterStudent[]>) {
      state.roster = action.payload;
      // Keep the derived present count in sync with the fresh roster.
      state.scan.presentCount = action.payload.filter(
        s => s.attendanceStatus === 'present',
      ).length;
    },
    updateRosterStudentStatus(
      state,
      action: PayloadAction<{
        studentId: string;
        status: RosterAttendanceStatus;
        statusSource?: StatusSource | null;
        faceMatchConfidence?: number | null;
      }>,
    ) {
      const student = state.roster.find(s => s.id === action.payload.studentId);
      if (!student) {
        return;
      }
      student.attendanceStatus = action.payload.status;
      if (action.payload.statusSource !== undefined) {
        student.statusSource = action.payload.statusSource;
      }
      if (action.payload.faceMatchConfidence !== undefined) {
        student.faceMatchConfidence = action.payload.faceMatchConfidence;
      }
      // Recompute present count from the roster so counts stay consistent.
      state.scan.presentCount = state.roster.filter(
        s => s.attendanceStatus === 'present',
      ).length;
    },

    /**
     * Insert a student into the roster while preserving ascending roll-number
     * order (Req 13.2). Uniqueness/format validation happens in the service
     * before this is dispatched; the reducer only owns the ordered insert so it
     * stays pure and testable. The present count is recomputed from the roster
     * so the `present + pending === total` invariant continues to hold.
     */
    addRosterStudent(state, action: PayloadAction<RosterStudent>) {
      const student = action.payload;
      let index = state.roster.findIndex(
        s => compareRollNo(student.rollNo, s.rollNo) < 0,
      );
      if (index === -1) {
        index = state.roster.length;
      }
      state.roster.splice(index, 0, student);
      state.scan.presentCount = state.roster.filter(
        s => s.attendanceStatus === 'present',
      ).length;
    },

    /**
     * Set a student's face-enrollment status in the roster (Req 8.3). Used by
     * the student face-enrollment screen to mark a student `enrolled` once a
     * Face_Enrollment_Record is stored. Only mutates enrollment status; it
     * leaves attendance status and match metadata untouched so a cancelled or
     * failed enrollment (Req 8.4/8.5) never alters the roster by simply not
     * dispatching this action.
     */
    setStudentEnrollmentStatus(
      state,
      action: PayloadAction<{ studentId: string; enrollmentStatus: EnrollmentStatus }>,
    ) {
      const student = state.roster.find(s => s.id === action.payload.studentId);
      if (student) {
        student.enrollmentStatus = action.payload.enrollmentStatus;
      }
    },

    // --- Session state transitions ---
    setSessionState(state, action: PayloadAction<ScanSessionState>) {
      state.sessionState = action.payload;
    },

    // --- Scan counters / feedback ---
    incrementPresentCount(state) {
      state.scan.presentCount += 1;
    },
    setConsecutiveTimeouts(state, action: PayloadAction<number>) {
      state.scan.consecutiveTimeouts = action.payload;
    },
    resetConsecutiveTimeouts(state) {
      state.scan.consecutiveTimeouts = 0;
    },
    setLastMatch(state, action: PayloadAction<MatchFeedback | null>) {
      state.scan.lastMatch = action.payload;
    },

    // --- Unresolved detections ---
    /**
     * Append a low-confidence detection, enforcing the FIFO cap from
     * `attendanceConfig.face.unresolvedCap` (Req 10.4). When the list is full
     * the oldest entries are dropped from the front so the invariant
     * `unresolvedDetections.length <= unresolvedCap` always holds in state.
     */
    addUnresolvedDetection(state, action: PayloadAction<UnresolvedDetection>) {
      state.unresolvedDetections = capUnresolved(
        state.unresolvedDetections,
        action.payload,
        attendanceConfig.face.unresolvedCap,
      );
    },
    clearUnresolvedDetections(state) {
      state.unresolvedDetections = [];
    },

    // --- Camera permission / provider mode ---
    setCameraPermission(state, action: PayloadAction<PermissionState>) {
      state.cameraPermission = action.payload;
    },
    setProviderMode(state, action: PayloadAction<'real' | 'mock'>) {
      state.providerMode = action.payload;
    },

    /** Reset the scan session back to its initial batch-scan state. */
    resetScanSession(state) {
      state.roster = [];
      state.sessionState = 'roster_ready';
      state.scan = { presentCount: 0, consecutiveTimeouts: 0, lastMatch: null };
      state.unresolvedDetections = [];
    },
  },
});

export const {
  setRecords,
  updateRecord,
  setSelectedClass,
  setSelectedDate,
  setLoading,
  setError,
  setSubmitting,
  setRoster,
  updateRosterStudentStatus,
  addRosterStudent,
  setStudentEnrollmentStatus,
  setSessionState,
  incrementPresentCount,
  setConsecutiveTimeouts,
  resetConsecutiveTimeouts,
  setLastMatch,
  addUnresolvedDetection,
  clearUnresolvedDetections,
  setCameraPermission,
  setProviderMode,
  resetScanSession,
} = studentAttendanceSlice.actions;

// --- Selectors ---

interface RootStateSlice {
  studentAttendance: StudentAttendanceState;
}

const selectRoster = (state: RootStateSlice): RosterStudent[] =>
  state.studentAttendance.roster;

export interface RosterSummary {
  present: number;
  pending: number;
  total: number;
}

/**
 * Memoized summary of roster counts. `pending` is defined as every roster
 * entry that is not `present`, so `present + pending === total` holds by
 * construction for any roster (Req 9.2).
 */
export const selectRosterSummary = createSelector(
  [selectRoster],
  (roster): RosterSummary => {
    const total = roster.length;
    const present = roster.filter(s => s.attendanceStatus === 'present').length;
    const pending = total - present;
    return { present, pending, total };
  },
);

export default studentAttendanceSlice.reducer;
