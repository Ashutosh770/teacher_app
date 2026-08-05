/**
 * Single source of truth for tunable attendance constants (thresholds, timeouts,
 * geo-fence radius bounds, attempt caps, offline limits) and the face-match mode.
 *
 * Isolating these values here keeps requirement constants single-sourced so the
 * staff/student attendance flows and enrollment services all read the same values.
 *
 * Requirements: 2.7, 2.8, 3.1, 3.3, 5.4, 10.3, 15.1, 15.2
 */
export const attendanceConfig = {
  geoFence: {
    defaultRadiusMeters: 100, // Req 2.8 — fallback radius when unset
    minRadiusMeters: 10, // Req 2.7 — clamp lower bound
    maxRadiusMeters: 500, // Req 2.7 — clamp upper bound
    readingTimeoutMs: 15000, // Req 2.1 — single GPS reading timeout
    overallTimeoutMs: 30000, // Req 1.6 — overall acquisition timeout
    maxAccuracyMeters: 30, // Req 3.1 — accuracy tolerance
    maxAccuracyRetries: 3, // Req 3.3 — retries before manual fallback
  },
  face: {
    staffThreshold: 80, // Req 5.4 — staff 1:1 match threshold
    studentThreshold: 75, // Req 10.3 — student 1:N match threshold
    captureWindowMs: 10000, // Req 5.3/5.8 — face capture window
    matchTimeoutMs: 5000, // Req 5.3/5.9/10.8 — provider match timeout
    /**
     * Timeout for ONE server recognition during a student batch scan.
     *
     * Longer than `matchTimeoutMs` because it is a different operation: that
     * budget was set for an on-device match, while this uploads a photo and
     * waits for face detection plus a 1:N search. At 5s every frame on a school
     * network timed out, and three consecutive timeouts pause the scan — so the
     * scan appeared to be broken when it was only being cut off early.
     */
    scanMatchTimeoutMs: 15000, // Req 10.8/17.3 — server round trip per frame
    maxStaffAttempts: 3, // Req 5.5/5.6 — staff face attempt cap
    // One frame per pose in ENROLLMENT_POSES. Each becomes its own stored
    // template, matched on whichever scores best, so more distinct poses widen
    // the range of angles that verify cleanly. Capped at 5 because the backend's
    // enroll route accepts at most 5 files.
    minEnrollmentImages: 5, // Req 7/8 — one capture per guided pose
    scanFramesPerSecond: 2, // Req 10.2 — student scan frame rate
    consecutiveTimeoutLimit: 3, // Req 10.8/17.4 — pause after N timeouts
    unresolvedCap: 50, // Req 10.4 — unresolved detections FIFO cap
  },
  faceMatchMode: 'mock' as 'real' | 'mock',
  offline: {
    maxQueuedRecords: 500, // Req 15.1 — minimum offline queue capacity
    maxSyncAttempts: 5, // Req 15.2 — sync retries before marking failed
  },
} as const;

/**
 * Resolves the effective geo-fence radius in meters.
 *
 * Returns the default radius (100) when the configured radius is undefined/null,
 * otherwise clamps the value into the inclusive range [minRadiusMeters, maxRadiusMeters]
 * (i.e. [10, 500]).
 *
 * Requirements: 2.7, 2.8
 */
export function resolveGeoFenceRadius(radius?: number | null): number {
  const { defaultRadiusMeters, minRadiusMeters, maxRadiusMeters } =
    attendanceConfig.geoFence;

  if (radius === undefined || radius === null || Number.isNaN(radius)) {
    return defaultRadiusMeters;
  }

  return Math.min(Math.max(radius, minRadiusMeters), maxRadiusMeters);
}
