import { store } from '../../../store';
import {
  hydrateQueue,
  addToQueue,
  updateItemStatus,
  markItemFailed,
  retryItem,
  clearSyncedItems,
  setSyncing,
} from '../state/offlineSyncSlice';
import { apiService } from '../../../shared/services/api';
import { SyncQueueItem } from '../../../shared/types';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import { loadPersistedQueue, markQueuePersisted } from './queuePersistence';

// Default retry budget for items that do not carry an explicit `maxAttempts`
// (e.g. non-attendance modules). Preserves the pre-existing policy.
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

// Attendance-related modules carry a per-item retry cap of
// `attendanceConfig.offline.maxSyncAttempts` (5) and retain a `failed` status
// instead of being dropped (Req 15.2, 15.5). Other modules keep the default
// policy so they are unaffected.
const ATTENDANCE_MODULES = new Set<string>([
  'staffAttendance',
  'studentAttendance',
  'faceEnrollment',
]);

/**
 * Resolve the retry budget for a queue item. Attendance modules default to
 * `attendanceConfig.offline.maxSyncAttempts`; everything else falls back to
 * `MAX_RETRIES`. An explicit `maxAttempts` on the item always wins.
 */
function resolveMaxAttempts(item: Pick<SyncQueueItem, 'module' | 'maxAttempts'>): number {
  if (typeof item.maxAttempts === 'number') return item.maxAttempts;
  return ATTENDANCE_MODULES.has(item.module) ? attendanceConfig.offline.maxSyncAttempts : MAX_RETRIES;
}

/**
 * Rehydrate the sync queue from persistent storage on app launch so queued
 * actions survive restarts/reboots (Req 15.1). Reads the persisted snapshot
 * from appStorage and dispatches it into the slice. Safe to call once at
 * startup; a no-op when nothing has been persisted yet.
 */
export async function hydrateSyncQueue(): Promise<void> {
  const stored = await loadPersistedQueue();
  if (!stored) return;
  store.dispatch(hydrateQueue(stored));
  // Sync the persistence guard to the newly loaded queue so the store
  // subscriber does not immediately rewrite an identical snapshot.
  markQueuePersisted(store.getState().offlineSync.queue);
}

/**
 * Add an item to the sync queue. Called by other modules when data changes.
 *
 * Attendance-related modules ('staffAttendance', 'studentAttendance',
 * 'faceEnrollment') are stamped with a `maxAttempts` retry budget of
 * `attendanceConfig.offline.maxSyncAttempts` (5) so they retry up to 5 times
 * and are retained as `failed` afterwards (Req 15.2, 15.5). Callers may pass an
 * explicit `maxAttempts` to override; non-attendance items keep it undefined
 * and fall back to the default retry policy.
 */
export function queueForSync(
  module: string,
  action: string,
  payload: unknown,
  maxAttempts?: number
) {
  const id = `${module}-${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const resolvedMaxAttempts =
    typeof maxAttempts === 'number'
      ? maxAttempts
      : ATTENDANCE_MODULES.has(module)
        ? attendanceConfig.offline.maxSyncAttempts
        : undefined;
  store.dispatch(
    addToQueue({
      id,
      module,
      action,
      payload,
      timestamp: Date.now(),
      ...(resolvedMaxAttempts !== undefined ? { maxAttempts: resolvedMaxAttempts } : {}),
    })
  );
}

/**
 * Process the sync queue. Called when network connectivity is restored.
 */
export async function processSyncQueue() {
  const state = store.getState().offlineSync;
  if (state.isSyncing) return;

  // Process pending items plus previously-`failed` items that still have retry
  // budget remaining, so failed attendance records are re-attempted when
  // connectivity returns (Req 15.2). Items that have exhausted their budget stay
  // `failed` and are left in the queue.
  const itemsToProcess = state.queue.filter(item => {
    if (item.status === 'pending') return true;
    if (item.status === 'failed') return item.retryCount < resolveMaxAttempts(item);
    return false;
  });
  if (itemsToProcess.length === 0) return;

  store.dispatch(setSyncing(true));

  for (const item of itemsToProcess) {
    store.dispatch(updateItemStatus({ id: item.id, status: 'syncing' }));

    const success = await syncItem(item);
    if (!success) {
      const maxAttempts = resolveMaxAttempts(item);
      // `item.retryCount` is the count before this attempt; add 1 for the
      // attempt just made. Only mark permanently `failed` once the item has
      // reached its cap; otherwise requeue as `pending` for a later pass.
      if (item.retryCount + 1 >= maxAttempts) {
        store.dispatch(markItemFailed(item.id));
      } else {
        // Exponential backoff before requeueing.
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, item.retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        store.dispatch(retryItem(item.id));
      }
    }
  }

  store.dispatch(clearSyncedItems());
  store.dispatch(setSyncing(false));
}

async function syncItem(item: SyncQueueItem): Promise<boolean> {
  try {
    const response = await apiService.post(`/sync/${item.module}/${item.action}`, item.payload);
    return response.success;
  } catch {
    return false;
  }
}
