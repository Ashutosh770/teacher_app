import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SyncQueueItem } from '../../../shared/types';

interface OfflineSyncState {
  queue: SyncQueueItem[];
  isSyncing: boolean;
  lastSyncTimestamp: string | null;
  isConnected: boolean;
  error: string | null;
}

const initialState: OfflineSyncState = {
  queue: [],
  isSyncing: false,
  lastSyncTimestamp: null,
  isConnected: true,
  error: null,
};

// Max in-memory queue capacity. Must stay >= attendanceConfig.offline.maxQueuedRecords (500).
const MAX_QUEUE_SIZE = 1000;

const offlineSyncSlice = createSlice({
  name: 'offlineSync',
  initialState,
  reducers: {
    hydrateQueue(state, action: PayloadAction<SyncQueueItem[]>) {
      // Replace the in-memory queue with a persisted snapshot loaded on launch.
      // Defensively cap at MAX_QUEUE_SIZE in case the stored queue exceeds capacity.
      state.queue = action.payload.slice(0, MAX_QUEUE_SIZE);
    },
    addToQueue(state, action: PayloadAction<Omit<SyncQueueItem, 'status' | 'retryCount'>>) {
      if (state.queue.length >= MAX_QUEUE_SIZE) {
        state.error = 'Sync queue is full. Please wait for pending items to sync.';
        return;
      }
      state.queue.push({
        ...action.payload,
        status: 'pending',
        retryCount: 0,
      });
    },
    removeFromQueue(state, action: PayloadAction<string>) {
      state.queue = state.queue.filter(item => item.id !== action.payload);
    },
    updateItemStatus(state, action: PayloadAction<{ id: string; status: SyncQueueItem['status'] }>) {
      const item = state.queue.find(i => i.id === action.payload.id);
      if (item) {
        item.status = action.payload.status;
        if (action.payload.status === 'failed') {
          item.retryCount += 1;
        }
      }
    },
    markItemFailed(state, action: PayloadAction<string>) {
      const item = state.queue.find(i => i.id === action.payload);
      if (item) {
        item.status = 'failed';
        item.retryCount += 1;
      }
    },
    // Record a failed attempt that still has retry budget remaining: count the
    // attempt and requeue the item as `pending` so it is re-attempted on the
    // next processing pass. Unlike `markItemFailed`, this keeps the item in the
    // active (non-failed) part of the queue. (Req 15.2)
    retryItem(state, action: PayloadAction<string>) {
      const item = state.queue.find(i => i.id === action.payload);
      if (item) {
        item.status = 'pending';
        item.retryCount += 1;
      }
    },
    clearSyncedItems(state) {
      // Remove only successfully-synced items (left in `syncing` state after a
      // processing pass). `pending` items are still queued and `failed` items
      // are RETAINED so a distinct sync-failed indicator can render and they
      // can be re-attempted on the next connectivity change (Req 15.5).
      state.queue = state.queue.filter(item => item.status !== 'syncing');
      state.lastSyncTimestamp = new Date().toISOString();
    },
    setSyncing(state, action: PayloadAction<boolean>) {
      state.isSyncing = action.payload;
    },
    setConnected(state, action: PayloadAction<boolean>) {
      state.isConnected = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    discardFailedItem(state, action: PayloadAction<string>) {
      state.queue = state.queue.filter(item => item.id !== action.payload);
    },
  },
});

export const {
  hydrateQueue,
  addToQueue,
  removeFromQueue,
  updateItemStatus,
  markItemFailed,
  retryItem,
  clearSyncedItems,
  setSyncing,
  setConnected,
  setError,
  discardFailedItem,
} = offlineSyncSlice.actions;

export default offlineSyncSlice.reducer;
