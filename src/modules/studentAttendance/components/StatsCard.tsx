import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing, typography } from '../../../shared/theme';
import type { RosterSummary } from '../state/studentAttendanceSlice';

export interface StatsCardProps {
  /** Live roster counts from `selectRosterSummary` (Req 9.2). */
  summary: RosterSummary;
}

/**
 * Present / pending / total stats card (Req 9.2, 9.3).
 *
 * Renders the three counts derived by the memoized `selectRosterSummary`
 * selector. Because the selector guarantees `present + pending === total`, the
 * card stays internally consistent, and because the screen reads the selector
 * from the store the counts update live as face matches / manual marks land
 * (Req 9.3).
 */
export default function StatsCard({ summary }: StatsCardProps) {
  const { present, pending, total } = summary;
  return (
    <View style={styles.card}>
      <Stat label="Present" value={present} valueStyle={styles.present} />
      <View style={styles.divider} />
      <Stat label="Pending" value={pending} valueStyle={styles.pending} />
      <View style={styles.divider} />
      <Stat label="Total" value={total} valueStyle={styles.total} />
    </View>
  );
}

function Stat({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: number;
  valueStyle: object;
}) {
  return (
    <View style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.value, valueStyle]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  value: {
    ...typography.h1,
  },
  present: {
    color: colors.success,
  },
  pending: {
    color: colors.warning,
  },
  total: {
    color: colors.text,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
