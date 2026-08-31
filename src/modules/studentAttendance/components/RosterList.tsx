import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, moduleAccent, spacing, typography, withAlpha } from '../../../shared/theme';
import { Card, EmptyState, Pressable, StatusPill } from '../../../shared/components';
import type { StatusPillTone } from '../../../shared/components';
import type { RosterAttendanceStatus, RosterStudent } from '../../../shared/types/attendance';

export interface RosterListProps {
  /** Students in the order held in state (already roll-number sorted). */
  roster: RosterStudent[];
  /**
   * Renders the manual present/absent control (or a locked "Face Verified"
   * indicator) for a student. When omitted the row shows the read-only
   * attendance status badge only.
   */
  renderStatusControl?: (student: RosterStudent) => React.ReactNode;
  /**
   * Opens face enrollment for one student. Optional so the list stays usable
   * (and testable) without a navigator; when omitted the face status renders as
   * a plain, non-interactive label.
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
 * Roster list (Req 9.1).
 *
 * Each row shows the student's roll number, name, face-enrollment status and
 * current attendance status. Present rows carry a tinted fill and an accent
 * rail so a scanned class reads as progress down the list rather than as a
 * uniform wall of white cards.
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
      <RosterRow student={item} renderStatusControl={renderStatusControl} onEnrollPress={onEnrollPress} />
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
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      // Rendered through the list rather than returned early, so an empty
      // roster still shows the stats and the scan button above it instead of a
      // bare sentence on an otherwise blank screen.
      ListEmptyComponent={
        <EmptyState
          icon="users"
          tone="info"
          title="No students yet"
          message="Add students to this roster to start taking attendance."
          compact
        />
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
  const isAbsent = student.attendanceStatus === 'absent';
  const rail = isPresent ? colors.success : isAbsent ? colors.error : colors.border;

  return (
    <Card
      elevation="xs"
      padding="none"
      bordered={!isPresent}
      backgroundColor={isPresent ? withAlpha(colors.success, 0.05) : colors.surface}
      style={[styles.row, isPresent && styles.rowPresent]}
    >
      <View style={[styles.rail, { backgroundColor: rail }]} />

      <View style={styles.rowInner}>
        <View style={[styles.avatar, isPresent && styles.avatarPresent]}>
          <Text style={[styles.avatarText, isPresent && styles.avatarTextPresent]} numberOfLines={1}>
            {student.rollNo}
          </Text>
        </View>

        <View style={styles.rowMain}>
          <Text style={styles.name} numberOfLines={1}>
            {student.name}
          </Text>

          {onEnrollPress ? (
            // The face status doubles as the way in to enrollment: it is the
            // part of the row that states the problem ("No face data"), so it
            // is where a teacher looks when they want to fix it.
            <Pressable
              onPress={() => onEnrollPress(student)}
              dimOnPress
              activeScale={0.97}
              accessibilityRole="button"
              accessibilityLabel={
                student.enrollmentStatus === 'enrolled'
                  ? `Re-enroll ${student.name}'s face`
                  : `Enroll ${student.name}'s face`
              }
              style={styles.faceStatusRow}
            >
              <RosterFaceStatus student={student} />
              {student.enrollmentStatus !== 'enrolled' && (
                <View style={styles.enrollLinkRow}>
                  <Text style={styles.enrollLink}>Enroll</Text>
                  <Feather name="chevron-right" size={12} color={moduleAccent.students.text} />
                </View>
              )}
            </Pressable>
          ) : (
            <View style={styles.faceStatusRow}>
              <RosterFaceStatus student={student} />
            </View>
          )}
        </View>

        <View style={styles.rowTrailing}>
          {renderStatusControl ? (
            renderStatusControl(student)
          ) : (
            <StatusBadge status={student.attendanceStatus} />
          )}
        </View>
      </View>
    </Card>
  );
}

/** Two-part face-verification status: "Face verified 96%" / "Not scanned" / "No face data". */
function RosterFaceStatus({ student }: { student: RosterStudent }) {
  const enrolled = student.enrollmentStatus === 'enrolled';

  if (student.attendanceStatus === 'present' && student.statusSource === 'face_match') {
    return (
      <View style={styles.faceStatusRow}>
        <StatusPill label="Face verified" tone="success" icon="check-circle" />
        {student.faceMatchConfidence != null && (
          <Text style={styles.confidenceText}>{Math.round(student.faceMatchConfidence)}%</Text>
        )}
      </View>
    );
  }
  if (enrolled) {
    return <StatusPill label="Not scanned" tone="warning" />;
  }
  return <StatusPill label="No face data" tone="neutral" icon="user-x" />;
}

const STATUS_LABEL: Record<RosterAttendanceStatus, string> = {
  present: 'Present',
  pending: 'Pending',
  absent: 'Absent',
  unmarked: 'Unmarked',
};

const STATUS_TONE: Record<RosterAttendanceStatus, StatusPillTone> = {
  present: 'success',
  pending: 'warning',
  absent: 'error',
  unmarked: 'neutral',
};

export function StatusBadge({ status }: { status: RosterAttendanceStatus }) {
  return <StatusPill label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} size="md" />;
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  row: {
    overflow: 'hidden',
  },
  rowPresent: {
    borderWidth: 1,
    borderColor: withAlpha(colors.success, 0.3),
  },
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    paddingVertical: spacing.smd,
    paddingLeft: spacing.smd + 3,
    paddingRight: spacing.smd,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  avatarPresent: {
    backgroundColor: withAlpha(colors.success, 0.14),
    borderColor: withAlpha(colors.success, 0.3),
  },
  avatarText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  avatarTextPresent: {
    color: colors.successText,
  },
  rowMain: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTrailing: {
    alignItems: 'flex-end',
  },
  name: {
    ...typography.bodyBold,
    color: colors.text,
  },
  faceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  confidenceText: {
    ...typography.micro,
    color: colors.successText,
    fontWeight: '700',
  },
  enrollLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  enrollLink: {
    ...typography.micro,
    color: moduleAccent.students.text,
    fontWeight: '700',
  },
  separator: {
    height: spacing.sm,
  },
});
