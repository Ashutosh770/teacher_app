import { useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useAppDispatch, useAppSelector } from '../../../store';
import { setConnected } from '../state/offlineSyncSlice';
import { processSyncQueue } from '../services/syncService';

/**
 * Cadence for the safety-net sync poll. Kept at 5s so a queued record is picked
 * up and — on success — its indicator cleared within 5 seconds of connectivity
 * being available (Req 15.3/15.4).
 */
const SYNC_POLL_INTERVAL_MS = 5000;

/**
 * App-level offline-sync driver (Req 15.3/15.4). Mounted once inside the Redux
 * Provider (see `AppNavigator`) so both attendance modules' derived
 * pending/failed indicators clear promptly:
 *
 *  1. On reconnect — a NetInfo listener mirrors connectivity into the slice and
 *     kicks off {@link processSyncQueue} immediately, so a successful sync
 *     removes the queued record (via `clearSyncedItems`) and its indicator
 *     disappears right away.
 *  2. Safety-net poll — while online with a non-empty queue, re-attempt
 *     processing on a <=5s cadence. This guarantees clearing within 5s even if a
 *     reconnect event was missed, and re-drives records left `failed` with retry
 *     budget. `processSyncQueue` early-returns when already syncing or when
 *     nothing is processable, so this never tight-loops; the interval is also
 *     torn down once the queue drains (`queueLength === 0`).
 */
export function useOfflineSyncProcessor(): void {
  const dispatch = useAppDispatch();
  const isConnected = useAppSelector(s => s.offlineSync.isConnected);
  const queueLength = useAppSelector(s => s.offlineSync.queue.length);

  // Connectivity tracking + sync-on-reconnect.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      dispatch(setConnected(connected));
      if (connected) {
        void processSyncQueue();
      }
    });
    return () => unsubscribe();
  }, [dispatch]);

  // Safety-net poll while online with queued work.
  useEffect(() => {
    if (!isConnected || queueLength === 0) return;
    const intervalId = setInterval(() => {
      void processSyncQueue();
    }, SYNC_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isConnected, queueLength]);
}
