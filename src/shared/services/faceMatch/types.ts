import type { FaceEnrollmentRecord } from '../../types';

/**
 * A single captured camera frame handed to the face-match provider.
 *
 * NOTE: `faceCapture.ts` (added by a sibling task) may also describe a frame
 * shape. If so, the two definitions are structurally identical; this remains
 * the canonical definition consumed by the face-match provider contract.
 */
export interface CapturedFrame {
  uri: string;
  width: number;
  height: number;
}

export interface FaceMatchResult {
  confidence: number; // 0..100
  personId: string | null; // matched enrollee, or null
}

export interface RosterCandidate {
  personId: string;
  enrollment: FaceEnrollmentRecord;
}

export interface FaceMatchProvider {
  readonly mode: 'real' | 'mock';
  // staff 1:1 verification against a single enrollment
  matchOne(frame: CapturedFrame, enrollment: FaceEnrollmentRecord): Promise<FaceMatchResult>;
  // student 1:N against roster candidates (best match)
  matchRoster(frame: CapturedFrame, candidates: RosterCandidate[]): Promise<FaceMatchResult>;
  // derive a reusable enrollment record from N capture frames
  deriveEnrollment(frames: CapturedFrame[]): Promise<FaceEnrollmentRecord>;
}
