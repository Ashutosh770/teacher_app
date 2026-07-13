import { appStorage } from '../../../shared/services/storage';
import { SyncQueueItem } from '../../../shared/types';

/**
 * Stable appStorage key under which the offline sync queue is persisted so it
 * survives app restarts/reboots (Req 15.1).
 */
export const QUEUE_STORAGE_KEY = 'offlineSync:queue';

// Reference to the last queue snapshot we persisted. Used to guard against
// redundant writes when the store notifies subscribers for unrelated state
// changes (the queue array reference only changes when the queue is mutated).
let lastPersistedQueue: SyncQueueItem[] | null = null;

/**
 * Persist the given queue snapshot to appStorage.
 *
 * Skips the write when the queue reference is unchanged since the last persist,
 * so store subscriptions triggered by non-queue state changes are cheap no-ops.
 * The write is fire-and-forget; persistence failures must not block the UI.
 */
export function persistQueue(queue: SyncQueueItem[]): void {
  if (queue === lastPersistedQueue) return;
  lastPersistedQueue = queue;
  void appStorage.set(QUEUE_STORAGE_KEY, queue).catch(() => {
    // Best-effort persistence; reset the guard so a later mutation retries.
    lastPersistedQueue = null;
  });
}

/**
 * Read the persisted queue from appStorage. Returns null when nothing is stored
 * or the stored value is not a valid array.
 */
export async function loadPersistedQueue(): Promise<SyncQueueItem[] | null> {
  const stored = await appStorage.get<SyncQueueItem[]>(QUEUE_STORAGE_KEY);
  return Array.isArray(stored) ? stored : null;
}

/**
 * Mark a queue snapshot as already persisted without writing it. Called after
 * rehydration so the persistence subscriber does not immediately rewrite the
 * freshly loaded queue.
 */
export function markQueuePersisted(queue: SyncQueueItem[]): void {
  lastPersistedQueue = queue;
}
