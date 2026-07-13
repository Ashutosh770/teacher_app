/**
 * Property-based tests for the unresolved-detections FIFO cap in
 * `modules/studentAttendance/state/studentAttendanceSlice.ts` (task 12.4).
 *
 * Validates design Correctness Property 5 (Unresolved-detections FIFO cap):
 * over any sequence of additions, the list length never exceeds the cap, and
 * once full, adding a new entry drops exactly the oldest (front) entry. Order
 * is preserved: entries are appended to the end and dropped from the front, so
 * the retained items are always the most-recent `cap` entries in insertion
 * order.
 *
 * Two surfaces are exercised:
 *  - the pure `capUnresolved(list, item, cap)` helper over an arbitrary cap
 *    (including the `cap <= 0` degenerate case), and
 *  - the real `addUnresolvedDetection` reducer, which caps at
 *    `attendanceConfig.face.unresolvedCap` (50).
 *
 * Detections carry unique ids so the retained set can be compared by identity
 * against the expected most-recent window.
 *
 * Validates: Requirements 10.4
 * Property: 5
 */

import fc from 'fast-check';
import reducer, {
  addUnresolvedDetection,
  capUnresolved,
} from '../studentAttendanceSlice';
import { attendanceConfig } from '../../../../shared/config/attendanceConfig';
import type { UnresolvedDetection } from '../../../../shared/types/attendance';

const REDUCER_CAP = attendanceConfig.face.unresolvedCap; // 50

type SliceState = ReturnType<typeof reducer>;

/**
 * A sequence of uniquely-id'd detections. Each detection's id encodes its
 * insertion index so retained entries can be compared against the expected
 * most-recent window by identity.
 */
const detectionsArb = (minLength: number, maxLength: number) =>
  fc
    .record({
      count: fc.integer({ min: minLength, max: maxLength }),
      confidences: fc.array(fc.double({ min: 0, max: 100, noNaN: true }), {
        minLength: maxLength,
        maxLength: maxLength,
      }),
      timestamps: fc.array(fc.integer({ min: 0, max: 10_000_000 }), {
        minLength: maxLength,
        maxLength: maxLength,
      }),
    })
    .map(({ count, confidences, timestamps }): UnresolvedDetection[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `det-${i}`,
        confidence: confidences[i],
        timestamp: timestamps[i],
      })),
    );

describe('capUnresolved — Property 5: unresolved-detections FIFO cap (pure helper)', () => {
  it('never exceeds cap, appends to end, and drops the oldest first when full', () => {
    fc.assert(
      fc.property(
        detectionsArb(0, 120),
        fc.integer({ min: 1, max: 60 }),
        (detections, cap) => {
          let list: UnresolvedDetection[] = [];
          const seen: UnresolvedDetection[] = [];

          for (const item of detections) {
            const prevLen = list.length;
            list = capUnresolved(list, item, cap);
            seen.push(item);

            // Length invariant: never exceeds the cap.
            expect(list.length).toBeLessThanOrEqual(cap);

            // The newest item is always retained at the end (append order).
            expect(list[list.length - 1].id).toBe(item.id);

            // FIFO: when the list was full, adding drops exactly the oldest.
            if (prevLen === cap) {
              expect(list.length).toBe(cap);
            }

            // Retained items are exactly the most-recent `cap` insertions,
            // in insertion order (dropped from the front).
            const expected = seen.slice(Math.max(0, seen.length - cap));
            expect(list.map(d => d.id)).toEqual(expected.map(d => d.id));
          }
        },
      ),
    );
  });

  it('returns an empty list when cap <= 0', () => {
    fc.assert(
      fc.property(
        detectionsArb(0, 20),
        fc.integer({ min: -10, max: 0 }),
        (detections, cap) => {
          let list: UnresolvedDetection[] = [];
          for (const item of detections) {
            list = capUnresolved(list, item, cap);
            expect(list).toEqual([]);
          }
        },
      ),
    );
  });

  it('does not mutate the input list', () => {
    fc.assert(
      fc.property(
        detectionsArb(1, 30),
        fc.integer({ min: 1, max: 20 }),
        (detections, cap) => {
          let list: UnresolvedDetection[] = [];
          for (const item of detections) {
            const before = [...list];
            const beforeRef = list;
            capUnresolved(list, item, cap);
            // Original array reference is untouched.
            expect(beforeRef).toEqual(before);
            list = capUnresolved(list, item, cap);
          }
        },
      ),
    );
  });
});

describe('addUnresolvedDetection reducer — Property 5: FIFO cap at 50', () => {
  it('never exceeds 50 and, once full, keeps the most-recent 50 in order', () => {
    fc.assert(
      fc.property(
        // Exercise more than 50 additions to hit the cap.
        detectionsArb(51, 200),
        detections => {
          let state: SliceState = reducer(undefined, { type: '@@INIT' });
          const added: UnresolvedDetection[] = [];

          for (const item of detections) {
            state = reducer(state, addUnresolvedDetection(item));
            added.push(item);

            // Length invariant always holds in state.
            expect(state.unresolvedDetections.length).toBeLessThanOrEqual(
              REDUCER_CAP,
            );

            // Retained entries equal the last `cap` added, in insertion order.
            const expected = added.slice(Math.max(0, added.length - REDUCER_CAP));
            expect(state.unresolvedDetections.map(d => d.id)).toEqual(
              expected.map(d => d.id),
            );
          }

          // After exceeding the cap, the list is exactly the last 50 added.
          expect(state.unresolvedDetections.length).toBe(REDUCER_CAP);
          const last50 = added.slice(added.length - REDUCER_CAP);
          expect(state.unresolvedDetections.map(d => d.id)).toEqual(
            last50.map(d => d.id),
          );
        },
      ),
    );
  });
});
