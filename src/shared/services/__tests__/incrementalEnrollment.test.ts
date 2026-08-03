/**
 * The local enrollment marker is load-bearing.
 *
 * `staffEnrollmentGuard` decides whether to send someone to enrollment by
 * reading AsyncStorage, NOT by asking the server. When the incremental flow
 * replaced the batch one it committed to the server without writing that cache,
 * so a fully-enrolled user was asked to enroll again every time they opened
 * Attendance — the server reported `nextStep: none` while the device disagreed.
 *
 * The two must not drift, so the invariant is pinned here.
 */
// Native modules reached through the import chain (incrementalEnrollment ->
// faceCapture -> vision-camera). Must precede the imports below.
jest.mock('react-native-vision-camera', () => ({
  Camera: {
    getAvailableCameraDevices: () => [],
    getCameraPermissionStatus: () => 'granted',
    requestCameraPermission: async () => 'granted',
  },
}));
jest.mock('expo-location', () => ({
  PermissionStatus: { UNDETERMINED: 'undetermined' },
  getForegroundPermissionsAsync: async () => ({ status: 'granted', granted: true, canAskAgain: true }),
  requestForegroundPermissionsAsync: async () => ({ status: 'granted', granted: true, canAskAgain: true }),
}));
jest.mock('expo-linking', () => ({ openSettings: async () => undefined }));
jest.mock('../../../modules/offlineSync', () => ({ queueForSync: jest.fn() }));
jest.mock('../api', () => ({
  apiService: { get: jest.fn(), post: jest.fn(), postForm: jest.fn() },
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getItem: jest.fn(async (k: string) => store.get(k) ?? null),
    removeItem: jest.fn(async (k: string) => void store.delete(k)),
    clear: jest.fn(async () => void store.clear()),
  };
});

import { apiService } from '../api';
import { appStorage } from '../storage';
import { enrollmentStorageKey, faceEnrollmentService } from '../faceEnrollment';
import { commitEnrollment, uploadPose } from '../incrementalEnrollment';
import type { FaceEnrollmentRecord } from '../../types';

const postMock = apiService.post as jest.Mock;
const postFormMock = apiService.postForm as jest.Mock;

beforeEach(async () => {
  postMock.mockReset();
  (apiService.get as jest.Mock).mockReset();
  postFormMock.mockReset();
  await appStorage.clear();
});

describe('commitEnrollment', () => {
  it('writes the local marker the attendance guard reads', async () => {
    postMock.mockResolvedValue({ success: true, data: { posesCommitted: 5 } });

    const result = await commitEnrollment('staff', 'teacher-1');

    expect(result.outcome).toBe('committed');
    const stored = await appStorage.get<FaceEnrollmentRecord>(
      enrollmentStorageKey('staff', 'teacher-1')
    );
    expect(stored).not.toBeNull();
    expect(stored?.personId).toBe('teacher-1');
    expect(stored?.imageCount).toBe(5);
    // Empty by design — the real templates live in the face service.
    expect(stored?.embedding).toEqual([]);
  });

  it('preserves the original enrolment date across a re-enrollment', async () => {
    await appStorage.set(enrollmentStorageKey('staff', 'teacher-1'), {
      personId: 'teacher-1',
      personType: 'staff',
      embedding: [],
      imageCount: 3,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    postMock.mockResolvedValue({ success: true, data: { posesCommitted: 5 } });

    await commitEnrollment('staff', 'teacher-1');

    const stored = await appStorage.get<FaceEnrollmentRecord>(
      enrollmentStorageKey('staff', 'teacher-1')
    );
    expect(stored?.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(stored?.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('does NOT write a marker when the commit fails', async () => {
    // A marker written on failure is worse than none: the guard would wave the
    // user through to a face step the server will refuse.
    postMock.mockResolvedValue({ success: false, error: 'Only 2 poses captured' });

    const result = await commitEnrollment('staff', 'teacher-1');

    expect(result.outcome).toBe('error');
    expect(await appStorage.get(enrollmentStorageKey('staff', 'teacher-1'))).toBeNull();
  });
});

describe('hasEnrollment', () => {
  // The guard that routes people to enrollment reads this. Trusting only the
  // local cache stranded users enrolled elsewhere (or before the cache existed)
  // in a permanent enrollment loop — which is exactly what happened.
  const getMock = apiService.get as jest.Mock;

  it('trusts the server over an empty local cache, and repairs the cache', async () => {
    getMock.mockResolvedValue({
      success: true,
      status: 200,
      data: { personId: 'teacher-9', imageCount: 5 },
    });

    expect(await faceEnrollmentService.hasEnrollment('staff', 'teacher-9')).toBe(true);
    const repaired = await appStorage.get<FaceEnrollmentRecord>(
      enrollmentStorageKey('staff', 'teacher-9')
    );
    expect(repaired?.imageCount).toBe(5);
  });

  it('clears a stale local marker when the server returns 404', async () => {
    await appStorage.set(enrollmentStorageKey('staff', 'teacher-9'), {
      personId: 'teacher-9', personType: 'staff', embedding: [], imageCount: 5,
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    });
    getMock.mockResolvedValue({ success: false, status: 404, error: 'No enrollment record found' });

    expect(await faceEnrollmentService.hasEnrollment('staff', 'teacher-9')).toBe(false);
    expect(await appStorage.get(enrollmentStorageKey('staff', 'teacher-9'))).toBeNull();
  });

  it('falls back to the local marker when the server cannot be reached', async () => {
    await appStorage.set(enrollmentStorageKey('staff', 'teacher-9'), {
      personId: 'teacher-9', personType: 'staff', embedding: [], imageCount: 5,
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    });
    // No status = nothing is known, so the cached answer is the best available.
    getMock.mockResolvedValue({ success: false, error: 'Network error' });

    expect(await faceEnrollmentService.hasEnrollment('staff', 'teacher-9')).toBe(true);
  });
});

describe('uploadPose', () => {
  it('reports a 422 as no_face so the user is told to retake that pose', async () => {
    postFormMock.mockResolvedValue({
      success: false,
      status: 422,
      error: 'No face detected in this photo. Please retake it.',
    });

    const result = await uploadPose('staff', 'teacher-1', 2, {
      uri: 'file:///tmp/x.jpg',
      width: 1280,
      height: 720,
    });

    expect(result.outcome).toBe('no_face');
  });

  it('marks a transport failure retryable and a server refusal not', async () => {
    postFormMock.mockResolvedValue({ success: false, error: 'Network error' });
    const transport = await uploadPose('staff', 'teacher-1', 0, {
      uri: 'file:///tmp/x.jpg',
      width: 1280,
      height: 720,
    });
    expect(transport).toMatchObject({ outcome: 'error', retryable: true });

    postFormMock.mockResolvedValue({ success: false, status: 400, error: 'poseIndex required' });
    const refused = await uploadPose('staff', 'teacher-1', 0, {
      uri: 'file:///tmp/x.jpg',
      width: 1280,
      height: 720,
    });
    expect(refused).toMatchObject({ outcome: 'error', retryable: false });
  });
});
