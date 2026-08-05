/**
 * Server-authoritative 1:N roster matching.
 *
 * Student recognition used to run on the device via `faceMatchProvider.
 * matchRoster`, and it could not have worked. Three things were wrong at once:
 *
 *  - `attendanceConfig.faceMatchMode` is `'mock'`, and the mock scores a
 *    candidate by hashing the frame's file path against the student id. The
 *    photo is never examined, so the "best match" is whichever student's hash
 *    happens to be highest for that file name — which is why two students were
 *    being marked as each other.
 *  - The real provider could not have helped: `extractEmbedding` throws
 *    unconditionally, as there is no on-device embedder.
 *  - Even with one, there is nothing to compare against. The roster's cached
 *    `enrollment.embedding` is `[]` by design — the backend stores the real
 *    512-D vector only in the face service.
 *
 * So the match now happens where the templates actually live. The server
 * derives the candidate set from `classId` after checking the caller's
 * entitlement to it, which also means the client can no longer widen the search
 * beyond one class.
 *
 * The server's verdict is final. `personId` is null unless the server said
 * match, and the threshold it used is returned rather than re-decided here, so
 * the device cannot accept a face the server rejected.
 */
import { apiService } from './api';
import type { CapturedFrame } from './faceMatch/types';

/**
 * What one scanned frame produced.
 *
 * These are kept apart because the scan loop must respond to them differently,
 * and collapsing them is a bug with real consequences: a frame containing no
 * face is the NORMAL case while a teacher pans a camera across a room, and
 * counting those as service failures paused the scan after three of them.
 */
export type ServerScanOutcome =
  /** The server ran a search. `personId` is null when nothing matched. */
  | { kind: 'result'; personId: string | null; confidence: number; thresholdPercent: number }
  /** No face in this frame. Expected constantly; skip the frame in silence. */
  | { kind: 'no_face' }
  /** The server refused (entitlement, bad request). Retrying cannot help. */
  | { kind: 'rejected'; message: string }
  /** The server could not be reached or did not answer. Retrying may help. */
  | { kind: 'unavailable'; message: string };

/**
 * Identifies one face against a class roster.
 *
 * `excludeIds` are students already marked present this session. Narrowing the
 * gallery as the scan proceeds is not just an optimisation: every candidate
 * removed is one fewer chance of a false accept.
 *
 * Never throws — every failure is one of the outcomes above, so the caller
 * cannot accidentally treat one kind of failure as another.
 */
export async function matchRosterOnServer(
  frame: CapturedFrame,
  classId: string,
  excludeIds: string[],
): Promise<ServerScanOutcome> {
  const form = new FormData();
  form.append('classId', classId);
  for (const id of excludeIds) {
    form.append('excludeIds', id);
  }
  form.append('file', {
    uri: frame.uri,
    name: 'scan.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  let response: {
    success: boolean;
    error?: string;
    status?: number;
    data?: {
      match: boolean;
      studentId: string | null;
      confidence: number | null;
      threshold: number;
    };
  };
  try {
    response = await apiService.postForm('/student-attendance/verify-scan', form);
  } catch {
    return { kind: 'unavailable', message: 'Could not reach the recognition service.' };
  }

  if (response.success && response.data) {
    const { match, studentId, confidence, threshold } = response.data;
    return {
      kind: 'result',
      // Trust the server's boolean, not the score: it returns the NEAREST
      // student even on a non-match, so reading `studentId` unconditionally
      // would mark a stranger as whoever they resembled most.
      personId: match ? studentId : null,
      confidence: confidence ?? 0,
      // `threshold` is a cosine similarity in 0..1; the UI works in percent.
      thresholdPercent: threshold * 100,
    };
  }

  // 422 is the face service reporting no detectable face in the frame.
  if (response.status === 422) {
    return { kind: 'no_face' };
  }

  // Any other 4xx is a refusal that will be repeated identically next frame.
  if (response.status !== undefined && response.status >= 400 && response.status < 500) {
    return {
      kind: 'rejected',
      message: response.error ?? 'The recognition request was refused.',
    };
  }

  return {
    kind: 'unavailable',
    message: response.error ?? 'The recognition service is unavailable.',
  };
}
