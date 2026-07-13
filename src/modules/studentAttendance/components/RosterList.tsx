import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { StatusPill } from '../../../shared/components';
import type {
  RosterAttendanceStatus,
  RosterStudent,
} from '../../../shared/types/attendance';

export interface RosterListProps {
  /** Students in the order held in state (already roll-number sorted). */
  roster: RosterStudent[];
  /**
   * Seam for task 14.2: render the manual present/absent control (or a locked
   * "Face Verified" indicator) for a student. When omitted the row shows the
   * read-only attendance status badge only. Task 14.1 does not wire manual
   * marking, so this is left unimplemented here.
   */
  renderStatusControl?: (student: RosterStudent) => React.ReactNode;
}

/**
 * Read-only roster list (Req 9.1).
 *
 * Each row shows the student's name, roll number, face-enrollment status
 * (Enrolled / Not Enrolled), and current attendance status as a color-coded
 * badge — `success` for present, `warning` for pending, `error` for absent, and
 * a neutral tone for unmarked. Rows preserve the roster order held in state.
 *
 * The manual marking controls are intentionally NOT wired here; they are added
 * in task 14.2 via the optional `renderStatusControl` seam.
 */
export default function RosterList({ roster, renderStatusControl }: RosterListProps) {
  const renderItem = useCallback(
    ({ item }: { item: RosterStudent }) => (
      <RosterRow student={item} renderStatusControl={renderStatusControl} />
    ),
    [renderStatusControl],
  );

  if (roster.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No students in this roster yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={roster}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={Separator}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function RosterRow({
  student,
  renderStatusControl,
}: {
  student: RosterStudent;
  renderStatusControl?: (student: RosterStudent) => React.ReactNode;
}) {
  const isPresent = student.attendanceStatus === 'present';
  return (
    <View style={[styles.row, isPresent && styles.rowPresent]}>
      <View style={[styles.avatar, isPresent && styles.avatarPresent]}>
        <Text style={[styles.avatarText, isPresent && styles.avatarTextPresent]}>{student.rollNo}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={1}>
          {student.name}
        </Text>
        <View style={styles.metaRow}>
          <RosterFaceStatus student={student} />
        </View>
      </View>
      <View style={styles.rowTrailing}>
        {renderStatusControl ? (
          renderStatusControl(student)
        ) : isPresent ? (
          <Feather name="check-circle" size={26} color={colors.success} />
        ) : (
          <StatusBadge status={student.attendanceStatus} />
        )}
      </View>
    </View>
  );
}

/** Two-part face-verification status: "Face Verified 96%" / "Not Scanned" / "No Face Data". */
function RosterFaceStatus({ student }: { student: RosterStudent }) {
  const enrolled = student.enrollmentStatus === 'enrolled';
  if (student.attendanceStatus === 'present' && student.statusSource === 'face_match') {
    return (
      <View style={styles.faceStatusRow}>
        <StatusPill label="Face Verified" tone="success" />
        {student.faceMatchConfidence != null && (
          <Text style={styles.confidenceText}>{Math.round(student.faceMatchConfidence)}%</Text>
        )}
      </View>
    );
  }
  if (enrolled) {
    return <StatusPill label="Not Scanned" tone="warning" />;
  }
  return <StatusPill label="No Face Data" tone="neutral" />;
}

const STATUS_LABEL: Record<RosterAttendanceStatus, string> = {
  present: 'Present',
  pending: 'Pending',
  absent: 'Absent',
  unmarked: 'Unmarked',
};

export function StatusBadge({ status }: { status: RosterAttendanceStatus }) {
  return (
    <View style={[styles.badge, badgeStyleFor(status)]}>
      <Text style={styles.badgeText}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function badgeStyleFor(status: RosterAttendanceStatus) {
  switch (status) {
    case 'present':
      return styles.badgePresent;
    case 'pending':
      return styles.badgePending;
    case 'absent':
      return styles.badgeAbsent;
    case 'unmarked':
      return styles.badgeUnmarked;
  }
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowPresent: {
    borderColor: withAlpha(colors.success, 0.4),
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarPresent: {
    backgroundColor: withAlpha(colors.success, 0.2),
  },
  avatarText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  avatarTextPresent: {
    color: colors.success,
  },
  rowMain: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowTrailing: {
    alignItems: 'flex-end',
  },
  name: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  confidenceText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    ...typography.small,
    color: colors.surface,
    fontWeight: '600',
  },
  badgePresent: {
    backgroundColor: colors.success,
  },
  badgePending: {
    backgroundColor: colors.warning,
  },
  badgeAbsent: {
    backgroundColor: colors.error,
  },
  badgeUnmarked: {
    backgroundColor: colors.textSecondary,
  },
  separator: {
    height: spacing.sm,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
