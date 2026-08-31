import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, gradients, spacing, typography } from '../../../shared/theme';
import { Card, ProgressBar, StatTile } from '../../../shared/components';
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
 *
 * Built on `Card` rather than `GlassCard`: this sits on the opaque roster
 * background where there is nothing to see through, so the blur was pure cost.
 */
export default function StatsCard({ summary }: StatsCardProps) {
  const { present, pending, total } = summary;
  const fraction = total > 0 ? present / total : 0;

  return (
    <Card elevation="sm" padding="md" style={styles.card}>
      <View style={styles.row}>
        <StatTile value={present} label="Present" tone={colors.successText} />
        <View style={styles.divider} />
        <StatTile value={pending} label="Pending" tone={colors.warningText} />
        <View style={styles.divider} />
        <StatTile value={total} label="Total" tone={colors.text} />
      </View>

      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>Roster progress</Text>
        <Text style={styles.progressValue}>{Math.round(fraction * 100)}%</Text>
      </View>
      <ProgressBar
        progress={fraction}
        colors={gradients.success}
        height={8}
        label="Students marked present"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progressLabel: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  progressValue: {
    ...typography.micro,
    color: colors.successText,
    fontWeight: '700',
  },
});
