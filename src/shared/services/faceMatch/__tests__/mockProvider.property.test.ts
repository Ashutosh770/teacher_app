/**
 * Property-based tests for the mock `FaceMatchProvider` (design Correctness Property 7).
 *
 * Property 7: Mock provider determinism & range
 *   For identical inputs the mock provider returns identical scores; all scores
 *   lie in [0, 100].
 *     - Determinism: matchOne / matchRoster / deriveEnrollment called twice with
 *       the SAME inputs yield identical results.
 *     - Range: matchOne / matchRoster confidence always within [0, 100] inclusive
 *       (matchRoster with empty candidates returns {confidence: 0, personId: null}).
 *
 * **Validates: Requirements 5.7, 10.6**
 */
import fc from 'fast-check';
import type { FaceEnrollmentRecord } from '../../../types';
import { mockFaceMatchProvider } from '../mockProvider';
import type { CapturedFrame, RosterCandidate } from '../types';

/** Generator for a captured camera frame. */
const capturedFrame = (): fc.Arbitrary<CapturedFrame> =>
  fc.record({
    uri: fc.string(),
    width: fc.integer({ min: 0, max: 8192 }),
    height: fc.integer({ min: 0, max: 8192 }),
  });

/** Generator for a face enrollment record with random identity + embedding. */
const enrollmentRecord = (): fc.Arbitrary<FaceEnrollmentRecord> =>
  fc.record({
    personId: fc.string(),
    personType: fc.constantFrom<'staff' | 'student'>('staff', 'student'),
    embedding: fc.array(fc.double({ noNaN: true, noDefaultInfinity: true })),
    imageCount: fc.integer({ min: 0, max: 100 }),
    createdAt: fc.constant(new Date(0).toISOString()),
    updatedAt: fc.constant(new Date(0).toISOString()),
  });

/** Generator for a roster candidate. */
const rosterCandidate = (): fc.Arbitrary<RosterCandidate> =>
  fc.record({
    personId: fc.string(),
    enrollment: enrollmentRecord(),
  });

describe('mockFaceMatchProvider — Property 7: determinism & range', () => {
  it('matchOne is deterministic for identical inputs', async () => {
    await fc.assert(
      fc.asyncProperty(capturedFrame(), enrollmentRecord(), async (frame, enrollment) => {
        const a = await mockFaceMatchProvider.matchOne(frame, enrollment);
        const b = await mockFaceMatchProvider.matchOne(frame, enrollment);
        expect(a).toEqual(b);
      }),
    );
  });

  it('matchOne confidence is always within [0, 100]', async () => {
    await fc.assert(
      fc.asyncProperty(capturedFrame(), enrollmentRecord(), async (frame, enrollment) => {
        const result = await mockFaceMatchProvider.matchOne(frame, enrollment);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('matchRoster is deterministic for identical inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        capturedFrame(),
        fc.array(rosterCandidate()),
        async (frame, candidates) => {
          const a = await mockFaceMatchProvider.matchRoster(frame, candidates);
          const b = await mockFaceMatchProvider.matchRoster(frame, candidates);
          expect(a).toEqual(b);
        },
      ),
    );
  });

  it('matchRoster confidence is always within [0, 100] (empty roster => 0, null)', async () => {
    await fc.assert(
      fc.asyncProperty(
        capturedFrame(),
        fc.array(rosterCandidate()),
        async (frame, candidates) => {
          const result = await mockFaceMatchProvider.matchRoster(frame, candidates);
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(100);
          if (candidates.length === 0) {
            expect(result).toEqual({ confidence: 0, personId: null });
          }
        },
      ),
    );
  });

  it('deriveEnrollment is deterministic for identical inputs', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(capturedFrame()), async (frames) => {
        const a = await mockFaceMatchProvider.deriveEnrollment(frames);
        const b = await mockFaceMatchProvider.deriveEnrollment(frames);
        expect(a).toEqual(b);
      }),
    );
  });
});
