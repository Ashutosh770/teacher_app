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

const MAX_QUEUE_SIZE = 1000;

const offlineSyncSlice = createSlice({
  name: 'offlineSync',
  initialState,
  reducers: {
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
    clearSyncedItems(state) {
      state.queue = state.queue.filter(item => item.status !== 'pending');
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
  addToQueue,
  removeFromQueue,
  updateItemStatus,
  markItemFailed,
  clearSyncedItems,
  setSyncing,
  setConnected,
  setError,
  discardFailedItem,
} = offlineSyncSlice.actions;

export default offlineSyncSlice.reducer;
