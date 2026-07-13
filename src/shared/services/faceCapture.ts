/**
 * Face capture service: a thin, typed wrapper around `react-native-vision-camera`.
 *
 * Responsibilities:
 *  - expose start/stop preview + single-frame capture behind an interface so the
 *    staff (1:1) and student (1:N) flows depend on a stable contract rather than
 *    on vision-camera internals;
 *  - define the "usable frame" criteria (minimum face size, lighting, and pose)
 *    used to decide whether a captured frame is worth handing to the
 *    `FaceMatchProvider` (Req 5.3);
 *  - enforce the 10-second capture window from `attendanceConfig.face.captureWindowMs`,
 *    rejecting with a typed `CaptureTimeoutError` when no usable frame arrives in
 *    time (Req 5.8);
 *  - surface a typed `CameraInitError` when the device has no usable camera or the
 *    camera fails to initialize, so callers can fall back to manual marking
 *    (Req 4.5, 10.1).
 *
 * Native frame processing runs on worklets and requires native modules, so the
 * concrete `faceCaptureService` only performs real work on an EAS dev client. The
 * mounted `<Camera>` component binds its ref via `attachCamera`; this keeps the
 * service free of React/native coupling and lets `npx tsc --noEmit` pass cleanly.
 *
 * Requirements: 4.5, 5.3, 5.8, 10.1
 */
import { Camera } from 'react-native-vision-camera';
import type { PhotoFile, TakePhotoOptions } from 'react-native-vision-camera';
import { attendanceConfig } from '../config/attendanceConfig';
import type { CapturedFrame } from './faceMatch/types';

/**
 * A single captured camera frame. Re-exported from the face-match contract so
 * there is exactly one canonical definition shared by the capture service and
 * the `FaceMatchProvider` (see `faceMatch/types.ts`).
 */
export type { CapturedFrame };

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/**
 * Raised when the device has no usable camera or the camera fails to
 * initialize. Callers should offer the manual attendance fallback (Req 4.5,
 * 10.1). The discriminant `name` lets callers branch without `instanceof`
 * across module boundaries.
 */
export class CameraInitError extends Error {
  readonly name = 'CameraInitError';

  constructor(message = 'No usable camera is available.', options?: { cause?: unknown }) {
    super(message);
    // Preserve the original error (if any) for logging without leaking it into
    // the public contract.
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, CameraInitError.prototype);
  }
}

/**
 * Raised when the capture window (`attendanceConfig.face.captureWindowMs`)
 * expires before a usable frame is produced. Staff flow treats this like a
 * failed capture attempt (Req 5.8).
 */
export class CaptureTimeoutError extends Error {
  readonly name = 'CaptureTimeoutError';

  /** The capture window, in milliseconds, that elapsed before timing out. */
  readonly windowMs: number;

  constructor(windowMs: number, message = `No usable frame captured within ${windowMs}ms.`) {
    super(message);
    this.windowMs = windowMs;
    Object.setPrototypeOf(this, CaptureTimeoutError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Usable-frame criteria (size / lighting / pose)
// ---------------------------------------------------------------------------

/**
 * Quality metrics for a candidate frame, produced by the face-detector frame
 * processor. Values are normalized so the criteria below are device-agnostic.
 */
export interface FrameQualityMetrics {
  /** Whether a single face was detected in the frame. */
  faceDetected: boolean;
  /** Detected face bounding-box area as a fraction of the frame area (0..1). */
  faceSizeRatio: number;
  /** Average scene luminance (0 = black, 1 = white). */
  brightness: number;
  /** Head rotation left/right in degrees (0 = facing camera). */
  yawDegrees: number;
  /** Head rotation up/down in degrees (0 = facing camera). */
  pitchDegrees: number;
  /** Head tilt in degrees (0 = upright). */
  rollDegrees: number;
}

/**
 * Thresholds a frame must satisfy to be considered "usable" for matching
 * (Req 5.3). Tunable in one place so both attendance flows agree.
 */
export const usableFrameCriteria = {
  /** Face must occupy at least this fraction of the frame (too-far rejection). */
  minFaceSizeRatio: 0.15,
  /** Reject under-exposed frames. */
  minBrightness: 0.25,
  /** Reject over-exposed / washed-out frames. */
  maxBrightness: 0.95,
  /** Max acceptable head yaw (left/right) in degrees. */
  maxYawDegrees: 20,
  /** Max acceptable head pitch (up/down) in degrees. */
  maxPitchDegrees: 20,
  /** Max acceptable head roll (tilt) in degrees. */
  maxRollDegrees: 20,
} as const;

/**
 * Returns true when a frame meets the minimum face size, lighting, and pose
 * criteria and is therefore worth sending to the `FaceMatchProvider` (Req 5.3).
 */
export function isUsableFrame(metrics: FrameQualityMetrics): boolean {
  if (!metrics.faceDetected) {
    return false;
  }
  return (
    metrics.faceSizeRatio >= usableFrameCriteria.minFaceSizeRatio &&
    metrics.brightness >= usableFrameCriteria.minBrightness &&
    metrics.brightness <= usableFrameCriteria.maxBrightness &&
    Math.abs(metrics.yawDegrees) <= usableFrameCriteria.maxYawDegrees &&
    Math.abs(metrics.pitchDegrees) <= usableFrameCriteria.maxPitchDegrees &&
    Math.abs(metrics.rollDegrees) <= usableFrameCriteria.maxRollDegrees
  );
}

// ---------------------------------------------------------------------------
// Camera controller binding + service interface
// ---------------------------------------------------------------------------

/**
 * The subset of the vision-camera `Camera` instance the service delegates to.
 * A mounted `<Camera>` ref (`cameraRef.current`) is structurally assignable to
 * this, so screens bind it with `attachCamera(cameraRef.current)`.
 */
export interface CameraController {
  takePhoto(options?: TakePhotoOptions): Promise<PhotoFile>;
}

/** Options for a single frame capture. */
export interface CaptureFrameOptions {
  /**
   * Capture-window timeout in milliseconds. Defaults to
   * `attendanceConfig.face.captureWindowMs` (Req 5.8).
   */
  timeoutMs?: number;
  /** Passed through to the underlying camera capture. */
  flash?: TakePhotoOptions['flash'];
}

/**
 * Stable contract the attendance flows depend on. Preview lifecycle is modeled
 * as service state the mounted `<Camera isActive>` reads, keeping React out of
 * this module.
 */
export interface FaceCaptureService {
  /**
   * Binds the mounted camera ref used for capture. Must be called before
   * `captureFrame`.
   */
  attachCamera(controller: CameraController): void;
  /** Releases the bound camera ref. */
  detachCamera(): void;
  /**
   * Verifies a usable camera exists and activates the preview.
   * @throws {CameraInitError} when no usable camera is available (Req 4.5, 10.1).
   */
  startPreview(): Promise<void>;
  /** Deactivates the preview. Safe to call when already stopped. */
  stopPreview(): void;
  /** Whether the preview is currently active. */
  isPreviewActive(): boolean;
  /**
   * Captures a single frame, racing the capture against the capture window.
   * @throws {CameraInitError} when no camera is attached / capture init fails.
   * @throws {CaptureTimeoutError} when the window expires first (Req 5.8).
   */
  captureFrame(options?: CaptureFrameOptions): Promise<CapturedFrame>;
  /** Whether a frame's quality metrics satisfy the usable-frame criteria (Req 5.3). */
  isUsableFrame(metrics: FrameQualityMetrics): boolean;
}

/**
 * Probes for at least one usable camera device. Returns false (rather than
 * throwing) when the native module is unavailable, so callers get a clean
 * `CameraInitError` from the service instead of a raw native error.
 */
function hasUsableCamera(): boolean {
  try {
    const devices = Camera.getAvailableCameraDevices();
    return Array.isArray(devices) && devices.length > 0;
  } catch {
    return false;
  }
}

/**
 * Maps a vision-camera `PhotoFile` to the shared `CapturedFrame` contract.
 * VisionCamera writes to a temporary file path; normalize it to a `file://` uri.
 */
function toCapturedFrame(photo: PhotoFile): CapturedFrame {
  const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
  return { uri, width: photo.width, height: photo.height };
}

class VisionCameraFaceCaptureService implements FaceCaptureService {
  private controller: CameraController | null = null;
  private previewActive = false;

  attachCamera(controller: CameraController): void {
    this.controller = controller;
  }

  detachCamera(): void {
    this.controller = null;
    this.previewActive = false;
  }

  async startPreview(): Promise<void> {
    if (!hasUsableCamera()) {
      throw new CameraInitError();
    }
    this.previewActive = true;
  }

  stopPreview(): void {
    this.previewActive = false;
  }

  isPreviewActive(): boolean {
    return this.previewActive;
  }

  isUsableFrame(metrics: FrameQualityMetrics): boolean {
    return isUsableFrame(metrics);
  }

  async captureFrame(options?: CaptureFrameOptions): Promise<CapturedFrame> {
    const controller = this.controller;
    if (controller == null) {
      throw new CameraInitError('Camera is not attached; call attachCamera() first.');
    }

    const timeoutMs = options?.timeoutMs ?? attendanceConfig.face.captureWindowMs;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CaptureTimeoutError(timeoutMs)), timeoutMs);
    });

    const capture = (async (): Promise<CapturedFrame> => {
      try {
        const photo = await controller.takePhoto({ flash: options?.flash ?? 'off' });
        return toCapturedFrame(photo);
      } catch (error) {
        // Preserve a typed timeout, but wrap any native capture failure so
        // callers can fall back to manual marking (Req 4.5, 10.1).
        if (error instanceof CaptureTimeoutError) {
          throw error;
        }
        throw new CameraInitError('Frame capture failed.', { cause: error });
      }
    })();

    try {
      return await Promise.race([capture, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

/**
 * Concrete singleton delegating to vision-camera. Native pieces only run on an
 * EAS dev client; the types remain clean for `npx tsc --noEmit`.
 */
export const faceCaptureService: FaceCaptureService = new VisionCameraFaceCaptureService();
