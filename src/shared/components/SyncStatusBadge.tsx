import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import StatusPill from './StatusPill';
import { spacing } from '../theme';

/**
 * Offline-sync indicator (Req 15.3/15.5). Renders a pending-sync badge and/or a
 * distinct sync-failed badge from the counts derived off the Offline_Sync_Queue,
 * and nothing at all when there is nothing to show — so callers can drop it
 * inline unconditionally.
 *
 * Now built on `StatusPill` rather than its own solid-fill badges. The previous
 * version put white text on solid `#F5A623` (≈2:1) and solid `#E74C3C` (≈3.5:1),
 * which made the pending badge effectively unreadable; more importantly it meant
 * the app expressed the same "status" idea in two unrelated visual languages
 * depending on which component drew it.
 */
export interface SyncStatusBadgeProps {
  /** Number of records pending sync (status `pending`/`syncing`). */
  pending?: number;
  /** Number of records that failed to sync after exhausting retries. */
  failed?: number;
  /** Optional override for the pending badge label. */
  pendingLabel?: (count: number) => string;
  /** Optional override for the failed badge label. */
  failedLabel?: (count: number) => string;
  style?: StyleProp<ViewStyle>;
}

function defaultPendingLabel(count: number): string {
  return count === 1 ? 'Pending sync' : `${count} pending sync`;
}

function defaultFailedLabel(count: number): string {
  return count === 1 ? 'Sync failed' : `${count} sync failed`;
}

export default function SyncStatusBadge({
  pending = 0,
  failed = 0,
  pendingLabel = defaultPendingLabel,
  failedLabel = defaultFailedLabel,
  style,
}: SyncStatusBadgeProps): React.ReactElement | null {
  if (pending <= 0 && failed <= 0) {
    return null;
  }

  return (
    <View style={[styles.row, style]}>
      {pending > 0 && (
        <StatusPill label={pendingLabel(pending)} tone="warning" icon="upload-cloud" bordered />
      )}
      {failed > 0 && (
        <StatusPill label={failedLabel(failed)} tone="error" icon="alert-triangle" bordered />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
