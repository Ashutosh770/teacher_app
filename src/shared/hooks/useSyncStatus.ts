import { useMemo } from 'react';
import { useAppSelector } from '../../store';
import type { SyncQueueItem } from '../types';

/**
 * Offline-sync indicator derivation (Req 15.3/15.4/15.5).
 *
 * Both attendance modules surface pending-sync vs sync-failed indicators that
 * are derived directly from the Offline_Sync_Queue rather than kept in a
 * separate per-screen state. Because the indicators read the live queue, they
 * disappear automatically as soon as `clearSyncedItems` removes a record after
 * a successful sync (design → "Offline Sync Integration").
 *
 * Two granularities are provided:
 *  - {@link useSyncStatus} — aggregate `{ pending, failed }` counts for a module
 *    (used by the student roster screen, which represents a whole class batch).
 *  - {@link useRecordSyncStatus} — the status of a single record, derived by
 *    matching the record's id against the payloads in the queue (used by the
 *    single-record staff flow). This mirrors the design note: "Pending/failed
 *    indicators are derived by matching a record's id against the queue".
 */

/** Aggregate pending/failed counts for a module's queued items. */
export interface SyncStatusCounts {
  /** Items awaiting sync (status `pending` or actively `syncing`). */
  pending: number;
  /** Items that exhausted their retry budget and are retained as `failed`. */
  failed: number;
}

/** Per-record sync status, or `null` when the record is not queued. */
export type RecordSyncStatus = 'pending' | 'failed' | null;

/**
 * Pure derivation of a module's aggregate pending/failed counts from a queue
 * snapshot. Exported for direct/unit testing without a store.
 */
export function deriveSyncStatus(queue: SyncQueueItem[], module: string): SyncStatusCounts {
  let pending = 0;
  let failed = 0;
  for (const item of queue) {
    if (item.module !== module) continue;
    if (item.status === 'failed') {
      failed += 1;
    } else {
      // 'pending' and the transient 'syncing' both read as pending to the user.
      pending += 1;
    }
  }
  return { pending, failed };
}

/** Extract a record id from a queued item's payload, when present. */
function payloadRecordId(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'id' in payload) {
    const id = (payload as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

/**
 * Pure derivation of a single record's sync status by matching `recordId`
 * against the queue's payloads. `failed` takes precedence over `pending` so the
 * distinct sync-failed indicator wins when both exist (Req 15.5). Returns `null`
 * when the record is no longer queued (i.e. it synced and was cleared).
 */
export function deriveRecordSyncStatus(
  queue: SyncQueueItem[],
  module: string,
  recordId: string,
): RecordSyncStatus {
  let sawPending = false;
  for (const item of queue) {
    if (item.module !== module) continue;
    if (payloadRecordId(item.payload) !== recordId) continue;
    if (item.status === 'failed') return 'failed';
    sawPending = true;
  }
  return sawPending ? 'pending' : null;
}

/**
 * Hook: aggregate `{ pending, failed }` counts for a module, recomputed only
 * when the queue reference changes. The queue reference is stable between
 * unrelated store updates, so this avoids needless re-renders.
 */
export function useSyncStatus(module: string): SyncStatusCounts {
  const queue = useAppSelector(s => s.offlineSync.queue);
  return useMemo(() => deriveSyncStatus(queue, module), [queue, module]);
}

/** Hook: the sync status of a single record, matched by id against the queue. */
export function useRecordSyncStatus(module: string, recordId: string | null | undefined): RecordSyncStatus {
  const queue = useAppSelector(s => s.offlineSync.queue);
  return useMemo(
    () => (recordId ? deriveRecordSyncStatus(queue, module, recordId) : null),
    [queue, module, recordId],
  );
}
