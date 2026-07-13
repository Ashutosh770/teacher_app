/**
 * Success / terminal step of the staff attendance flow (task 10.1).
 *
 * Presentational step driven by `staffAttendance.todayRecord`: renders a
 * time / date / location-status / face-match confidence grid, plus the
 * `already_marked` and `pending_sync` variants (and a `persist_error` variant so
 * a failed create is not a dead end — its retry control is left as a 10.2 seam).
 *
 * Palette mapping (design): colors.success for a verified/synced record,
 * colors.warning for a pending-sync record, colors.primary for an already-marked
 * record, colors.error for a persistence error.
 *
 * Requirements: 6.2, 6.5
 */
import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppSelector } from '../../../store';
import { colors, spacing, typography, borderRadius } from '../../../shared/theme';
import { SyncStatusBadge } from '../../../shared/components';
import { useRecordSyncStatus } from '../../../shared/hooks/useSyncStatus';
import { staffAttendanceService } from '../services/staffAttendanceService';
import type { StaffFlowState } from '../state/staffAttendanceSlice';
import type { StaffAttendanceRecord } from '../../../shared/types';

export interface SuccessStepProps {
  /** Retry submission after a persistence error (Req 6.4/17.5). Seam for 10.2. */
  onRetrySubmit?: () => void;
}

interface Variant {
  heading: string;
  message: string;
  accent: string;
}

function variantFor(flowState: StaffFlowState, record: StaffAttendanceRecord | null): Variant {
  switch (flowState) {
    case 'already_marked':
      return {
        heading: 'Already marked',
        message: 'Your attendance for today is already recorded.',
        accent: colors.primary,
      };
    case 'pending_sync':
      return {
        heading: 'Saved offline',
        message: 'Attendance saved. It will sync automatically when you are back online.',
        accent: colors.warning,
      };
    case 'persist_error':
      return {
        heading: 'Could not save',
        message: 'We could not record your attendance. Your verification is preserved — please retry.',
        accent: colors.error,
      };
    case 'success':
    default:
      return {
        heading: record?.markedManually ? 'Marked manually' : 'Attendance recorded',
        message: 'Your attendance has been marked present for today.',
        accent: colors.success,
      };
  }
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(record: StaffAttendanceRecord | null): string {
  const value = record?.date;
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export default function SuccessStep(props: SuccessStepProps): React.ReactElement {
  const flowState = useAppSelector((s) => s.staffAttendance.flowState);
  const record = useAppSelector((s) => s.staffAttendance.todayRecord);
  const isSubmitting = useAppSelector((s) => s.staffAttendance.isSubmitting);

  // Derive this record's sync status by matching its id against the queue
  // (Req 15.3/15.5). A record queued while offline reads as `pending`; once its
  // retry budget is exhausted the queue retains it as `failed`, which surfaces a
  // distinct sync-failed badge here even though the flow state stays
  // `pending_sync`. Clears to `null` (badge hidden) within 5s of a successful
  // sync when `clearSyncedItems` removes the record (Req 15.4).
  const recordSyncStatus = useRecordSyncStatus('staffAttendance', record?.id);

  const variant = variantFor(flowState, record);
  const isPersistError = flowState === 'persist_error';

  // Retry submission after a persistence error; all verification data is
  // preserved so no re-verification is needed (Req 6.4/17.5).
  const onRetrySubmit = useCallback(() => {
    if (props.onRetrySubmit) {
      props.onRetrySubmit();
      return;
    }
    void staffAttendanceService.submit();
  }, [props]);

  const locationValue =
    record == null ? '—' : record.locationStatus === 'verified' ? 'Verified' : 'Manual';
  const locationColor =
    record == null
      ? colors.textSecondary
      : record.locationStatus === 'verified'
        ? colors.success
        : colors.warning;

  const faceValue =
    record?.faceMatchConfidence != null ? `${Math.round(record.faceMatchConfidence)}%` : 'N/A';

  return (
    <View style={styles.container}>
      <View style={[styles.badge, { backgroundColor: variant.accent }]} />
      <Text style={[styles.heading, { color: variant.accent }]}>{variant.heading}</Text>
      <Text style={styles.message}>{variant.message}</Text>

      {/* time / date / location / face-match grid */}
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <GridCell label="Time" value={formatTime(record?.markedAt)} />
          <GridCell label="Date" value={formatDate(record)} />
        </View>
        <View style={styles.gridRow}>
          <GridCell label="Location" value={locationValue} valueColor={locationColor} />
          <GridCell label="Face match" value={faceValue} />
        </View>
      </View>

      {/* Offline pending vs sync-failed indicator for this record, derived from
          the queue (Req 15.3/15.5). Hidden once the record syncs and is cleared. */}
      <SyncStatusBadge
        pending={recordSyncStatus === 'pending' ? 1 : 0}
        failed={recordSyncStatus === 'failed' ? 1 : 0}
        style={styles.syncBadge}
      />

      {/* persist_error retry control (Req 6.4): retries submit() without redoing
          GPS/face verification. */}
      {isPersistError ? (
        <TouchableOpacity
          style={[styles.retryButton, isSubmitting && styles.retryButtonDisabled]}
          onPress={onRetrySubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function GridCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  heading: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  grid: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    padding: spacing.md,
  },
  cellLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  cellValue: {
    ...typography.h3,
    color: colors.text,
  },
  syncBadge: {
    marginTop: spacing.md,
    justifyContent: 'center',
  },
  retryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  retryButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  retryButtonText: {
    color: '#fff',
    ...typography.body,
    fontWeight: '600',
  },
});
