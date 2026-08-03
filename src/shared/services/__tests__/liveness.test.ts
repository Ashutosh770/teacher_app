import {
  applyFrame,
  isReadyToCapture,
  INITIAL_LIVENESS,
  type FaceFrameMetrics,
} from '../liveness';

const frame = (over: Partial<FaceFrameMetrics> = {}): FaceFrameMetrics => ({
  leftEyeOpenProbability: 0.95,
  rightEyeOpenProbability: 0.95,
  yawDegrees: 0,
  pitchDegrees: 0,
  ...over,
});

const closed = { leftEyeOpenProbability: 0.05, rightEyeOpenProbability: 0.05 };

describe('liveness evaluation', () => {
  it('detects a face and an acceptable pose', () => {
    const state = applyFrame(INITIAL_LIVENESS, frame());
    expect(state.faceDetected).toBe(true);
    expect(state.poseOk).toBe(true);
  });

  it('rejects an over-rotated head as pose-not-ok', () => {
    expect(applyFrame(INITIAL_LIVENESS, frame({ yawDegrees: 40 })).poseOk).toBe(false);
    expect(applyFrame(INITIAL_LIVENESS, frame({ pitchDegrees: -35 })).poseOk).toBe(false);
  });

  it('clears face and pose when the face leaves the frame', () => {
    const seen = applyFrame(INITIAL_LIVENESS, frame());
    const gone = applyFrame(seen, null);
    expect(gone.faceDetected).toBe(false);
    expect(gone.poseOk).toBe(false);
  });

  it('counts a blink only as an open → closed transition', () => {
    let state = applyFrame(INITIAL_LIVENESS, frame());
    expect(state.blinkDetected).toBe(false);
    state = applyFrame(state, frame(closed));
    expect(state.blinkDetected).toBe(true);
  });

  it('does NOT count closed eyes that were never seen open', () => {
    // A still photo of someone with their eyes shut. Without the prior-open
    // requirement this would register a blink and defeat the only anti-spoof
    // check in the flow.
    const state = applyFrame(INITIAL_LIVENESS, frame(closed));
    expect(state.blinkDetected).toBe(false);
  });

  it('never registers a blink from a static open-eyed photo, however many frames', () => {
    let state = INITIAL_LIVENESS;
    for (let i = 0; i < 60; i += 1) {
      state = applyFrame(state, frame());
    }
    expect(state.blinkDetected).toBe(false);
    expect(isReadyToCapture(state)).toBe(false);
  });

  it('keeps a blink once earned, even after the eyes reopen', () => {
    let state = applyFrame(INITIAL_LIVENESS, frame());
    state = applyFrame(state, frame(closed));
    state = applyFrame(state, frame());
    expect(state.blinkDetected).toBe(true);
  });

  it('keeps a blink across the face briefly leaving the frame', () => {
    let state = applyFrame(INITIAL_LIVENESS, frame());
    state = applyFrame(state, frame(closed));
    state = applyFrame(state, null);
    expect(state.blinkDetected).toBe(true);
  });

  it('only allows capture once all three checks pass', () => {
    let state = applyFrame(INITIAL_LIVENESS, frame({ yawDegrees: 40 }));
    expect(isReadyToCapture(state)).toBe(false); // pose bad, no blink

    state = applyFrame(state, frame());
    expect(isReadyToCapture(state)).toBe(false); // pose ok, still no blink

    state = applyFrame(state, frame(closed));
    state = applyFrame(state, frame());
    expect(isReadyToCapture(state)).toBe(true);
  });

  it('ignores a partial blink (one eye only)', () => {
    let state = applyFrame(INITIAL_LIVENESS, frame());
    state = applyFrame(state, frame({ leftEyeOpenProbability: 0.05 }));
    expect(state.blinkDetected).toBe(false);
  });
});
