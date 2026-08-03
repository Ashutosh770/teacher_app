/**
 * Face enrollment service (shared).
 *
 * Captures enrollment frames, derives a reusable `FaceEnrollmentRecord` via the
 * `FaceMatchProvider`, and persists it (backend + local cache), queueing for
 * offline sync when the network is unavailable. Consumed by both the teacher
 * self-enrollment screen and the student (by-class-teacher) enrollment screen,
 * so it lives in `shared/services` rather than a single module.
 *
 * This service owns the capture → derive → persist pipeline only. UI-level
 * gates that differ per role (e.g. the student name+rollNo identity confirm gate
 * from Req 8.2–8.4, or the staff face-step enrollment guard from Req 7.1) are
 * enforced by the enrollment screens. To keep the identity-confirm gate testable
 * and centralized, callers may pass an optional `confirm` callback that runs
 * after frames are derived but before anything is persisted; returning `false`
 * discards the capture and leaves any existing record untouched.
 *
 * Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 8.1, 8.5, 8.6, 8.8
 */
import { attendanceConfig } from '../config/attendanceConfig';
import type { FaceEnrollmentRecord } from '../types';
import { apiService } from './api';
import { appStorage } from './storage';
import {
  faceCaptureService,
  CameraInitError,
  CaptureTimeoutError,
  type CapturedFrame,
  type FaceCaptureService,
} from './faceCapture';
import {
  faceMatchProvider,
  ProviderUnavailableError,
  type FaceMatchProvider,
} from './faceMatch';
import {
  cameraPermissionManager,
  type PermissionManager,
  type PermissionState,
} from './permissions';
import { queueForSync } from '../../modules/offlineSync';

/** The kind of person an enrollment belongs to. */
export type PersonType = FaceEnrollmentRecord['personType'];

/** Reason codes for a failed enrollment attempt (existing record preserved). */
export type EnrollmentErrorReason =
  /** Camera permission is denied/blocked; capture never started (Req 7.4/8.7). */
  | 'camera_permission_required'
  /** No usable camera or the camera failed to initialize (Req 4.5). */
  | 'camera_unavailable'
  /** The capture window expired before enough usable frames were produced (Req 7.6/8.5). */
  | 'capture_timeout'
  /** Fewer frames than `minEnrollmentImages` were captured (Req 7.6/8.5). */
  | 'insufficient_images'
  /** The face-match provider could not derive an enrollment (Req 7.6/8.5). */
  | 'provider_unavailable'
  /** Persisting the derived record failed unexpectedly. */
  | 'persist_failed';

/**
 * Outcome of an enrollment attempt.
 *
 * - `saved`     — a record was derived and persisted. `synced` is `true` when the
 *                 backend accepted it, `false` when it was queued for offline
 *                 sync but is treated as saved locally (Req 7.8/8.8).
 * - `cancelled` — the caller's identity-confirm gate rejected the capture; the
 *                 captured frames are discarded and any existing record is left
 *                 unchanged (Req 8.4).
 * - `error`     — capture/derive/persist failed; any existing record is left
 *                 unchanged (Req 7.6/8.6).
 */
export type EnrollmentResult =
  | { outcome: 'saved'; record: FaceEnrollmentRecord; synced: boolean }
  | { outcome: 'cancelled' }
  | {
      outcome: 'error';
      reason: EnrollmentErrorReason;
      message: string;
      /** Present when the failure was a permission problem, for UI routing. */
      permissionState?: PermissionState;
    };

/** Options controlling a single enrollment run. */
/** One step of the guided enrollment sequence. */
export interface EnrollmentPose {
  key: string;
  instruction: string;
}

/**
 * The capture sequence, in order.
 *
 * Each pose becomes its own stored template on the server, matched on whichever
 * scores best — the same approach phone face-unlock uses. That is what makes
 * varied angles help: under the previous averaged-centroid storage, a left-turn
 * and a right-turn averaged into a reference resembling neither.
 *
 * Angles are deliberately MODEST — "slightly", not profiles. Attendance capture
 * is someone standing square to a tablet, so a hard-profile template would never
 * be the best match for any real query and would only add a way to match the
 * wrong person. Two frontal captures bracket the sequence because that is the
 * pose almost every verification will actually present.
 */
export const ENROLLMENT_POSES: EnrollmentPose[] = [
  { key: 'centre', instruction: 'Look straight at the camera' },
  { key: 'left', instruction: 'Turn your head slightly to the left' },
  { key: 'right', instruction: 'Turn your head slightly to the right' },
  { key: 'up', instruction: 'Tilt your chin up slightly' },
  { key: 'centre-2', instruction: 'Look straight ahead once more' },
];

export interface EnrollOptions {
  /**
   * Optional identity-confirmation gate. Invoked after frames are captured and
   * an enrollment record is derived, but before it is persisted. Resolving to
   * `false` discards the capture and returns a `cancelled` result without
   * touching any existing record. Used by the student enrollment screen to
   * enforce the name+rollNo confirm gate (Req 8.2–8.4); the teacher
   * self-enrollment flow omits it.
   */
  confirm?: (record: FaceEnrollmentRecord) => Promise<boolean> | boolean;
  /**
   * Called before each capture so the UI can prompt the user into the next pose
   * and wait while they move. Capture happens when the returned promise
   * resolves.
   *
   * Without it, frames are taken back-to-back in a tight loop — which is what
   * this originally did, and it meant the "multiple photos" were several samples
   * of a single instant, adding almost nothing over one capture.
   */
  onPose?: (pose: EnrollmentPose, index: number, total: number) => Promise<void> | void;
}

export interface FaceEnrollmentService {
  /**
   * Runs the enrollment pipeline for a person: ensure camera permission →
   * capture the configured minimum number of frames → derive a record →
   * (optionally confirm) → persist. Never throws; device/provider failures are
   * mapped to an `error` result so callers can render descriptive messages and
   * offer a retry (Req 7.6/8.5/8.6).
   */
  enroll(
    personType: PersonType,
    personId: string,
    options?: EnrollOptions
  ): Promise<EnrollmentResult>;

  /** Reads the locally cached enrollment record, or `null` if none exists. */
  getEnrollmentRecord(
    personType: PersonType,
    personId: string
  ): Promise<FaceEnrollmentRecord | null>;

  /**
   * Whether a locally cached enrollment record exists. Backs the staff
   * face-step guard (Req 7.1) and the student roster enrolled/not-enrolled flag.
   */
  hasEnrollment(personType: PersonType, personId: string): Promise<boolean>;
}

/** Storage key for a cached enrollment record. */
export function enrollmentStorageKey(personType: PersonType, personId: string): string {
  return `faceEnrollment:${personType}:${personId}`;
}

/**
 * Concrete enrollment service. Device/provider/persistence collaborators are
 * injectable so the pipeline can be unit- and property-tested without native
 * modules; the exported singleton wires the real shared services.
 */
export class DefaultFaceEnrollmentService implements FaceEnrollmentService {
  constructor(
    private readonly deps: {
      capture: FaceCaptureService;
      provider: FaceMatchProvider;
      cameraPermission: PermissionManager;
      minEnrollmentImages: number;
      queue: typeof queueForSync;
    }
  ) {}

  async getEnrollmentRecord(
    personType: PersonType,
    personId: string
  ): Promise<FaceEnrollmentRecord | null> {
    return appStorage.get<FaceEnrollmentRecord>(
      enrollmentStorageKey(personType, personId)
    );
  }

  /**
   * Whether this person is enrolled — asking the SERVER first, falling back to
   * the local marker only when it cannot be reached.
   *
   * The local cache alone is not trustworthy for this. It goes stale in both
   * directions: someone enrolled on a different device (or before this cache
   * existed) reads as un-enrolled and is sent round the enrollment loop forever,
   * while an enrollment deleted server-side still reads as present. Both have
   * happened here.
   *
   * The local answer is still the right fallback offline — the guard has to
   * produce a decision without a network — so the server's answer is written
   * back to the cache as it arrives, which also repairs a device that was wrong.
   */
  async hasEnrollment(personType: PersonType, personId: string): Promise<boolean> {
    const key = enrollmentStorageKey(personType, personId);
    try {
      const response = await apiService.get<{ personId: string; imageCount: number }>(
        `/faces/${personType}/${personId}`,
      );

      if (response.success && response.data) {
        const now = new Date().toISOString();
        const existing = await appStorage.get<FaceEnrollmentRecord>(key);
        await appStorage.set(key, {
          personId,
          personType,
          embedding: [],
          imageCount: response.data.imageCount ?? existing?.imageCount ?? 0,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        } satisfies FaceEnrollmentRecord);
        return true;
      }

      // A 404 is the server stating there is no enrollment. Clear the local
      // marker so the device stops disagreeing with it.
      if (response.status === 404) {
        await appStorage.remove(key);
        return false;
      }
    } catch {
      // Fall through to the cached answer.
    }

    return (await this.getEnrollmentRecord(personType, personId)) !== null;
  }

  async enroll(
    personType: PersonType,
    personId: string,
    options?: EnrollOptions
  ): Promise<EnrollmentResult> {
    // 1. Ensure camera permission WITHOUT touching any existing record (Req 7.3,
    //    7.4, 8.1, 8.7). Check first, then request only if not already granted.
    let permission = await this.deps.cameraPermission.check();
    if (permission !== 'granted') {
      permission = await this.deps.cameraPermission.request();
    }
    if (permission !== 'granted') {
      return {
        outcome: 'error',
        reason: 'camera_permission_required',
        message: 'Camera access is required to enroll a face.',
        permissionState: permission,
      };
    }

    // 2. Capture the configured minimum number of usable frames. Any device
    //    failure here leaves any existing record unchanged (Req 7.6/8.5/8.6).
    let frames: CapturedFrame[];
    try {
      frames = await this.captureFrames(options?.onPose);
    } catch (error) {
      return this.captureError(error);
    } finally {
      this.deps.capture.stopPreview();
    }

    if (frames.length < this.deps.minEnrollmentImages) {
      return {
        outcome: 'error',
        reason: 'insufficient_images',
        message: `At least ${this.deps.minEnrollmentImages} images are required to enroll a face.`,
      };
    }

    // 3. Derive a reusable enrollment record from the captured frames.
    let derived: FaceEnrollmentRecord;
    try {
      derived = await this.deps.provider.deriveEnrollment(frames);
    } catch (error) {
      if (error instanceof ProviderUnavailableError) {
        return {
          outcome: 'error',
          reason: 'provider_unavailable',
          message: 'The face enrollment service is unavailable. Please try again.',
        };
      }
      return {
        outcome: 'error',
        reason: 'provider_unavailable',
        message: 'Could not derive face data from the captured images.',
      };
    }

    // 4. Bind the record to the target person. Preserve the original createdAt on
    //    re-enrollment so replacement keeps enrollment history intact.
    const existing = await this.getEnrollmentRecord(personType, personId);
    const now = new Date().toISOString();
    const record: FaceEnrollmentRecord = {
      ...derived,
      personId,
      personType,
      createdAt: existing?.createdAt ?? derived.createdAt ?? now,
      updatedAt: now,
    };

    // 5. Optional identity-confirm gate (student flow, Req 8.2–8.4). Rejecting
    //    discards the capture and leaves any existing record unchanged.
    if (options?.confirm) {
      const confirmed = await options.confirm(record);
      if (!confirmed) {
        return { outcome: 'cancelled' };
      }
    }

    // 6. Persist. Replace the existing record only on success (Req 7.5/7.6/8.6).
    //    The captured frames go with it: the server computes the authoritative
    //    embedding from the images, so `derived` is only a local marker now.
    return this.persist(personType, personId, record, frames);
  }

  /**
   * Captures one frame per pose in the guided sequence.
   *
   * When `onPose` is supplied the UI prompts for each pose and this waits for
   * the user to get there, so the frames are genuinely different views. Without
   * it the frames are taken back-to-back, which yields near-identical captures —
   * retained only so callers that do not drive a guided UI keep working.
   */
  private async captureFrames(
    onPose?: EnrollOptions['onPose']
  ): Promise<CapturedFrame[]> {
    await this.deps.capture.startPreview();
    const total = this.deps.minEnrollmentImages;
    const frames: CapturedFrame[] = [];
    for (let i = 0; i < total; i += 1) {
      // Cycle if configured for more frames than there are defined poses, so the
      // sequence degrades to repeats rather than reading past the end.
      const pose = ENROLLMENT_POSES[i % ENROLLMENT_POSES.length];
      await onPose?.(pose, i, total);
      frames.push(await this.deps.capture.captureFrame());
    }
    return frames;
  }

  /** Maps a capture-phase throw to a descriptive error result. */
  private captureError(error: unknown): EnrollmentResult {
    if (error instanceof CaptureTimeoutError) {
      return {
        outcome: 'error',
        reason: 'capture_timeout',
        message: 'No usable image was captured in time. Please try again.',
      };
    }
    if (error instanceof CameraInitError) {
      return {
        outcome: 'error',
        reason: 'camera_unavailable',
        message: 'The camera could not be started. Please try again.',
      };
    }
    return {
      outcome: 'error',
      reason: 'camera_unavailable',
      message: 'Face capture failed unexpectedly. Please try again.',
    };
  }

  /**
   * Uploads the captured photos to the backend, which computes and stores the
   * authoritative embedding, then caches a local marker.
   *
   * Sends multipart, not the derived record. Enrollment is server-authoritative:
   * the 512-D embedding lives in the face service's vector store, and the
   * on-device `derived` value is now only a local "this person is enrolled"
   * marker. Posting the record as JSON — as this did previously — is rejected by
   * the backend, which reads `files` from a multipart body and 400s without them.
   *
   * Failure handling distinguishes two cases that must not be conflated:
   *
   *  - **Transport failure** (offline, server unreachable) — genuinely retryable,
   *    so the enrollment is queued and reported as saved-pending (Req 7.8/8.8).
   *  - **Server rejection** (4xx — no consent, no face detected, bad request) —
   *    NOT retryable. Queueing these was the bug that made a failed enrollment
   *    look successful: the app reported "saved", cached a marker the server
   *    never agreed with, and the offline-sync route rejects queued face
   *    enrollments outright, so the item could never be delivered. The user
   *    believed they were enrolled and no amount of waiting would make it true.
   */
  private async persist(
    personType: PersonType,
    personId: string,
    record: FaceEnrollmentRecord,
    frames: CapturedFrame[]
  ): Promise<EnrollmentResult> {
    const key = enrollmentStorageKey(personType, personId);

    const form = new FormData();
    form.append('personId', personId);
    form.append('personType', personType);
    frames.forEach((frame, index) => {
      // React Native's FormData takes a {uri, name, type} part for file uploads;
      // vision-camera gives us a `file://` uri, which it streams directly rather
      // than loading the image into JS memory.
      form.append('files', {
        uri: frame.uri,
        name: `enroll-${index}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
    });

    let response: { success: boolean; error?: string; status?: number };
    try {
      response = await apiService.postForm('/faces/enroll', form);
    } catch {
      response = { success: false, error: 'Network error' };
    }

    if (response.success) {
      await appStorage.set(key, record);
      return { outcome: 'saved', record, synced: true };
    }

    const isTransport = response.status === undefined;
    if (!isTransport) {
      // Leave any existing enrollment untouched and surface the server's reason.
      return {
        outcome: 'error',
        reason: 'persist_failed',
        message: response.error ?? 'Enrollment was rejected. Please try again.',
      };
    }

    this.deps.queue('faceEnrollment', 'enroll', record);
    await appStorage.set(key, record);
    return { outcome: 'saved', record, synced: false };
  }
}

/**
 * Shared singleton wired to the real device/provider/persistence collaborators.
 */
export const faceEnrollmentService: FaceEnrollmentService =
  new DefaultFaceEnrollmentService({
    capture: faceCaptureService,
    provider: faceMatchProvider,
    cameraPermission: cameraPermissionManager,
    minEnrollmentImages: attendanceConfig.face.minEnrollmentImages,
    queue: queueForSync,
  });
