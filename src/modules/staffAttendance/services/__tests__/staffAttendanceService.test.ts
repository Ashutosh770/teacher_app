/**
 * Unit tests for the staff attendance orchestration state machine
 * (`StaffAttendanceService`, design.md → "Staff Attendance Flow").
 *
 * The service is exercised via its injectable {@link StaffAttendanceServiceDeps}
 * so every branch of the flow runs deterministically WITHOUT native modules:
 * device collaborators (GPS, permissions, camera, face-match, enrollment, api,
 * queue) are supplied as fakes, and flow-state transitions are observed through
 * a REAL Redux store built from the auth + staffAttendance reducers.
 *
 * Native leaf modules pulled in by the service's import chain (the real store,
 * shared device services, storage) are mocked at the top so the module loads
 * under the Node/jest-expo environment. We construct our own service instance
 * with fakes rather than using the exported singleton.
 *
 * Covers: location permission denied/blocked, GPS timeout, unreliable-accuracy
 * retry budget, out-of-fence, mock detection, face verify/fail attempt
 * discipline, offline queueing, and the duplicate-day guard.
 *
 * Requirements: 1.2, 1.3, 2.3, 2.5, 2.6, 3.1, 5.4, 5.6, 6.3, 6.5
 */

// --- Native / heavy module mocks (must precede the module import chain) ------
jest.mock('react-native-vision-camera', () => ({
  Camera: {
    getAvailableCameraDevices: () => [],
    getCameraPermissionStatus: () => 'granted',
    requestCameraPermission: async () => 'granted',
  },
}));
jest.mock('expo-location', () => ({
  PermissionStatus: { UNDETERMINED: 'undetermined' },
  Accuracy: { High: 4 },
  getCurrentPositionAsync: async () => ({
    coords: { latitude: 0, longitude: 0, accuracy: 5 },
    timestamp: 0,
  }),
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
}));
jest.mock('expo-linking', () => ({ openSettings: async () => undefined }));
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      getAllKeys: jest.fn(async () => Object.keys(store)),
    },
  };
});

import { configureStore } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from '../../../../store';
import authReducer, { loginSuccess } from '../../../auth/state/authSlice';
import staffAttendanceReducer from '../../state/staffAttendanceSlice';
import { attendanceConfig } from '../../../../shared/config/attendanceConfig';
import { TimeoutError, type GeoFenceResult, type GPSReading } from '../../../../shared/services/geoFence';
import type { PermissionManager, PermissionState } from '../../../../shared/services/permissions';
import type { FaceCaptureService, CapturedFrame } from '../../../../shared/services/faceCapture';
import type { FaceMatchProvider, FaceMatchResult } from '../../../../shared/services/faceMatch';
import type { SchoolLocation, StaffAttendanceRecord, FaceEnrollmentRecord, User } from '../../../../shared/types';
import { StaffAttendanceService, type StaffAttendanceServiceDeps } from '../staffAttendanceService';

const FIXED_NOW = Date.parse('2024-05-01T09:00:00.000Z');

const TEST_USER: User = {
  id: 'teacher-1',
  username: 'teacher',
  name: 'Test Teacher',
  role: 'teacher',
  allowedModules: ['staffAttendance'],
};

const SCHOOL: SchoolLocation = { latitude: 0, longitude: 0, radiusMeters: 100 };

const ENROLLMENT: FaceEnrollmentRecord = {
  personId: 'teacher-1',
  personType: 'staff',
  embedding: [0.1, 0.2, 0.3],
  imageCount: 3,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
};

function makeReading(overrides?: Partial<GPSReading>): GPSReading {
  return {
    latitude: 0,
    longitude: 0,
    accuracy: 5,
    isMock: false,
    mockDetectionSupported: true,
    timestamp: FIXED_NOW,
    ...overrides,
  };
}

function makeResult(status: GeoFenceResult['status']): GeoFenceResult {
  return { status, distanceMeters: 10, accuracyMeters: 5, radiusMeters: 100 };
}

function makeFrame(): CapturedFrame {
  return { uri: 'file:///frame.jpg', width: 640, height: 480 };
}

interface Fakes {
  geoFence: {
    getReading: jest.Mock<Promise<GPSReading>, unknown[]>;
    evaluate: jest.Mock<GeoFenceResult, unknown[]>;
  };
  locationPermission: jest.Mocked<PermissionManager>;
  cameraPermission: jest.Mocked<PermissionManager>;
  capture: jest.Mocked<Pick<FaceCaptureService, 'startPreview' | 'stopPreview' | 'captureFrame'>>;
  matchProvider: { matchOne: jest.Mock<Promise<FaceMatchResult>, unknown[]> } & Partial<FaceMatchProvider>;
  enrollment: {
    hasEnrollment: jest.Mock<Promise<boolean>, unknown[]>;
    getEnrollmentRecord: jest.Mock<Promise<FaceEnrollmentRecord | null>, unknown[]>;
  };
  api: { get: jest.Mock; post: jest.Mock };
  queue: jest.Mock;
  loadSchoolLocation: jest.Mock<Promise<SchoolLocation | null>, []>;
}

function permissionManager(state: PermissionState): jest.Mocked<PermissionManager> {
  return {
    check: jest.fn(async () => state),
    request: jest.fn(async () => state),
    openSettings: jest.fn(async () => undefined),
  };
}

function buildHarness(options?: { signedIn?: boolean }) {
  const store = configureStore({
    reducer: { auth: authReducer, staffAttendance: staffAttendanceReducer },
  });
  if (options?.signedIn ?? true) {
    store.dispatch(
      loginSuccess({ token: 't', expiresAt: FIXED_NOW + 3_600_000, user: TEST_USER }),
    );
  }

  const fakes: Fakes = {
    geoFence: {
      getReading: jest.fn(async () => makeReading()),
      evaluate: jest.fn(() => makeResult('verified')),
    },
    locationPermission: permissionManager('granted'),
    cameraPermission: permissionManager('granted'),
    capture: {
      startPreview: jest.fn(async () => undefined),
      stopPreview: jest.fn(),
      captureFrame: jest.fn(async () => makeFrame()),
    },
    matchProvider: {
      mode: 'mock',
      matchOne: jest.fn(async () => ({ confidence: 95, personId: 'teacher-1' })),
    },
    enrollment: {
      hasEnrollment: jest.fn(async () => true),
      getEnrollmentRecord: jest.fn(async () => ENROLLMENT),
    },
    api: {
      get: jest.fn(async () => ({ success: true, data: null })),
      post: jest.fn(async () => ({ success: true })),
    },
    queue: jest.fn(),
    loadSchoolLocation: jest.fn(async () => SCHOOL),
  };

  const deps: StaffAttendanceServiceDeps = {
    dispatch: store.dispatch as unknown as AppDispatch,
    getState: store.getState as unknown as () => RootState,
    geoFence: fakes.geoFence as unknown as StaffAttendanceServiceDeps['geoFence'],
    locationPermission: fakes.locationPermission,
    cameraPermission: fakes.cameraPermission,
    capture: fakes.capture as unknown as StaffAttendanceServiceDeps['capture'],
    matchProvider: fakes.matchProvider as unknown as StaffAttendanceServiceDeps['matchProvider'],
    enrollment: fakes.enrollment as unknown as StaffAttendanceServiceDeps['enrollment'],
    api: fakes.api as unknown as StaffAttendanceServiceDeps['api'],
    queue: fakes.queue as unknown as StaffAttendanceServiceDeps['queue'],
    config: attendanceConfig,
    now: () => FIXED_NOW,
    loadSchoolLocation: fakes.loadSchoolLocation,
  };

  const service = new StaffAttendanceService(deps);
  const flowState = () => store.getState().staffAttendance.flowState;
  const accuracyRetries = () => store.getState().staffAttendance.gps.accuracyRetries;
  const faceAttempts = () => store.getState().staffAttendance.face.attempts;

  return { store, service, fakes, flowState, accuracyRetries, faceAttempts };
}

// --------------------------------------------------------------------------
// Phase 1: location permission
// --------------------------------------------------------------------------

describe('location permission branch (Req 1.2/1.3)', () => {
  it('transitions to location_denied when permission is denied', async () => {
    const { service, fakes, flowState } = buildHarness();
    fakes.locationPermission.check.mockResolvedValue('denied');
    fakes.locationPermission.request.mockResolvedValue('denied');

    await service.requestLocation();

    expect(flowState()).toBe('location_denied');
    expect(fakes.geoFence.getReading).not.toHaveBeenCalled();
  });

  it('transitions to location_denied when permission is blocked', async () => {
    const { service, fakes, flowState } = buildHarness();
    fakes.locationPermission.check.mockResolvedValue('blocked');
    fakes.locationPermission.request.mockResolvedValue('blocked');

    await service.requestLocation();

    expect(flowState()).toBe('location_denied');
  });
});

// --------------------------------------------------------------------------
// Phase 1: GPS acquisition + geo-fence evaluation
// --------------------------------------------------------------------------

describe('GPS acquisition branch (Req 2.3)', () => {
  it('transitions to gps_error when the GPS reading times out', async () => {
    const { service, fakes, flowState } = buildHarness();
    fakes.geoFence.getReading.mockRejectedValue(new TimeoutError());

    await service.requestLocation();

    expect(flowState()).toBe('gps_error');
  });
});

describe('geo-fence evaluation branches (Req 2.5/2.6/3.1)', () => {
  it('verified reading advances to location_verified', async () => {
    const { service, fakes, flowState } = buildHarness();
    fakes.geoFence.evaluate.mockReturnValue(makeResult('verified'));

    await service.requestLocation();

    expect(flowState()).toBe('location_verified');
  });

  it('out-of-fence reading transitions to out_of_fence (Req 2.5)', async () => {
    const { service, fakes, flowState } = buildHarness();
    fakes.geoFence.evaluate.mockReturnValue(makeResult('out_of_fence'));

    await service.requestLocation();

    expect(flowState()).toBe('out_of_fence');
  });

  it('mock-detected reading transitions to mock_detected (Req 2.6)', async () => {
    const { service, fakes, flowState } = buildHarness();
    fakes.geoFence.evaluate.mockReturnValue(makeResult('mock_detected'));

    await service.requestLocation();

    expect(flowState()).toBe('mock_detected');
  });

  it('unreliable accuracy stays unreliable until retries are exhausted, then manual_fallback (Req 3.1/3.3)', async () => {
    const { service, fakes, flowState, accuracyRetries } = buildHarness();
    fakes.geoFence.evaluate.mockReturnValue(makeResult('unreliable_accuracy'));

    // First acquisition: one retry consumed, still recoverable.
    await service.requestLocation();
    expect(accuracyRetries()).toBe(1);
    expect(flowState()).toBe('unreliable');

    // Second acquisition: still below the cap.
    await service.retryLocation();
    expect(accuracyRetries()).toBe(2);
    expect(flowState()).toBe('unreliable');

    // Third acquisition reaches maxAccuracyRetries (3) → manual fallback.
    await service.retryLocation();
    expect(accuracyRetries()).toBe(attendanceConfig.geoFence.maxAccuracyRetries);
    expect(flowState()).toBe('manual_fallback');
  });
});

// --------------------------------------------------------------------------
// Phase 2: face capture + match
// --------------------------------------------------------------------------

describe('face verification branches (Req 5.4/5.6)', () => {
  it('a confidence at/above the staff threshold transitions to confirm (Req 5.4)', async () => {
    const { service, fakes, flowState, faceAttempts } = buildHarness();
    fakes.matchProvider.matchOne.mockResolvedValue({
      confidence: attendanceConfig.face.staffThreshold,
      personId: 'teacher-1',
    });

    await service.startFaceStep();
    await service.captureAndMatch();

    expect(flowState()).toBe('confirm');
    expect(faceAttempts()).toBe(0);
  });

  it('below-threshold matches increment attempts until the cap flips to face_failed (Req 5.6)', async () => {
    const { service, fakes, flowState, faceAttempts } = buildHarness();
    fakes.matchProvider.matchOne.mockResolvedValue({ confidence: 40, personId: null });

    await service.startFaceStep();

    // Attempt 1 and 2 stay recoverable.
    await service.captureAndMatch();
    expect(faceAttempts()).toBe(1);
    expect(flowState()).toBe('attempt_failed');

    await service.retryFace();
    expect(faceAttempts()).toBe(2);
    expect(flowState()).toBe('attempt_failed');

    // Attempt 3 reaches maxStaffAttempts (3) → face_failed.
    await service.retryFace();
    expect(faceAttempts()).toBe(attendanceConfig.face.maxStaffAttempts);
    expect(flowState()).toBe('face_failed');
  });
});

// --------------------------------------------------------------------------
// Phase 3: submission
// --------------------------------------------------------------------------

describe('submission branches (Req 6.3/6.5)', () => {
  it('queues the record and transitions to pending_sync on a network failure (Req 6.5)', async () => {
    const { service, fakes, flowState, store } = buildHarness();
    fakes.api.post.mockResolvedValue({ success: false, error: 'Network error' });

    const result = await service.submit();

    expect(result.outcome).toBe('pending_sync');
    expect(fakes.queue).toHaveBeenCalledWith(
      'staffAttendance',
      'markAttendance',
      expect.objectContaining({ personId: 'teacher-1' }),
    );
    expect(flowState()).toBe('pending_sync');
    expect(store.getState().staffAttendance.todayRecord?.syncState).toBe('pending');
  });

  it('online success transitions to success and marks the record synced', async () => {
    const { service, fakes, flowState } = buildHarness();
    fakes.api.post.mockResolvedValue({ success: true });

    const result = await service.submit();

    expect(result.outcome).toBe('success');
    expect(flowState()).toBe('success');
  });

  it('begin() surfaces an existing record for today as already_marked (Req 6.3)', async () => {
    const { service, fakes, flowState, store } = buildHarness();
    const existing: StaffAttendanceRecord = {
      id: 'staff-teacher-1-2024-05-01',
      date: store.getState().staffAttendance.selectedDate,
      personId: 'teacher-1',
      personName: 'Test Teacher',
      status: 'present',
      markedAt: '2024-05-01T08:00:00.000Z',
      locationStatus: 'verified',
      distanceMeters: 12,
      faceMatchConfidence: 91,
      markedManually: false,
      syncState: 'synced',
    };
    fakes.api.get.mockResolvedValue({ success: true, data: existing });

    await service.begin();

    expect(flowState()).toBe('already_marked');
    expect(store.getState().staffAttendance.todayRecord).toEqual(existing);
    // The duplicate-day guard must short-circuit before requesting location.
    expect(fakes.locationPermission.check).not.toHaveBeenCalled();
  });

  it('submit() short-circuits to already_marked when a record is already held in state (Req 6.3)', async () => {
    const { service, fakes, flowState, store } = buildHarness();
    const existing: StaffAttendanceRecord = {
      id: 'staff-teacher-1-2024-05-01',
      date: store.getState().staffAttendance.selectedDate,
      personId: 'teacher-1',
      personName: 'Test Teacher',
      status: 'present',
      markedAt: '2024-05-01T08:00:00.000Z',
      locationStatus: 'verified',
      distanceMeters: 12,
      faceMatchConfidence: 91,
      markedManually: false,
      syncState: 'synced',
    };
    store.dispatch({ type: 'staffAttendance/setTodayRecord', payload: existing });

    const result = await service.submit();

    expect(result.outcome).toBe('already_marked');
    expect(flowState()).toBe('already_marked');
    expect(fakes.api.post).not.toHaveBeenCalled();
  });
});
