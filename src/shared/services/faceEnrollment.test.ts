/**
 * Unit tests for the FaceEnrollmentService pipeline (Req 7 & 8).
 *
 * Native leaf modules (vision-camera, expo-location/linking, async-storage) and
 * the offline-sync queue barrel are mocked so the service module loads under
 * Node. Device/provider/permission collaborators are injected as fakes so each
 * branch of the capture → derive → confirm → persist pipeline is exercised
 * deterministically.
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
jest.mock('../../modules/offlineSync', () => ({ queueForSync: jest.fn() }));
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
jest.mock('./api', () => ({ apiService: { post: jest.fn() } }));

import type { FaceEnrollmentRecord } from '../types';
import { apiService } from './api';
import { appStorage } from './storage';
import {
  CameraInitError,
  CaptureTimeoutError,
  type CapturedFrame,
  type FaceCaptureService,
} from './faceCapture';
import { ProviderUnavailableError, type FaceMatchProvider } from './faceMatch';
import type { PermissionManager } from './permissions';
import {
  DefaultFaceEnrollmentService,
  enrollmentStorageKey,
} from './faceEnrollment';

const postMock = apiService.post as jest.Mock;

const MIN_IMAGES = 3;

function makeFrame(i: number): CapturedFrame {
  return { uri: `file:///frame-${i}.jpg`, width: 640, height: 480 };
}

function derivedRecord(): FaceEnrollmentRecord {
  return {
    personId: '',
    personType: 'student',
    embedding: [0.1, 0.2, 0.3],
    imageCount: MIN_IMAGES,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

interface Fakes {
  capture: jest.Mocked<FaceCaptureService>;
  provider: Pick<FaceMatchProvider, 'deriveEnrollment'> & FaceMatchProvider;
  cameraPermission: jest.Mocked<PermissionManager>;
  queue: jest.Mock;
}

function buildService(overrides?: {
  permission?: 'granted' | 'denied' | 'blocked' | 'undetermined';
  captureError?: unknown;
  deriveError?: unknown;
}): { service: DefaultFaceEnrollmentService; fakes: Fakes } {
  const capture: jest.Mocked<FaceCaptureService> = {
    attachCamera: jest.fn(),
    detachCamera: jest.fn(),
    startPreview: jest.fn(async () => undefined),
    stopPreview: jest.fn(),
    isPreviewActive: jest.fn(() => true),
    captureFrame: jest.fn(),
    isUsableFrame: jest.fn((_metrics) => true),
  };

  let frameCount = 0;
  if (overrides?.captureError) {
    capture.captureFrame.mockRejectedValue(overrides.captureError);
  } else {
    capture.captureFrame.mockImplementation(async () => makeFrame(frameCount++));
  }

  const provider = {
    mode: 'mock',
    matchOne: jest.fn(),
    matchRoster: jest.fn(),
    deriveEnrollment: jest.fn(async () =>
      overrides?.deriveError
        ? Promise.reject(overrides.deriveError)
        : derivedRecord()
    ),
  } as unknown as Fakes['provider'];

  const permissionState = overrides?.permission ?? 'granted';
  const cameraPermission: jest.Mocked<PermissionManager> = {
    check: jest.fn(async () => permissionState),
    request: jest.fn(async () => permissionState),
    openSettings: jest.fn(async () => undefined),
  };

  const queue = jest.fn();

  const service = new DefaultFaceEnrollmentService({
    capture,
    provider,
    cameraPermission,
    minEnrollmentImages: MIN_IMAGES,
    queue: queue as unknown as Fakes['queue'],
  });

  return { service, fakes: { capture, provider, cameraPermission, queue } };
}

beforeEach(async () => {
  postMock.mockReset();
  await appStorage.clear();
});

describe('FaceEnrollmentService.enroll', () => {
  it('persists and caches on a successful online enrollment (Req 7.5/8.5)', async () => {
    postMock.mockResolvedValue({ success: true });
    const { service, fakes } = buildService();

    const result = await service.enroll('staff', 'teacher-1');

    expect(result.outcome).toBe('saved');
    if (result.outcome === 'saved') {
      expect(result.synced).toBe(true);
      expect(result.record.personId).toBe('teacher-1');
      expect(result.record.personType).toBe('staff');
    }
    expect(fakes.capture.captureFrame).toHaveBeenCalledTimes(MIN_IMAGES);
    expect(postMock).toHaveBeenCalledWith('/faces/enroll', expect.any(Object));
    expect(fakes.queue).not.toHaveBeenCalled();
    const cached = await service.getEnrollmentRecord('staff', 'teacher-1');
    expect(cached?.personId).toBe('teacher-1');
  });

  it('queues for sync and treats as saved when the backend is unreachable (Req 7.8/8.8)', async () => {
    postMock.mockResolvedValue({ success: false, error: 'Network error' });
    const { service, fakes } = buildService();

    const result = await service.enroll('student', 'student-42');

    expect(result.outcome).toBe('saved');
    if (result.outcome === 'saved') {
      expect(result.synced).toBe(false);
    }
    expect(fakes.queue).toHaveBeenCalledWith(
      'faceEnrollment',
      'enroll',
      expect.objectContaining({ personId: 'student-42', personType: 'student' })
    );
    expect(await service.hasEnrollment('student', 'student-42')).toBe(true);
  });

  it('returns a permission error without capturing or persisting (Req 7.4/8.7)', async () => {
    const { service, fakes } = buildService({ permission: 'blocked' });

    const result = await service.enroll('staff', 'teacher-1');

    expect(result).toMatchObject({
      outcome: 'error',
      reason: 'camera_permission_required',
      permissionState: 'blocked',
    });
    expect(fakes.capture.captureFrame).not.toHaveBeenCalled();
    expect(fakes.provider.deriveEnrollment).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('requests permission when not initially granted, then proceeds', async () => {
    postMock.mockResolvedValue({ success: true });
    const { service, fakes } = buildService();
    fakes.cameraPermission.check.mockResolvedValueOnce('undetermined');
    fakes.cameraPermission.request.mockResolvedValueOnce('granted');

    const result = await service.enroll('staff', 'teacher-1');

    expect(fakes.cameraPermission.request).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('saved');
  });

  it('keeps an existing record unchanged when capture times out (Req 7.6/8.6)', async () => {
    postMock.mockResolvedValue({ success: true });
    const key = enrollmentStorageKey('student', 'student-7');
    const existing: FaceEnrollmentRecord = {
      ...derivedRecord(),
      personId: 'student-7',
      personType: 'student',
    };
    await appStorage.set(key, existing);

    const { service } = buildService({
      captureError: new CaptureTimeoutError(10000),
    });

    const result = await service.enroll('student', 'student-7');

    expect(result).toMatchObject({ outcome: 'error', reason: 'capture_timeout' });
    expect(postMock).not.toHaveBeenCalled();
    const still = await service.getEnrollmentRecord('student', 'student-7');
    expect(still).toEqual(existing);
  });

  it('maps a camera init failure to a camera_unavailable error (Req 4.5)', async () => {
    const { service } = buildService({ captureError: new CameraInitError() });

    const result = await service.enroll('staff', 'teacher-1');

    expect(result).toMatchObject({ outcome: 'error', reason: 'camera_unavailable' });
  });

  it('maps a provider failure to a provider_unavailable error (Req 7.6/8.5)', async () => {
    const { service } = buildService({
      deriveError: new ProviderUnavailableError(),
    });

    const result = await service.enroll('staff', 'teacher-1');

    expect(result).toMatchObject({
      outcome: 'error',
      reason: 'provider_unavailable',
    });
  });

  it('discards the capture and preserves state when identity confirm is rejected (Req 8.4)', async () => {
    postMock.mockResolvedValue({ success: true });
    const { service, fakes } = buildService();

    const result = await service.enroll('student', 'student-9', {
      confirm: async () => false,
    });

    expect(result).toEqual({ outcome: 'cancelled' });
    expect(postMock).not.toHaveBeenCalled();
    expect(fakes.queue).not.toHaveBeenCalled();
    expect(await service.hasEnrollment('student', 'student-9')).toBe(false);
  });

  it('persists when the identity confirm gate approves (Req 8.3)', async () => {
    postMock.mockResolvedValue({ success: true });
    const { service } = buildService();

    const result = await service.enroll('student', 'student-9', {
      confirm: async () => true,
    });

    expect(result.outcome).toBe('saved');
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the original createdAt when replacing an existing record (re-enrollment)', async () => {
    postMock.mockResolvedValue({ success: true });
    const key = enrollmentStorageKey('staff', 'teacher-1');
    await appStorage.set(key, {
      ...derivedRecord(),
      personId: 'teacher-1',
      personType: 'staff',
      createdAt: '2019-06-01T00:00:00.000Z',
    });

    const { service } = buildService();
    const result = await service.enroll('staff', 'teacher-1');

    expect(result.outcome).toBe('saved');
    if (result.outcome === 'saved') {
      expect(result.record.createdAt).toBe('2019-06-01T00:00:00.000Z');
      expect(result.record.updatedAt).not.toBe('2019-06-01T00:00:00.000Z');
    }
  });
});

describe('FaceEnrollmentService.hasEnrollment', () => {
  it('returns false when no record is cached and true after enrollment', async () => {
    postMock.mockResolvedValue({ success: true });
    const { service } = buildService();

    expect(await service.hasEnrollment('staff', 'teacher-x')).toBe(false);
    await service.enroll('staff', 'teacher-x');
    expect(await service.hasEnrollment('staff', 'teacher-x')).toBe(true);
  });
});
