/**
 * Server roster matching — outcome mapping.
 *
 * Every case here caused, or would cause, a student to be marked wrongly:
 * trusting the nearest-student id on a non-match marks a stranger as whoever
 * they resemble, and collapsing "no face in this frame" into "service down"
 * pauses a scan that is working perfectly. Both are invisible in a device
 * walkthrough until they misfire.
 */
jest.mock('../api', () => ({ apiService: { postForm: jest.fn() } }));

import { apiService } from '../api';
import { matchRosterOnServer } from '../serverRosterMatch';
import type { CapturedFrame } from '../faceMatch/types';

const postForm = apiService.postForm as jest.Mock;
const FRAME: CapturedFrame = { uri: 'file:///scan.jpg', width: 1280, height: 720 };

beforeEach(() => postForm.mockReset());

it('returns the matched student when the server accepts', async () => {
  postForm.mockResolvedValue({
    success: true,
    data: { match: true, studentId: 'bipin', confidence: 89.4, threshold: 0.68 },
  });

  const result = await matchRosterOnServer(FRAME, 'X-A', []);

  expect(result).toEqual({
    kind: 'result',
    personId: 'bipin',
    confidence: 89.4,
    thresholdPercent: 68,
  });
});

it('discards the studentId when the server says no match', async () => {
  // The server names the NEAREST student even when it rejects the match. Using
  // that id directly would mark a stranger as whoever they looked most like —
  // the same class of bug as the mock matcher this replaced.
  postForm.mockResolvedValue({
    success: true,
    data: { match: false, studentId: 'bipin', confidence: 10.2, threshold: 0.68 },
  });

  const result = await matchRosterOnServer(FRAME, 'X-A', []);

  expect(result).toMatchObject({ kind: 'result', personId: null, confidence: 10.2 });
});

it('reports a frame with no face as no_face, NOT as a failure', async () => {
  // The common case while panning a camera across a room. Treated as a service
  // failure it trips the consecutive-timeout limit and pauses the scan.
  postForm.mockResolvedValue({ success: false, status: 422, error: 'No face detected' });

  expect(await matchRosterOnServer(FRAME, 'X-A', [])).toEqual({ kind: 'no_face' });
});

it('reports a refusal as rejected, so the caller stops instead of retrying', async () => {
  postForm.mockResolvedValue({
    success: false,
    status: 403,
    error: 'You are not assigned to this class',
  });

  expect(await matchRosterOnServer(FRAME, 'X-A', [])).toEqual({
    kind: 'rejected',
    message: 'You are not assigned to this class',
  });
});

it('reports a transport failure as unavailable, which is worth retrying', async () => {
  postForm.mockRejectedValue(new Error('Network request failed'));

  expect(await matchRosterOnServer(FRAME, 'X-A', [])).toMatchObject({ kind: 'unavailable' });
});

it('reports a server error as unavailable rather than a refusal', async () => {
  postForm.mockResolvedValue({ success: false, status: 503, error: 'upstream unavailable' });

  expect(await matchRosterOnServer(FRAME, 'X-A', [])).toMatchObject({ kind: 'unavailable' });
});

it('sends the class and every excluded student', async () => {
  postForm.mockResolvedValue({
    success: true,
    data: { match: false, studentId: null, confidence: 0, threshold: 0.68 },
  });

  await matchRosterOnServer(FRAME, 'X-A', ['already-1', 'already-2']);

  const [endpoint, form] = postForm.mock.calls[0];
  expect(endpoint).toBe('/student-attendance/verify-scan');
  // Excluding students already found shrinks the gallery, and a smaller gallery
  // is a smaller chance of a false accept — so this is correctness, not speed.
  expect(form.getAll('excludeIds')).toEqual(['already-1', 'already-2']);
  expect(form.get('classId')).toBe('X-A');
});
