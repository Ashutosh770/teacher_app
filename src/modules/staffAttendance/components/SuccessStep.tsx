/**
 * Success / terminal step of the staff attendance flow.
 *
 * Presentational step driven by `staffAttendance.todayRecord`: renders a
 * time / date / location-status / face-match confidence grid, plus the
 * `already_marked` and `pending_sync` variants (and a `persist_error` variant so
 * a failed create is not a dead end).
 *
 * Every variant resolves BOTH a fill and a text colour from `variantFor`. The
 * previous version used one accent for the badge tint and the heading alike,
 * which put a 26px "Attendance recorded" heading at 2.1:1 on white.
 *
 * Requirements: 6.2, 6.4, 6.5, 15.3, 15.5, 17.5
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppSelector } from '../../../store';
import {
  borderRadius,
  colors,
  motion,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import { Button, Card, StatusPill, SyncStatusBadge } from '../../../shared/components';
import { useRecordSyncStatus } from '../../../shared/hooks/useSyncStatus';
import { staffAttendanceService } from '../services/staffAttendanceService';
import type { StaffFlowState } from '../state/staffAttendanceSlice';
import type { StaffAttendanceRecord } from '../../../shared/types';

export interface SuccessStepProps {
  /** Retry submission after a persistence error (Req 6.4/17.5). */
  onRetrySubmit?: () => void;
}

interface Variant {
  heading: string;
  message: string;
  /** Fill — badge tint, ring. */
  accent: string;
  /** AA-safe text step of the same ramp — heading, labels. */
  accentText: string;
  icon: keyof typeof Feather.glyphMap;
}

function variantFor(flowState: StaffFlowState, record: StaffAttendanceRecord | null): Variant {
  switch (flowState) {
    case 'already_marked':
      return {
        heading: 'Already marked',
        message: 'Your attendance for today is already recorded.',
        accent: colors.primary,
        accentText: colors.primaryText,
        icon: 'check-circle',
      };
    case 'pending_sync':
      return {
        heading: 'Saved offline',
        message: 'Attendance saved. It will sync automatically when you are back online.',
        accent: colors.warning,
        accentText: colors.warningText,
        icon: 'upload-cloud',
      };
    case 'persist_error':
      return {
        heading: 'Could not save',
        message: 'We could not record your attendance. Your verification is preserved — please retry.',
        accent: colors.error,
        accentText: colors.errorText,
        icon: 'x-circle',
      };
    case 'success':
    default:
      return {
        heading: record?.markedManually ? 'Marked manually' : 'Attendance recorded',
        message: 'Your attendance has been marked present for today.',
        accent: colors.success,
        accentText: colors.successText,
        icon: 'check-circle',
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
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function SuccessStep(props: SuccessStepProps): React.ReactElement {
  const flowState = useAppSelector(s => s.staffAttendance.flowState);
  const record = useAppSelector(s => s.staffAttendance.todayRecord);
  const isSubmitting = useAppSelector(s => s.staffAttendance.isSubmitting);

  // Derive this record's sync status by matching its id against the queue
  // (Req 15.3/15.5). A record queued while offline reads as `pending`; once its
  // retry budget is exhausted the queue retains it as `failed`, which surfaces a
  // distinct sync-failed badge here even though the flow state stays
  // `pending_sync`. Clears to `null` (badge hidden) within 5s of a successful
  // sync when `clearSyncedItems` removes the record (Req 15.4).
  const recordSyncStatus = useRecordSyncStatus('staffAttendance', record?.id);

  const variant = variantFor(flowState, record);
  const isPersistError = flowState === 'persist_error';
  const isSuccess = flowState === 'success';

  // The badge springs in on success and on success only — a bounce on a
  // "could not save" screen would read as celebration.
  const bounce = useRef(new Animated.Value(isSuccess ? 0 : 1)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isSuccess) {
      bounce.setValue(1);
      return;
    }
    Animated.spring(bounce, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, {
          toValue: 1,
          duration: 1800,
          easing: motion.easing.decelerate,
          useNativeDriver: true,
        }),
        Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isSuccess, bounce, ring]);

  const badgeScale = bounce.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  // Retry submission after a persistence error; all verification data is
  // preserved so no re-verification is needed (Req 6.4/17.5).
  const onRetrySubmit = useCallback(() => {
    if (props.onRetrySubmit) {
      props.onRetrySubmit();
      return;
    }
    void staffAttendanceService.submit();
  }, [props]);

  const isLocationVerified = record?.locationStatus === 'verified';
  const locationValue = record == null ? '—' : isLocationVerified ? 'Verified' : 'Manual';
  const locationColor =
    record == null ? colors.textSecondary : isLocationVerified ? colors.successText : colors.warningText;

  const faceValue =
    record?.faceMatchConfidence != null ? `${Math.round(record.faceMatchConfidence)}%` : 'N/A';

  return (
    <View style={styles.container}>
      <View style={styles.badgeWrap}>
        {isSuccess && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.badgeRing,
              {
                borderColor: variant.accent,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
        )}
        <Animated.View
          style={[
            styles.badge,
            { backgroundColor: withAlpha(variant.accent, 0.12), transform: [{ scale: badgeScale }] },
          ]}
        >
          <View style={[styles.badgeInner, { backgroundColor: variant.accent }]}>
            <Feather name={variant.icon} size={38} color={colors.textInverse} />
          </View>
        </Animated.View>
      </View>

      <Text style={[styles.heading, { color: variant.accentText }]}>{variant.heading}</Text>
      <Text style={styles.message}>{variant.message}</Text>

      {record?.markedManually ? (
        <StatusPill label="Marked manually" tone="warning" icon="edit-3" style={styles.manualPill} />
      ) : null}

      {/* time / date / location / face-match grid */}
      <Card elevation="sm" padding="none" style={styles.grid}>
        <View style={styles.gridRow}>
          <GridCell icon="clock" label="Time" value={formatTime(record?.markedAt)} />
          <View style={styles.gridDividerV} />
          <GridCell icon="calendar" label="Date" value={formatDate(record)} />
        </View>
        <View style={styles.gridDividerH} />
        <View style={styles.gridRow}>
          <GridCell
            icon="map-pin"
            label="Location"
            value={locationValue}
            valueColor={locationColor}
          />
          <View style={styles.gridDividerV} />
          <GridCell icon="user-check" label="Face match" value={faceValue} />
        </View>
      </Card>

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
        <Button
          label="Retry"
          icon="refresh-cw"
          size="lg"
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={onRetrySubmit}
          style={styles.retryButton}
        />
      ) : null}
    </View>
  );
}

function GridCell({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.cell} accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.cellLabelRow}>
        <Feather name={icon} size={12} color={colors.textTertiary} />
        <Text style={styles.cellLabel}>{label}</Text>
      </View>
      <Text style={[styles.cellValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    alignItems: 'center',
  },

  /* Badge */
  badgeWrap: {
    width: 116,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  badgeRing: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  badge: {
    width: 104,
    height: 104,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInner: {
    width: 74,
    height: 74,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heading: {
    ...typography.h1,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    maxWidth: 320,
  },
  manualPill: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },

  /* Detail grid */
  grid: {
    alignSelf: 'stretch',
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridDividerV: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  gridDividerH: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  cell: {
    flex: 1,
    padding: spacing.md,
  },
  cellLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  cellLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    textTransform: 'uppercase',
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
    marginTop: spacing.lg,
  },
});
