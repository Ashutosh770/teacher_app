/**
 * Offline template caching and matching.
 *
 * The model itself cannot be exercised here (no weights, and TFLite needs a
 * device), but the logic around it can — and it is the part that decides
 * whether someone is marked present without a network, so it should not rest on
 * a device walkthrough alone.
 */
jest.mock('../api', () => ({ apiService: { get: jest.fn() } }));
jest.mock('../faceMatch/mobileFaceNet', () => ({
  MOBILE_MODEL_VERSION: 'mobilefacenet-128',
  MOBILE_EMBEDDING_DIM: 128,
  cosineSimilarity: (a: ArrayLike<number>, b: ArrayLike<number>) => {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
    return dot;
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getItem: jest.fn(async (k: string) => store.get(k) ?? null),
    removeItem: jest.fn(async (k: string) => void store.delete(k)),
    clear: jest.fn(async () => void store.clear()),
  };
});

import { apiService } from '../api';
import { appStorage } from '../storage';
import {
  refreshOfflineTemplates,
  getOfflineTemplates,
  clearOfflineTemplates,
  matchAgainstTemplates,
  OFFLINE_MATCH_THRESHOLD,
  TEMPLATE_CACHE_TTL_MS,
  type CachedOfflineTemplates,
} from '../offlineFaceTemplates';

const getMock = apiService.get as jest.Mock;

/** A unit vector pointing along one axis, so similarities are exactly predictable. */
function unitVector(axis: number, dim = 128): number[] {
  const v = new Array(dim).fill(0);
  v[axis] = 1;
  return v;
}

function cached(over: Partial<CachedOfflineTemplates> = {}): CachedOfflineTemplates {
  return {
    personId: 'teacher-1',
    modelVersion: 'mobilefacenet-128',
    embeddingDim: 128,
    templates: [
      { poseIndex: -1, embedding: unitVector(0) },
      { poseIndex: 0, embedding: unitVector(1) },
    ],
    fetchedAt: new Date().toISOString(),
    ...over,
  };
}

beforeEach(async () => {
  getMock.mockReset();
  await appStorage.clear();
});

describe('refreshOfflineTemplates', () => {
  it('caches templates when the server has them', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        modelVersion: 'mobilefacenet-128',
        embeddingDim: 128,
        templates: [{ poseIndex: 0, embedding: unitVector(1) }],
        available: true,
      },
    });

    const result = await refreshOfflineTemplates('teacher-1');

    expect(result?.templates).toHaveLength(1);
    expect(await getOfflineTemplates('teacher-1')).not.toBeNull();
  });

  it('returns null — not an error — when the server has no offline templates', async () => {
    // The normal state until MobileFaceNet weights are configured. Treating it
    // as a failure would surface an error for a capability nobody enabled.
    getMock.mockResolvedValue({
      success: true,
      data: { modelVersion: 'mobilefacenet-128', embeddingDim: 128, templates: [], available: false },
    });

    expect(await refreshOfflineTemplates('teacher-1')).toBeNull();
    expect(await getOfflineTemplates('teacher-1')).toBeNull();
  });
});

describe('getOfflineTemplates', () => {
  it('discards templates produced by a different model', async () => {
    // Not merely stale — a different model means an unrelated vector space, and
    // matching across the two yields confident nonsense rather than a failure.
    await appStorage.set(
      'offlineFaceTemplates:staff:teacher-1',
      cached({ modelVersion: 'someotherface-256', embeddingDim: 256 }),
    );

    expect(await getOfflineTemplates('teacher-1')).toBeNull();
  });

  it('discards templates past the cache TTL', async () => {
    await appStorage.set(
      'offlineFaceTemplates:staff:teacher-1',
      cached({ fetchedAt: new Date(Date.now() - TEMPLATE_CACHE_TTL_MS - 1000).toISOString() }),
    );

    expect(await getOfflineTemplates('teacher-1')).toBeNull();
  });

  it('clearOfflineTemplates removes them (logout / consent withdrawal)', async () => {
    await appStorage.set('offlineFaceTemplates:staff:teacher-1', cached());
    await clearOfflineTemplates('teacher-1');
    expect(await getOfflineTemplates('teacher-1')).toBeNull();
  });
});

describe('matchAgainstTemplates', () => {
  it('takes the BEST pose, not an average', async () => {
    // Identical to pose 0, orthogonal to the centroid. Averaging would score
    // 0.5 and fail; taking the best scores 1.0 and passes — which is why the
    // server uses MAX and this must agree with it.
    const result = matchAgainstTemplates(Float32Array.from(unitVector(1)), cached());

    expect(result.similarity).toBeCloseTo(1, 5);
    expect(result.poseIndex).toBe(0);
    expect(result.matched).toBe(true);
  });

  it('rejects a face unlike every pose', async () => {
    const result = matchAgainstTemplates(Float32Array.from(unitVector(99)), cached());

    expect(result.similarity).toBeCloseTo(0, 5);
    expect(result.matched).toBe(false);
  });

  it('separates just-above from just-below the threshold', async () => {
    const templates = cached({ templates: [{ poseIndex: 0, embedding: unitVector(1) }] });

    // Deliberately NOT testing exactly AT the threshold: Float32Array cannot
    // represent 0.7 exactly, so an equality test there asserts a property of
    // float rounding rather than of the matching logic.
    const probeAt = (similarity: number) => {
      const v = new Array(128).fill(0);
      v[1] = similarity;
      v[2] = Math.sqrt(1 - similarity ** 2);
      return Float32Array.from(v);
    };

    expect(matchAgainstTemplates(probeAt(OFFLINE_MATCH_THRESHOLD + 0.05), templates).matched).toBe(
      true,
    );
    expect(matchAgainstTemplates(probeAt(OFFLINE_MATCH_THRESHOLD - 0.05), templates).matched).toBe(
      false,
    );
  });

  it('scores 0 against templates of the wrong dimension rather than guessing', async () => {
    const mismatched = cached({ templates: [{ poseIndex: 0, embedding: [1, 0, 0] }] });

    const result = matchAgainstTemplates(Float32Array.from(unitVector(0)), mismatched);

    expect(result.similarity).toBe(0);
    expect(result.matched).toBe(false);
  });

  it('reports no match when there are no templates at all', async () => {
    const result = matchAgainstTemplates(Float32Array.from(unitVector(0)), cached({ templates: [] }));

    expect(result).toEqual({ matched: false, similarity: 0, poseIndex: null });
  });
});
