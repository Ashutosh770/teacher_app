/**
 * The teacher's own offline face templates, cached on the device.
 *
 * Offline attendance needs something to match against, and the phone never sees
 * enrollment photos — they are captured, uploaded and discarded. So the server
 * generates MobileFaceNet templates from the same captures and hands the person
 * their own set here.
 *
 * Scope is one person: the signed-in teacher. Staff verification is 1:1, so
 * there is no roster to hold and no reason for one teacher's device to carry
 * another's biometric templates.
 *
 * Refreshed opportunistically whenever the app is online, because a stale cache
 * is only a problem the moment connectivity is gone — which is exactly when it
 * cannot be fixed.
 */
import { apiService } from './api';
import { appStorage } from './storage';
import {
  cosineSimilarity,
  MOBILE_EMBEDDING_DIM,
  MOBILE_MODEL_VERSION,
} from './faceMatch/mobileFaceNet';

export interface OfflineTemplate {
  poseIndex: number;
  embedding: number[];
}

export interface CachedOfflineTemplates {
  personId: string;
  modelVersion: string;
  embeddingDim: number;
  templates: OfflineTemplate[];
  fetchedAt: string;
}

/**
 * Offline match threshold — SEPARATE from ArcFace's 0.68.
 *
 * NOT YET CALIBRATED. MobileFaceNet's score distribution differs from
 * ArcFace's, so carrying 0.68 across would be an arbitrary number wearing a
 * validated one's clothes. This wants measuring against real same-person and
 * different-person pairs once real weights exist, and offline false-accepts
 * should be expected to be worse than online — that is the accepted trade for
 * working without a network, but it should be a measured figure.
 */
export const OFFLINE_MATCH_THRESHOLD = 0.7;

/**
 * How long a cached set stays usable.
 *
 * Templates only change on re-enrollment, so this is not about freshness so
 * much as bounding how long biometric data sits on a device that has stopped
 * checking in with the server.
 */
export const TEMPLATE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const storageKey = (personId: string) => `offlineFaceTemplates:staff:${personId}`;

/**
 * Fetches and caches the caller's templates. Returns null when the server has
 * none — which is the normal state until MobileFaceNet weights are configured,
 * not an error.
 */
export async function refreshOfflineTemplates(
  personId: string,
): Promise<CachedOfflineTemplates | null> {
  const response = await apiService.get<{
    modelVersion: string;
    embeddingDim: number;
    templates: OfflineTemplate[];
    available: boolean;
  }>('/faces/me/offline-templates');

  if (!response.success || !response.data?.available) {
    return null;
  }

  const cached: CachedOfflineTemplates = {
    personId,
    modelVersion: response.data.modelVersion,
    embeddingDim: response.data.embeddingDim,
    templates: response.data.templates,
    fetchedAt: new Date().toISOString(),
  };
  await appStorage.set(storageKey(personId), cached);
  return cached;
}

/**
 * The cached set, or null when absent, expired, or produced by a different
 * model than this device runs.
 *
 * The model check matters more than it looks: templates from another model are
 * not merely stale, they are in an unrelated vector space, and matching against
 * them yields confident nonsense rather than a visible failure.
 */
export async function getOfflineTemplates(
  personId: string,
): Promise<CachedOfflineTemplates | null> {
  const cached = await appStorage.get<CachedOfflineTemplates>(storageKey(personId));
  if (!cached) return null;

  if (cached.modelVersion !== MOBILE_MODEL_VERSION || cached.embeddingDim !== MOBILE_EMBEDDING_DIM) {
    await appStorage.remove(storageKey(personId));
    return null;
  }

  const age = Date.now() - new Date(cached.fetchedAt).getTime();
  if (age > TEMPLATE_CACHE_TTL_MS) {
    await appStorage.remove(storageKey(personId));
    return null;
  }

  return cached;
}

/** Removes a person's cached templates — used on logout and on consent withdrawal. */
export async function clearOfflineTemplates(personId: string): Promise<void> {
  await appStorage.remove(storageKey(personId));
}

export interface OfflineMatchResult {
  matched: boolean;
  /** Best similarity across the person's poses, 0..1. */
  similarity: number;
  /** Which pose matched best — useful for diagnosing a consistently weak angle. */
  poseIndex: number | null;
}

/**
 * Scores a live embedding against the cached templates.
 *
 * Takes the BEST pose rather than an average, mirroring the server's MAX: the
 * templates are deliberately different views of one face, so a correct frontal
 * match should not be penalised for failing to resemble the turned-head ones.
 */
export function matchAgainstTemplates(
  embedding: Float32Array,
  cached: CachedOfflineTemplates,
  threshold: number = OFFLINE_MATCH_THRESHOLD,
): OfflineMatchResult {
  let best = -1;
  let bestPose: number | null = null;

  for (const template of cached.templates) {
    const score = cosineSimilarity(embedding, template.embedding);
    if (score > best) {
      best = score;
      bestPose = template.poseIndex;
    }
  }

  if (bestPose === null) {
    return { matched: false, similarity: 0, poseIndex: null };
  }
  return { matched: best >= threshold, similarity: best, poseIndex: bestPose };
}
