import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../../shared/theme';
import { GlassCard, ProgressBar } from '../../../shared/components';
import type { RosterSummary } from '../state/studentAttendanceSlice';

export interface StatsCardProps {
  /** Live roster counts from `selectRosterSummary` (Req 9.2). */
  summary: RosterSummary;
}

/**
 * Present / pending / total stats card (Req 9.2, 9.3).
 *
 * Renders the three counts derived by the memoized `selectRosterSummary`
 * selector, plus a progress bar showing present/total completion. Because the
 * selector guarantees `present + pending === total`, the card stays internally
 * consistent, and because the screen reads the selector from the store the
 * counts update live as face matches / manual marks land (Req 9.3).
 */
export default function StatsCard({ summary }: StatsCardProps) {
  const { present, pending, total } = summary;
  return (
    <GlassCard style={styles.card}>
      <View style={styles.row}>
        <Stat label="Present" value={present} valueStyle={styles.present} />
        <Stat label="Pending" value={pending} valueStyle={styles.pending} />
        <Stat label="Total" value={total} valueStyle={styles.total} />
      </View>
      <ProgressBar progress={total > 0 ? present / total : 0} />
    </GlassCard>
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
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
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
