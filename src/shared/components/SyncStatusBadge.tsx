import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { borderRadius, colors, spacing, typography } from '../theme';

/**
 * Reusable offline-sync indicator (Req 15.3/15.5). Renders a pending-sync badge
 * (neutral/warning) and/or a distinct sync-failed badge (error) from the counts
 * derived off the Offline_Sync_Queue. Renders nothing when there is nothing to
 * show, so callers can drop it inline unconditionally.
 *
 * Used by both attendance modules so the pending vs failed presentation is
 * identical: the student roster passes aggregate counts, the single-record
 * staff flow passes `pending`/`failed` as 0/1.
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
        <View
          style={[styles.badge, styles.badgePending]}
          accessibilityRole="text"
          accessibilityLabel={pendingLabel(pending)}
        >
          <Text style={styles.badgeText}>{pendingLabel(pending)}</Text>
        </View>
      )}
      {failed > 0 && (
        <View
          style={[styles.badge, styles.badgeFailed]}
          accessibilityRole="text"
          accessibilityLabel={failedLabel(failed)}
        >
          <Text style={styles.badgeText}>{failedLabel(failed)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
  },
  badgePending: {
    backgroundColor: colors.warning,
  },
  badgeFailed: {
    backgroundColor: colors.error,
  },
  badgeText: {
    ...typography.small,
    color: colors.surface,
    fontWeight: '600',
  },
});
