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

  async hasEnrollment(personType: PersonType, personId: string): Promise<boolean> {
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
      frames = await this.captureFrames();
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
    return this.persist(personType, personId, record);
  }

  /** Captures `minEnrollmentImages` frames sequentially within the capture window. */
  private async captureFrames(): Promise<CapturedFrame[]> {
    await this.deps.capture.startPreview();
    const frames: CapturedFrame[] = [];
    for (let i = 0; i < this.deps.minEnrollmentImages; i += 1) {
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
   * Persists the derived record to the backend and local cache. On any network
   * or backend failure the record is queued for offline sync and still cached
   * locally, so the enrollment is treated as saved (Req 7.8/8.8). The local
   * cache is written only on the save path, so a failure before this point
   * leaves any existing record unchanged.
   */
  private async persist(
    personType: PersonType,
    personId: string,
    record: FaceEnrollmentRecord
  ): Promise<EnrollmentResult> {
    const key = enrollmentStorageKey(personType, personId);

    let response: { success: boolean; error?: string };
    try {
      response = await apiService.post('/faces/enroll', record);
    } catch {
      // apiService normalizes errors, but guard against unexpected throws so the
      // enrollment is never silently lost.
      response = { success: false, error: 'Network error' };
    }

    if (response.success) {
      await appStorage.set(key, record);
      return { outcome: 'saved', record, synced: true };
    }

    // Offline / backend unavailable: queue for sync and treat as saved locally
    // (Req 7.8/8.8). The offline-sync queue retries delivery when connectivity
    // returns.
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
