import { store } from '../../../store';
import {
  addToQueue,
  updateItemStatus,
  markItemFailed,
  clearSyncedItems,
  setSyncing,
} from '../state/offlineSyncSlice';
import { apiService } from '../../../shared/services/api';
import { SyncQueueItem } from '../../../shared/types';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Add an item to the sync queue. Called by other modules when data changes.
 */
export function queueForSync(module: string, action: string, payload: unknown) {
  const id = `${module}-${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  store.dispatch(
    addToQueue({
      id,
      module,
      action,
      payload,
      timestamp: Date.now(),
    })
  );
}

/**
 * Process the sync queue. Called when network connectivity is restored.
 */
export async function processSyncQueue() {
  const state = store.getState().offlineSync;
  if (state.isSyncing) return;

  const pendingItems = state.queue.filter(item => item.status === 'pending');
  if (pendingItems.length === 0) return;

  store.dispatch(setSyncing(true));

  for (const item of pendingItems) {
    store.dispatch(updateItemStatus({ id: item.id, status: 'syncing' }));

    const success = await syncItem(item);
    if (!success) {
      if (item.retryCount >= MAX_RETRIES - 1) {
        store.dispatch(markItemFailed(item.id));
      } else {
        // Exponential backoff
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, item.retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        store.dispatch(updateItemStatus({ id: item.id, status: 'pending' }));
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
