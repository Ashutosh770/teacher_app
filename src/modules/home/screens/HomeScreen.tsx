import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  borderRadius,
  colors,
  gradients,
  HIT_SLOP,
  moduleAccent,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import {
  Card,
  IconChip,
  Pressable,
  ProgressBar,
  SectionHeader,
  StatusPill,
} from '../../../shared/components';
import { useAppSelector } from '../../../store';
import { STAFF_ATTENDANCE_MODULE_KEY, STUDENT_ATTENDANCE_MODULE_KEY } from '../../../navigation/AppNavigator';
import { LEAVE_TYPES, loadLeaveData } from '../../leaveManagement/services/leaveManagementService';

interface QuickAction {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  route: string;
}

/** Height of the hero card's overhang below the header gradient. */
const HERO_OVERLAP = 72;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAppSelector(s => s.auth.user);
  const allowedModules = user?.allowedModules ?? [];
  const canStaffAttendance = allowedModules.includes(STAFF_ATTENDANCE_MODULE_KEY);
  const canStudentAttendance = allowedModules.includes(STUDENT_ATTENDANCE_MODULE_KEY);

  const todayRecord = useAppSelector(s => s.staffAttendance.todayRecord);
  const timetableEntries = useAppSelector(s => s.timeTable.entries);
  const leaveBalances = useAppSelector(s => s.leaveManagement.balances);

  useEffect(() => {
    void loadLeaveData();
  }, []);

  const todaySchedule = useMemo(() => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    return timetableEntries.filter(e => e.day === today).slice(0, 4);
  }, [timetableEntries]);

  const quickActions: QuickAction[] = [
    canStaffAttendance && {
      key: 'staffAttendance',
      title: 'My Attendance',
      subtitle: 'GPS + face verify',
      icon: 'check-circle',
      color: moduleAccent.attendance.solid,
      route: 'StaffAttendance',
    },
    canStudentAttendance && {
      key: 'studentAttendance',
      title: 'Student Attendance',
      subtitle: 'Face scan roster',
      icon: 'users',
      color: moduleAccent.students.solid,
      route: 'StudentAttendance',
    },
    {
      key: 'leave',
      title: 'Apply Leave',
      subtitle: 'Balance & requests',
      icon: 'clock',
      color: moduleAccent.leave.solid,
      route: 'LeaveManagement',
    },
    {
      key: 'marks',
      title: 'Enhanced Marks',
      subtitle: 'All exam types',
      icon: 'book-open',
      color: moduleAccent.marks.solid,
      route: 'StudentMarks',
    },
    {
      key: 'diary',
      title: 'Class Diary',
      subtitle: 'Daily homework',
      icon: 'book',
      color: moduleAccent.diary.solid,
      route: 'ClassDiary',
    },
  ].filter(Boolean) as QuickAction[];

  const isMarked = !!todayRecord;
  const markedTone = isMarked ? colors.successText : colors.warningText;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + spacing.md }]}
        >
          <View style={styles.orbTop} pointerEvents="none" />
          <View style={styles.orbBottom} pointerEvents="none" />

          <View style={styles.headerTopRow}>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(user?.name)}</Text>
              </View>
              <View style={styles.identityText}>
                <Text style={styles.greeting}>{greeting()}</Text>
                <Text style={styles.userName} numberOfLines={1}>
                  {user?.name ?? ''}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => (navigation as any).navigate('Announcements')}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Announcements"
              style={styles.bellButton}
            >
              <Feather name="bell" size={20} color={colors.textInverse} />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Hero status card, pulled up over the gradient. */}
          <Card elevation="md" padding="lg" style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroLabel}>TODAY&apos;S ATTENDANCE</Text>
                <Text style={[styles.heroValue, { color: markedTone }]}>
                  {isMarked ? 'Present' : 'Not marked yet'}
                </Text>
                {isMarked ? (
                  <Text style={styles.heroCaption}>Marked at {formatTime(todayRecord?.markedAt)}</Text>
                ) : (
                  <StatusPill
                    label="Tap Attendance to mark"
                    tone="warning"
                    icon="arrow-right"
                    style={styles.heroPill}
                  />
                )}
              </View>

              <IconChip
                icon={isMarked ? 'check-circle' : 'alert-circle'}
                color={isMarked ? colors.success : colors.warning}
                size={64}
              />
            </View>
          </Card>

          <SectionHeader title="Quick actions" style={styles.sectionHeader} />
          <View style={styles.actionsGrid}>
            {quickActions.map((action, index) => {
              // An odd action count leaves one card alone on the last row. Rather
              // than a half-width card floating next to a gap, that card goes
              // full width and switches to a horizontal layout, so the row reads
              // as deliberate instead of as a wrapping accident.
              const isOrphan =
                quickActions.length % 2 === 1 && index === quickActions.length - 1;

              return (
                <Card
                  key={action.key}
                  elevation="sm"
                  padding="md"
                  onPress={() => (navigation as any).navigate(action.route)}
                  accessibilityLabel={`${action.title}. ${action.subtitle}`}
                  style={isOrphan ? styles.actionCardWide : styles.actionCard}
                >
                  {/* A hairline of the accent along the top edge is what separates
                      one card from the next now that they share a white fill. */}
                  <View style={[styles.actionAccent, { backgroundColor: action.color }]} />

                  {isOrphan ? (
                    <View style={styles.actionWideRow}>
                      <IconChip icon={action.icon} color={action.color} size={46} />
                      <View style={styles.actionWideText}>
                        <Text style={[styles.actionTitle, styles.actionTitleWide]} numberOfLines={1}>
                          {action.title}
                        </Text>
                        <Text style={styles.actionSubtitle} numberOfLines={1}>
                          {action.subtitle}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={20} color={colors.textTertiary} />
                    </View>
                  ) : (
                    <>
                      <IconChip icon={action.icon} color={action.color} size={46} />
                      <Text style={styles.actionTitle} numberOfLines={2}>
                        {action.title}
                      </Text>
                      <Text style={styles.actionSubtitle} numberOfLines={1}>
                        {action.subtitle}
                      </Text>
                    </>
                  )}
                </Card>
              );
            })}
          </View>

          {todaySchedule.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="Today's schedule"
                caption={`${todaySchedule.length} period${todaySchedule.length === 1 ? '' : 's'} coming up`}
                actionLabel="View all"
                onAction={() => (navigation as any).navigate('Timetable')}
                actionColor={moduleAccent.timetable.text}
              />

              <Card elevation="sm" padding="none">
                {todaySchedule.map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[styles.scheduleRow, index > 0 && styles.scheduleRowDivided]}
                  >
                    {/* Timeline rail — the dot/line pair reads the list as a
                        sequence rather than as unrelated rows. */}
                    <View style={styles.rail}>
                      <View style={styles.railDot} />
                      {index < todaySchedule.length - 1 && <View style={styles.railLine} />}
                    </View>

                    <View style={styles.scheduleTime}>
                      <Text style={styles.scheduleTimeText}>{entry.timeSlot.split('-')[0]?.trim()}</Text>
                    </View>

                    <View style={styles.scheduleInfo}>
                      <Text style={styles.scheduleSubject} numberOfLines={1}>
                        {entry.subject}
                      </Text>
                      <Text style={styles.scheduleClass} numberOfLines={1}>
                        {entry.className}
                        {entry.room ? ` · ${entry.room}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          )}

          {leaveBalances.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="Leave balance"
                actionLabel="Apply"
                onAction={() => (navigation as any).navigate('LeaveManagement')}
                actionColor={moduleAccent.leave.text}
              />

              <Card elevation="sm" padding="md">
                {leaveBalances
                  .filter(b => b.total > 0)
                  .map((balance, index) => {
                    const name = LEAVE_TYPES.find(t => t.code === balance.type)?.name ?? balance.type;
                    const fraction = balance.total > 0 ? balance.remaining / balance.total : 0;
                    // Low balances shift the bar to amber so the number isn't
                    // the only thing carrying the warning.
                    const stops =
                      fraction <= 0.25
                        ? gradients.warning
                        : fraction <= 0.5
                          ? gradients.info
                          : gradients.success;

                    return (
                      <View
                        key={balance.type}
                        style={[styles.leaveRow, index > 0 && styles.leaveRowSpaced]}
                      >
                        <View style={styles.leaveRowHeader}>
                          <Text style={styles.leaveRowName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.leaveRowValue}>
                            {balance.remaining}
                            <Text style={styles.leaveRowValueTotal}> / {balance.total}</Text>
                          </Text>
                        </View>
                        <ProgressBar
                          progress={fraction}
                          colors={stops}
                          height={7}
                          label={`${name} remaining`}
                        />
                      </View>
                    );
                  })}
              </Card>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },

  /* Header */
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg + HERO_OVERLAP,
    overflow: 'hidden',
  },
  orbTop: {
    position: 'absolute',
    top: -120,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.08),
  },
  orbBottom: {
    position: 'absolute',
    bottom: -100,
    left: -90,
    width: 240,
    height: 240,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.05),
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.bodyBold,
    color: colors.textInverse,
  },
  identityText: {
    flex: 1,
  },
  greeting: {
    ...typography.small,
    color: withAlpha(colors.overlayLight, 0.75),
  },
  userName: {
    ...typography.h3,
    color: colors.textInverse,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Body */
  body: {
    paddingHorizontal: spacing.lg,
    marginTop: -HERO_OVERLAP,
  },

  /* Hero attendance card */
  heroCard: {
    marginBottom: spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
  },
  heroLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  heroValue: {
    ...typography.h2,
  },
  heroCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  heroPill: {
    marginTop: spacing.sm,
  },

  /* Quick actions */
  sectionHeader: {
    marginBottom: spacing.smd,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.smd,
    marginBottom: spacing.lg,
  },
  actionCard: {
    // `flexBasis` + `maxWidth` rather than a flat `width: '47%'`: the old value
    // summed to 94% *plus* a 16px gap, which overflowed the row on narrow
    // screens and wrapped the third card unpredictably.
    flexGrow: 1,
    flexBasis: '47%',
    maxWidth: '48.5%',
    // A floor, not a fixed height: it keeps every tile the same size when the
    // titles are short, and still lets a two-line title grow the row.
    minHeight: 148,
    paddingTop: spacing.md + 3,
  },
  actionCardWide: {
    flexBasis: '100%',
    paddingTop: spacing.md + 3,
  },
  actionWideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
  },
  actionWideText: {
    flex: 1,
  },
  actionAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  actionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.smd,
  },
  actionTitleWide: {
    marginTop: 0,
  },
  actionSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    // Pinned to the bottom of the tile so subtitles line up across a row even
    // when one title wraps to two lines and its neighbour doesn't. No effect in
    // the wide variant, where the text block has no spare vertical room.
    marginTop: 'auto',
    paddingTop: spacing.xxs,
  },

  /* Sections */
  section: {
    marginBottom: spacing.lg,
  },

  /* Schedule */
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd,
  },
  scheduleRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rail: {
    width: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingTop: 6,
  },
  railDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  railLine: {
    flex: 1,
    width: 2,
    marginTop: 2,
    backgroundColor: colors.border,
  },
  scheduleTime: {
    minWidth: 58,
    marginLeft: spacing.sm,
  },
  scheduleTimeText: {
    ...typography.captionBold,
    color: colors.text,
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  scheduleSubject: {
    ...typography.bodyBold,
    color: colors.text,
  },
  scheduleClass: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },

  /* Leave balance */
  leaveRow: {
    paddingVertical: spacing.xs,
  },
  leaveRowSpaced: {
    marginTop: spacing.smd,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.smd,
  },
  leaveRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  leaveRowName: {
    ...typography.captionBold,
    color: colors.text,
    flex: 1,
  },
  leaveRowValue: {
    ...typography.captionBold,
    color: colors.text,
  },
  leaveRowValueTotal: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
