import { attendanceConfig } from '../../config/attendanceConfig';
import { mockFaceMatchProvider } from './mockProvider';
import { realFaceMatchProvider } from './realProvider';
import type { FaceMatchProvider } from './types';

/**
 * Provider selection for the face-match abstraction (Requirements 5.3, 5.4,
 * 10.2, 10.3).
 *
 * The selected provider is driven by `attendanceConfig.faceMatchMode`. The app
 * defaults to the real on-device provider; automated tests import
 * `mockFaceMatchProvider` directly for deterministic behavior, or flip the
 * config mode to `'mock'`.
 */
export const faceMatchProvider: FaceMatchProvider =
  attendanceConfig.faceMatchMode === 'mock'
    ? mockFaceMatchProvider
    : realFaceMatchProvider;

// Convenience re-exports of the contract types and both concrete providers.
export type {
  CapturedFrame,
  FaceMatchProvider,
  FaceMatchResult,
  RosterCandidate,
} from './types';
export { mockFaceMatchProvider } from './mockProvider';
export {
  realFaceMatchProvider,
  cosineSimilarity,
  similarityToScore,
  ProviderUnavailableError,
} from './realProvider';
