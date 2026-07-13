import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AttendanceRecord } from '../../../shared/types';
import type { StaffAttendanceRecord } from '../../../shared/types';
import type { GPSReading, GeoFenceResult } from '../../../shared/services/geoFence';
import type { PermissionState } from '../../../shared/services/permissions';

/**
 * States of the staff attendance flow state machine (design.md → "Staff
 * Attendance state machine"). The orchestration service (task 9.2) drives the
 * transitions between these states; the reducers here only apply them.
 */
export type StaffFlowState =
  | 'check_enrollment'
  | 'needs_enrollment'
  | 'location_permission'
  | 'location_denied'
  | 'acquiring_gps'
  | 'gps_error'
  | 'evaluate_fence'
  | 'unreliable'
  | 'mock_detected'
  | 'out_of_fence'
  | 'location_verified'
  | 'camera_permission'
  | 'camera_denied'
  | 'face_capture'
  | 'face_matching'
  | 'attempt_failed'
  | 'face_failed'
  | 'service_error'
  | 'manual_fallback'
  | 'confirm'
  | 'success'
  | 'already_marked'
  | 'persist_error'
  | 'pending_sync';

/** Liveness sub-checks tracked during face capture. */
export interface LivenessProgress {
  faceDetected: boolean;
  blinkDetected: boolean;
  poseOk: boolean;
}

/** Status of the one-time face enrollment sub-flow. */
export type EnrollmentFlowStatus = 'idle' | 'capturing' | 'saving' | 'error';

interface StaffAttendanceState {
  // Existing fields (retained)
  records: AttendanceRecord[];
  selectedDate: string;
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;

  // Attendance flow state machine
  flowState: StaffFlowState;
  gps: {
    reading: GPSReading | null;
    result: GeoFenceResult | null;
    accuracyRetries: number;
  };
  face: {
    attempts: number;
    lastConfidence: number | null;
    liveness: LivenessProgress;
  };
  locationPermission: PermissionState;
  cameraPermission: PermissionState;
  todayRecord: StaffAttendanceRecord | null;
  enrollment: {
    hasRecord: boolean;
    status: EnrollmentFlowStatus;
  };
}

const initialState: StaffAttendanceState = {
  records: [],
  selectedDate: new Date().toISOString().split('T')[0],
  isLoading: false,
  error: null,
  isSubmitting: false,

  flowState: 'check_enrollment',
  gps: {
    reading: null,
    result: null,
    accuracyRetries: 0,
  },
  face: {
    attempts: 0,
    lastConfidence: null,
    liveness: {
      faceDetected: false,
      blinkDetected: false,
      poseOk: false,
    },
  },
  locationPermission: 'undetermined',
  cameraPermission: 'undetermined',
  todayRecord: null,
  enrollment: {
    hasRecord: false,
    status: 'idle',
  },
};

const staffAttendanceSlice = createSlice({
  name: 'staffAttendance',
  initialState,
  reducers: {
    // --- Existing reducers (retained) ---
    setRecords(state, action: PayloadAction<AttendanceRecord[]>) {
      state.records = action.payload;
    },
    updateRecord(state, action: PayloadAction<{ id: string; status: 'present' | 'absent' }>) {
      const record = state.records.find(r => r.id === action.payload.id);
      if (record) {
        record.status = action.payload.status;
      }
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

    // --- Flow state machine transitions ---
    setFlowState(state, action: PayloadAction<StaffFlowState>) {
      state.flowState = action.payload;
    },

    // GPS / geo-fence
    setGpsReading(state, action: PayloadAction<GPSReading | null>) {
      state.gps.reading = action.payload;
    },
    setGeoFenceResult(state, action: PayloadAction<GeoFenceResult | null>) {
      state.gps.result = action.payload;
    },
    incrementAccuracyRetries(state) {
      state.gps.accuracyRetries += 1;
    },
    resetAccuracyRetries(state) {
      state.gps.accuracyRetries = 0;
    },

    // Permissions
    setLocationPermission(state, action: PayloadAction<PermissionState>) {
      state.locationPermission = action.payload;
    },
    setCameraPermission(state, action: PayloadAction<PermissionState>) {
      state.cameraPermission = action.payload;
    },

    // Face capture / matching
    incrementFaceAttempts(state) {
      state.face.attempts += 1;
    },
    resetFaceAttempts(state) {
      state.face.attempts = 0;
    },
    setLastConfidence(state, action: PayloadAction<number | null>) {
      state.face.lastConfidence = action.payload;
    },
    setLiveness(state, action: PayloadAction<LivenessProgress>) {
      state.face.liveness = action.payload;
    },

    // Persistence / record
    setTodayRecord(state, action: PayloadAction<StaffAttendanceRecord | null>) {
      state.todayRecord = action.payload;
    },

    // Enrollment
    setEnrollmentStatus(state, action: PayloadAction<EnrollmentFlowStatus>) {
      state.enrollment.status = action.payload;
    },
    setHasEnrollmentRecord(state, action: PayloadAction<boolean>) {
      state.enrollment.hasRecord = action.payload;
    },
  },
});

export const {
  setRecords,
  updateRecord,
  setSelectedDate,
  setLoading,
  setError,
  setSubmitting,
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
  setLiveness,
  setTodayRecord,
  setEnrollmentStatus,
  setHasEnrollmentRecord,
} = staffAttendanceSlice.actions;

export default staffAttendanceSlice.reducer;
