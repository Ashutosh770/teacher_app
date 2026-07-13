/**
 * Property-based tests for Correctness Property 9: Offline queue durability.
 *
 * Queuing then rehydrating from `appStorage` yields an equivalent queue; a
 * record is never lost while it has remaining sync attempts.
 *
 * `@react-native-async-storage/async-storage` is mocked with an in-memory store
 * so `appStorage.set`/`get` (JSON round-trip) work under Node. The offline-sync
 * reducer is exercised to build realistic queues before persist/rehydrate.
 *
 * **Validates: Requirements 15.1, 15.2, 15.5**
 */

// --- In-memory AsyncStorage mock (must precede the storage import chain) ------
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      getAllKeys: jest.fn(async () => Object.keys(store)),
    },
  };
});

import fc from 'fast-check';

import type { SyncQueueItem } from '../../../../shared/types';
import { appStorage } from '../../../../shared/services/storage';
import {
  QUEUE_STORAGE_KEY,
  persistQueue,
  loadPersistedQueue,
} from '../queuePersistence';
import reducer, { hydrateQueue, addToQueue } from '../../state/offlineSyncSlice';

// Mirrors MAX_QUEUE_SIZE in offlineSyncSlice (module-private constant).
const MAX_QUEUE_SIZE = 1000;
// Default retry policy for items without an explicit `maxAttempts` (design note
// Req 15.2: MAX_RETRIES = 3; attendance items carry maxAttempts = 5).
const DEFAULT_MAX_ATTEMPTS = 3;

// Let the fire-and-forget `appStorage.set` inside persistQueue settle before we
// read it back (the write is a resolved-promise microtask under the mock).
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

const hasRemainingAttempts = (item: SyncQueueItem): boolean =>
  item.retryCount < (item.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

// JSON-round-trip-stable payload (no NaN/Infinity/-0/undefined leaves).
const payloadArb: fc.Arbitrary<unknown> = fc.dictionary(
  fc.string(),
  fc.oneof(fc.string(), fc.integer(), fc.boolean()),
);

// A full SyncQueueItem with a unique id so presence-by-id checks are meaningful.
const syncQueueItemArb: fc.Arbitrary<SyncQueueItem> = fc.record({
  id: fc.uuid(),
  module: fc.string(),
  action: fc.string(),
  payload: payloadArb,
  timestamp: fc.integer({ min: 0 }),
  status: fc.constantFrom<SyncQueueItem['status']>('pending', 'syncing', 'failed'),
  retryCount: fc.nat({ max: 10 }),
  maxAttempts: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
});

const uniqueQueueArb = (maxLength: number) =>
  fc.uniqueArray(syncQueueItemArb, {
    selector: item => item.id,
    maxLength,
  });

// Shape accepted by addToQueue (status/retryCount are assigned by the reducer).
const addPayloadArb = fc.record({
  id: fc.uuid(),
  module: fc.string(),
  action: fc.string(),
  payload: payloadArb,
  timestamp: fc.integer({ min: 0 }),
  maxAttempts: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
});

beforeEach(async () => {
  await appStorage.clear();
});

describe('offline queue durability — Property 9', () => {
  it('round-trips an arbitrary queue: persist then load yields an equivalent queue', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueQueueArb(60), async queue => {
        await appStorage.clear();
        // Each property run supplies a fresh array reference, so persistQueue's
        // reference-equality guard does not suppress the write.
        persistQueue(queue);
        await flush();

        const loaded = await loadPersistedQueue();
        expect(loaded).toEqual(queue);
      }),
      { numRuns: 100 },
    );
  });

  it('never loses a record with remaining attempts across a reducer build → persist → rehydrate cycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueQueueArb(40),
        fc.array(addPayloadArb, { minLength: 0, maxLength: 40 }),
        async (initial, additions) => {
          await appStorage.clear();

          // Build a live queue: hydrate a persisted snapshot, then enqueue more.
          let state = reducer(undefined, hydrateQueue(initial));
          for (const add of additions) {
            state = reducer(state, addToQueue(add));
          }

          // Persist the resulting queue (fresh array from the reducer) and load.
          persistQueue(state.queue);
          await flush();

          const loaded = await loadPersistedQueue();
          expect(loaded).not.toBeNull();

          // Rehydrate into a fresh reducer state.
          const rehydrated = reducer(undefined, hydrateQueue(loaded ?? []));
          const survivingIds = new Set(rehydrated.queue.map(i => i.id));

          // Every item that still has retry budget must survive the round-trip.
          for (const item of state.queue) {
            if (hasRemainingAttempts(item)) {
              expect(survivingIds.has(item.id)).toBe(true);
            }
          }

          // Capacity invariant: rehydration never exceeds MAX_QUEUE_SIZE.
          expect(rehydrated.queue.length).toBeLessThanOrEqual(MAX_QUEUE_SIZE);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('persists under the stable queue storage key', async () => {
    const queue: SyncQueueItem[] = [
      {
        id: 'a1',
        module: 'staffAttendance',
        action: 'markAttendance',
        payload: { ok: true },
        timestamp: 1,
        status: 'pending',
        retryCount: 0,
        maxAttempts: 5,
      },
    ];
    persistQueue(queue);
    await flush();

    const direct = await appStorage.get<SyncQueueItem[]>(QUEUE_STORAGE_KEY);
    expect(direct).toEqual(queue);
  });
});
