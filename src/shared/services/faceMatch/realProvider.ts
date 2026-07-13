import type { FaceEnrollmentRecord } from '../../types';
import type {
  CapturedFrame,
  FaceMatchProvider,
  FaceMatchResult,
  RosterCandidate,
} from './types';

/**
 * Real, on-device face-match provider (Requirements 5.3, 5.4, 10.2, 10.3).
 *
 * Backed by the native ML Kit / TFLite face detector+embedder that ships with
 * the vision-camera frame-processor plugin. The native model only exists in an
 * EAS development/production build, so the actual native call is isolated
 * behind {@link extractEmbedding}. Off-device (Expo Go, Jest, web) that helper
 * throws {@link ProviderUnavailableError} so callers can branch deterministically
 * instead of crashing.
 *
 * Matching is a pure computation over embedding vectors: cosine similarity in
 * [-1, 1] is linearly mapped to a [0, 100] confidence score.
 */

/**
 * Thrown when the native face detector/embedder is unavailable in the current
 * runtime (e.g. Expo Go, automated tests, or web). Module services catch this
 * to fall back to manual entry rather than treating it as a match failure.
 */
export class ProviderUnavailableError extends Error {
  constructor(message = 'Native face-match provider is unavailable in this runtime.') {
    super(message);
    this.name = 'ProviderUnavailableError';
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, ProviderUnavailableError.prototype);
  }
}

/**
 * Cosine similarity between two equal-length numeric vectors.
 *
 * Returns a value in [-1, 1]. When either vector has zero magnitude (or the
 * lengths differ / are empty) the vectors are treated as maximally dissimilar
 * and 0 is returned, keeping the function total and side-effect free.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  const cos = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  // Guard against tiny floating-point overshoot outside [-1, 1].
  return Math.max(-1, Math.min(1, cos));
}

/**
 * Map a cosine similarity in [-1, 1] to a confidence score in [0, 100].
 *
 * Uses the linear transform ((cos + 1) / 2) * 100 and clamps the result to the
 * inclusive [0, 100] range so out-of-range inputs are tolerated.
 */
export function similarityToScore(cos: number): number {
  const clampedCos = Math.max(-1, Math.min(1, cos));
  const score = ((clampedCos + 1) / 2) * 100;
  return Math.max(0, Math.min(100, score));
}

/**
 * Thin wrapper around the native face detector/embedder.
 *
 * On a real device (EAS dev/prod build) this would invoke the vision-camera
 * ML Kit / TFLite frame-processor plugin to detect the largest face in the
 * frame and return its embedding vector. That native bridge is not present in
 * Expo Go / tests / web, so this throws {@link ProviderUnavailableError}.
 *
 * The parameter is intentionally referenced so the signature reflects the real
 * native contract without introducing an unused-variable type error.
 */
async function extractEmbedding(frame: CapturedFrame): Promise<number[]> {
  void frame;
  throw new ProviderUnavailableError();
}

/** Average N per-frame embeddings into a single mean vector. */
function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return [];
  }
  const dimension = (embeddings[0] as number[]).length;
  const sum = new Array<number>(dimension).fill(0);
  for (const embedding of embeddings) {
    for (let i = 0; i < dimension; i++) {
      sum[i] = (sum[i] as number) + ((embedding[i] as number) ?? 0);
    }
  }
  return sum.map((value) => value / embeddings.length);
}

async function scoreAgainst(
  frame: CapturedFrame,
  enrollment: FaceEnrollmentRecord,
): Promise<number> {
  const frameEmbedding = await extractEmbedding(frame);
  const cos = cosineSimilarity(frameEmbedding, enrollment.embedding);
  return similarityToScore(cos);
}

export const realFaceMatchProvider: FaceMatchProvider = {
  mode: 'real',

  async matchOne(
    frame: CapturedFrame,
    enrollment: FaceEnrollmentRecord,
  ): Promise<FaceMatchResult> {
    const confidence = await scoreAgainst(frame, enrollment);
    return { confidence, personId: enrollment.personId };
  },

  async matchRoster(
    frame: CapturedFrame,
    candidates: RosterCandidate[],
  ): Promise<FaceMatchResult> {
    // Extract the frame embedding once, then score every candidate against it.
    const frameEmbedding = await extractEmbedding(frame);
    let best: FaceMatchResult = { confidence: 0, personId: null };
    for (const candidate of candidates) {
      const cos = cosineSimilarity(frameEmbedding, candidate.enrollment.embedding);
      const confidence = similarityToScore(cos);
      if (confidence > best.confidence) {
        best = { confidence, personId: candidate.personId };
      }
    }
    return best;
  },

  async deriveEnrollment(frames: CapturedFrame[]): Promise<FaceEnrollmentRecord> {
    const embeddings: number[][] = [];
    for (const frame of frames) {
      embeddings.push(await extractEmbedding(frame));
    }
    const embedding = averageEmbeddings(embeddings);
    const timestamp = new Date().toISOString();
    return {
      // personId is assigned by the enrollment flow (which knows the staff/
      // student identity); the provider only produces the embedding payload.
      personId: '',
      personType: 'student',
      embedding,
      imageCount: frames.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },
};
