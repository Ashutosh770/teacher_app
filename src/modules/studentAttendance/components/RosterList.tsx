import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  /**
   * Opens face enrollment for one student. Optional so the list stays usable
   * (and testable) without a navigator; when omitted the face status renders as
   * a plain, non-interactive label exactly as before.
   */
  onEnrollPress?: (student: RosterStudent) => void;
  /**
   * Content scrolled ABOVE the first row (stats, scan button) and BELOW the
   * last (tips).
   *
   * The screen's chrome used to sit outside the list as fixed siblings, which
   * left the list roughly one row tall on a phone: everything else claimed its
   * height first and the list got whatever remained. Passing it through the
   * list means only the rows compete for vertical space, and the chrome scrolls
   * out of the way as the teacher works down the roster.
   */
  ListHeaderComponent?: React.ComponentProps<typeof FlatList>['ListHeaderComponent'];
  ListFooterComponent?: React.ComponentProps<typeof FlatList>['ListFooterComponent'];
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
export default function RosterList({
  roster,
  renderStatusControl,
  onEnrollPress,
  ListHeaderComponent,
  ListFooterComponent,
}: RosterListProps) {
  const renderItem = useCallback(
    ({ item }: { item: RosterStudent }) => (
      <RosterRow
        student={item}
        renderStatusControl={renderStatusControl}
        onEnrollPress={onEnrollPress}
      />
    ),
    [renderStatusControl, onEnrollPress],
  );

  return (
    <FlatList
      // `flex: 1` is load-bearing, not cosmetic. Without a style a FlatList
      // sizes to its CONTENT rather than to its parent, so once the roster grew
      // past what fitted on screen the list rendered straight over the Submit
      // button and the tip below it instead of scrolling inside its own area.
      style={styles.list}
      data={roster}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={Separator}
      showsVerticalScrollIndicator
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      // Rendered through the list rather than returned early, so an empty
      // roster still shows the stats and the scan button above it instead of a
      // bare sentence on an otherwise blank screen.
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No students in this roster yet.</Text>
        </View>
      }
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function RosterRow({
  student,
  renderStatusControl,
  onEnrollPress,
}: {
  student: RosterStudent;
  renderStatusControl?: (student: RosterStudent) => React.ReactNode;
  onEnrollPress?: (student: RosterStudent) => void;
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
          {onEnrollPress ? (
            // The face status doubles as the way in to enrollment: it is the
            // part of the row that states the problem ("No Face Data"), so it
            // is where a teacher looks when they want to fix it.
            <TouchableOpacity
              style={styles.faceStatusRow}
              onPress={() => onEnrollPress(student)}
              accessibilityRole="button"
              accessibilityLabel={
                student.enrollmentStatus === 'enrolled'
                  ? `Re-enroll ${student.name}'s face`
                  : `Enroll ${student.name}'s face`
              }
            >
              <RosterFaceStatus student={student} />
              {student.enrollmentStatus !== 'enrolled' && (
                <Text style={styles.enrollLink}>Enroll</Text>
              )}
            </TouchableOpacity>
          ) : (
            <RosterFaceStatus student={student} />
          )}
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.md,
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
  enrollLink: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
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
