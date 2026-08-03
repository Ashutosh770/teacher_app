/**
 * Per-pose enrollment.
 *
 * The batch flow captured every pose on a timer and uploaded them together:
 * ~12 MB and one face inference per pose in a single request, with no chance to
 * review a shot, no way to redo just the bad one, and a failure anywhere losing
 * the whole session.
 *
 * Here each pose is its own small round trip — capture, look at it, keep or
 * retake, upload. The server stages it and only promotes the set on commit, so
 * an abandoned session leaves the person's existing enrollment untouched.
 *
 * Retaking is not a special case: re-uploading the same `poseIndex` overwrites
 * the staged row, both here and on the server.
 */
import { apiService } from './api';
import { appStorage } from './storage';
import { faceCaptureService, CameraInitError, CaptureTimeoutError } from './faceCapture';
import type { CapturedFrame } from './faceMatch/types';
import { enrollmentStorageKey, type PersonType } from './faceEnrollment';
import type { FaceEnrollmentRecord } from '../types';

/** One step of the guided sequence. Order is the capture order. */
export interface EnrollmentPose {
  key: string;
  instruction: string;
}

/**
 * Angles are deliberately MODEST — "slightly", not profiles. Verification
 * captures someone square to a tablet, so a hard-profile template would never
 * be the closest match to a real query and would only add a way to match the
 * wrong person. Two frontal captures bracket the sequence because that is the
 * pose nearly every verification presents.
 */
export const ENROLLMENT_POSES: EnrollmentPose[] = [
  { key: 'centre', instruction: 'Look straight at the camera' },
  { key: 'left', instruction: 'Turn your head slightly to the left' },
  { key: 'right', instruction: 'Turn your head slightly to the right' },
  { key: 'up', instruction: 'Tilt your chin up slightly' },
  { key: 'centre-2', instruction: 'Look straight ahead once more' },
];

/** Server-side minimum; commit is refused below this. */
export const MIN_POSES_TO_COMMIT = 3;

export type CaptureFailure =
  | 'camera_permission_required'
  | 'camera_unavailable'
  | 'capture_timeout';

export type PoseUploadResult =
  | { outcome: 'staged'; stagedCount: number; stagedPoses: number[]; detScore: number }
  /** The server found no face — the user should retake this pose specifically. */
  | { outcome: 'no_face'; message: string }
  | { outcome: 'error'; message: string; retryable: boolean };

export type CommitResult =
  | { outcome: 'committed'; posesCommitted: number }
  | { outcome: 'error'; message: string; retryable: boolean };

/** Captures a single frame for review. Does not upload. */
export async function capturePose(): Promise<
  { outcome: 'captured'; frame: CapturedFrame } | { outcome: 'error'; reason: CaptureFailure }
> {
  try {
    await faceCaptureService.startPreview();
    const frame = await faceCaptureService.captureFrame();
    return { outcome: 'captured', frame };
  } catch (error) {
    if (error instanceof CaptureTimeoutError) {
      return { outcome: 'error', reason: 'capture_timeout' };
    }
    if (error instanceof CameraInitError) {
      return { outcome: 'error', reason: 'camera_unavailable' };
    }
    return { outcome: 'error', reason: 'camera_unavailable' };
  }
}

/**
 * Uploads one reviewed pose.
 *
 * A 422 is reported as `no_face` rather than a generic error because the two
 * need different responses: retake this pose versus something is wrong with the
 * connection. Conflating them is what made the old flow so hard to recover from.
 */
export async function uploadPose(
  personType: PersonType,
  personId: string,
  poseIndex: number,
  frame: CapturedFrame
): Promise<PoseUploadResult> {
  const form = new FormData();
  form.append('personId', personId);
  form.append('personType', personType);
  form.append('poseIndex', String(poseIndex));
  form.append('file', {
    uri: frame.uri,
    name: `pose-${poseIndex}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);

  const response = await apiService.postForm<{
    stagedCount: number;
    stagedPoses: number[];
    detScore: number;
  }>('/faces/enroll/pose', form);

  if (response.success && response.data) {
    return {
      outcome: 'staged',
      stagedCount: response.data.stagedCount,
      stagedPoses: response.data.stagedPoses,
      detScore: response.data.detScore,
    };
  }

  if (response.status === 422) {
    return {
      outcome: 'no_face',
      message: response.error ?? 'No face detected in that photo. Please retake it.',
    };
  }

  return {
    outcome: 'error',
    message: response.error ?? 'Could not upload this photo.',
    // No status means the request never arrived, so retrying can help. A 4xx is
    // the server refusing, and repeating it would only be refused again.
    retryable: response.status === undefined,
  };
}

/** Promotes the staged poses to the live enrollment. */
export async function commitEnrollment(
  personType: PersonType,
  personId: string
): Promise<CommitResult> {
  const response = await apiService.post<{ posesCommitted: number }>('/faces/enroll/commit', {
    personId,
    personType,
  });

  if (response.success && response.data) {
    // Write the LOCAL enrollment marker too.
    //
    // `staffEnrollmentGuard` decides whether to send someone to enrollment by
    // reading this cache, not the server. Committing without writing it left a
    // fully-enrolled user being asked to enroll again every time they opened
    // Attendance — the server said `nextStep: none` while the device disagreed.
    //
    // The embedding is empty by design: the real templates live in the face
    // service, and this is only a "yes, this person is enrolled" marker.
    const now = new Date().toISOString();
    const existing = await appStorage.get<FaceEnrollmentRecord>(
      enrollmentStorageKey(personType, personId)
    );
    const marker: FaceEnrollmentRecord = {
      personId,
      personType,
      embedding: [],
      imageCount: response.data.posesCommitted,
      // Preserve the original enrolment date across a re-enrollment.
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await appStorage.set(enrollmentStorageKey(personType, personId), marker);

    return { outcome: 'committed', posesCommitted: response.data.posesCommitted };
  }
  return {
    outcome: 'error',
    message: response.error ?? 'Could not complete enrollment.',
    retryable: true,
  };
}
