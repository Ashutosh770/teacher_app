/**
 * Liveness evaluation from per-frame face metrics.
 *
 * Pure and frame-agnostic: the ML Kit frame processor supplies metrics, this
 * decides what they mean. Keeping the decision out of the worklet means the
 * rules are unit-testable without a camera, and the thresholds live somewhere
 * they can be reviewed rather than buried in a render tree.
 *
 * A blink is the only one of the three checks that actually resists a spoof —
 * a printed photo satisfies "face detected" and "pose OK" trivially, so the
 * blink is what makes the checklist mean anything. It therefore requires a
 * genuine transition (eyes open → closed → open), not merely a frame with the
 * eyes shut: a photo of someone with their eyes closed would otherwise pass.
 */

/** Per-frame metrics as reported by ML Kit. */
export interface FaceFrameMetrics {
  /** null when no face is in frame. */
  leftEyeOpenProbability: number | null;
  rightEyeOpenProbability: number | null;
  /** Head rotation in degrees; 0 is square to the camera. */
  yawDegrees: number;
  pitchDegrees: number;
}

export interface LivenessState {
  faceDetected: boolean;
  blinkDetected: boolean;
  poseOk: boolean;
  /** Internal: eyes have been observed open, so a close now counts as a blink. */
  eyesWereOpen: boolean;
}

export const LIVENESS_THRESHOLDS = {
  /** Below this, an eye is considered closed. */
  eyeClosedProbability: 0.25,
  /** Above this, an eye is considered open — the gap avoids flapping on noise. */
  eyeOpenProbability: 0.7,
  /**
   * Head rotation tolerated as "facing the camera". Generous on purpose: this
   * gates capture, and a check strict enough to be annoying gets worked around
   * by holding the tablet at an angle that satisfies it rather than by looking
   * at the camera.
   */
  maxYawDegrees: 25,
  maxPitchDegrees: 25,
} as const;

export const INITIAL_LIVENESS: LivenessState = {
  faceDetected: false,
  blinkDetected: false,
  poseOk: false,
  eyesWereOpen: false,
};

/**
 * Folds one frame's metrics onto the running state.
 *
 * `blinkDetected` is sticky once earned — it attests that a live person was
 * present during this attempt, and eyes reopening should not retract it. The
 * attempt is reset explicitly (see `INITIAL_LIVENESS`) when a new capture
 * starts, which is the only thing that should clear it.
 */
export function applyFrame(
  state: LivenessState,
  metrics: FaceFrameMetrics | null,
): LivenessState {
  if (!metrics || metrics.leftEyeOpenProbability === null || metrics.rightEyeOpenProbability === null) {
    // No face in frame. Everything observed so far about the CURRENT face is
    // discarded except the blink, which already happened and was real.
    return { ...state, faceDetected: false, poseOk: false, eyesWereOpen: false };
  }

  const poseOk =
    Math.abs(metrics.yawDegrees) <= LIVENESS_THRESHOLDS.maxYawDegrees &&
    Math.abs(metrics.pitchDegrees) <= LIVENESS_THRESHOLDS.maxPitchDegrees;

  const bothOpen =
    metrics.leftEyeOpenProbability >= LIVENESS_THRESHOLDS.eyeOpenProbability &&
    metrics.rightEyeOpenProbability >= LIVENESS_THRESHOLDS.eyeOpenProbability;
  const bothClosed =
    metrics.leftEyeOpenProbability <= LIVENESS_THRESHOLDS.eyeClosedProbability &&
    metrics.rightEyeOpenProbability <= LIVENESS_THRESHOLDS.eyeClosedProbability;

  // A blink is only counted as open → closed. Requiring the prior open state is
  // what stops a still photo of closed eyes from registering one.
  const blinkDetected = state.blinkDetected || (state.eyesWereOpen && bothClosed);

  return {
    faceDetected: true,
    poseOk,
    blinkDetected,
    eyesWereOpen: bothOpen ? true : state.eyesWereOpen,
  };
}

/**
 * Whether a capture should be allowed to proceed.
 *
 * Takes only the three public checks, not the full internal state, so the
 * Redux-held `LivenessProgress` can be passed directly — `eyesWereOpen` is
 * bookkeeping for the blink transition and no caller outside this module
 * should need to carry it.
 */
export function isReadyToCapture(
  state: Pick<LivenessState, 'faceDetected' | 'poseOk' | 'blinkDetected'>,
): boolean {
  return state.faceDetected && state.poseOk && state.blinkDetected;
}
