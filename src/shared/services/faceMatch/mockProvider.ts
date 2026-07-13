import type { FaceEnrollmentRecord } from '../../types';
import type {
  CapturedFrame,
  FaceMatchProvider,
  FaceMatchResult,
  RosterCandidate,
} from './types';

/**
 * Mock face-match provider (Requirements 5.7, 10.6).
 *
 * Produces fully deterministic, bounded [0, 100] confidence scores derived
 * from stable string hashing of the inputs. Identical inputs always yield
 * identical outputs, which keeps tests and offline demos reproducible without
 * a real face-recognition model.
 */

/**
 * A small, deterministic FNV-1a style string hash returning a non-negative
 * 32-bit integer. Stable across runs and platforms.
 */
function stableHash(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime multiply, kept in 32-bit unsigned range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  // Force to unsigned 32-bit.
  return hash >>> 0;
}

/** Map an arbitrary hash to an integer confidence within [0, 100] inclusive. */
function hashToConfidence(input: string): number {
  return stableHash(input) % 101; // 0..100 inclusive
}

/** Stable string signature of an enrollment record. */
function enrollmentSignature(enrollment: FaceEnrollmentRecord): string {
  return `${enrollment.personId}|${enrollment.personType}|${enrollment.embedding.join(',')}`;
}

function computeMatchOne(frame: CapturedFrame, enrollment: FaceEnrollmentRecord): FaceMatchResult {
  const confidence = hashToConfidence(`${frame.uri}::${enrollmentSignature(enrollment)}`);
  return { confidence, personId: enrollment.personId };
}

export const mockFaceMatchProvider: FaceMatchProvider = {
  mode: 'mock',

  async matchOne(frame: CapturedFrame, enrollment: FaceEnrollmentRecord): Promise<FaceMatchResult> {
    return computeMatchOne(frame, enrollment);
  },

  async matchRoster(
    frame: CapturedFrame,
    candidates: RosterCandidate[],
  ): Promise<FaceMatchResult> {
    let best: FaceMatchResult = { confidence: 0, personId: null };
    for (const candidate of candidates) {
      const confidence = hashToConfidence(
        `${frame.uri}::${candidate.personId}::${enrollmentSignature(candidate.enrollment)}`,
      );
      if (confidence > best.confidence) {
        best = { confidence, personId: candidate.personId };
      }
    }
    return best;
  },

  async deriveEnrollment(frames: CapturedFrame[]): Promise<FaceEnrollmentRecord> {
    const seed = frames.map((f) => `${f.uri}:${f.width}x${f.height}`).join('|');
    // Derive a small, deterministic embedding vector from the frame seed.
    const embedding: number[] = [];
    for (let i = 0; i < 8; i++) {
      // Normalize each hash bucket to a stable value in [0, 1).
      embedding.push((stableHash(`${seed}#${i}`) % 100000) / 100000);
    }
    // Deterministic personId derived from the frames so identical inputs map
    // to the same enrollment record.
    const personId = `mock-${stableHash(seed).toString(16)}`;
    // Deterministic, seed-independent timestamps (mock records are reproducible).
    const timestamp = new Date(0).toISOString();
    return {
      personId,
      personType: 'student',
      embedding,
      imageCount: frames.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },
};
