import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { ProgressBar } from '../../../shared/components';
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

export default function HomeScreen() {
  const navigation = useNavigation();
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
      subtitle: 'GPS + Face Verify',
      icon: 'check-circle',
      color: colors.secondary,
      route: 'StaffAttendance',
    },
    canStudentAttendance && {
      key: 'studentAttendance',
      title: 'Student Attendance',
      subtitle: 'Face scan roster',
      icon: 'users',
      color: colors.blue,
      route: 'StudentAttendance',
    },
    {
      key: 'leave',
      title: 'Apply Leave',
      subtitle: 'View balance & apply',
      icon: 'clock',
      color: colors.accent,
      route: 'LeaveManagement',
    },
    {
      key: 'marks',
      title: 'Enhanced Marks',
      subtitle: 'All exam types',
      icon: 'book-open',
      color: colors.purple,
      route: 'StudentMarks',
    },
    {
      key: 'diary',
      title: 'Class Diary',
      subtitle: 'Daily homework',
      icon: 'book',
      color: colors.teal,
      route: 'ClassDiary',
    },
  ].filter(Boolean) as QuickAction[];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={[colors.primary, colors.primaryLight, colors.primary]} style={styles.header}>
          <View style={styles.headerOrb} />
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.greeting}>{greeting()}</Text>
              <Text style={styles.userName}>{user?.name ?? ''}</Text>
            </View>
            <View style={styles.bellButton}>
              <Feather name="bell" size={22} color={colors.surface} />
            </View>
          </View>

          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusText}>
                <Text style={styles.statusLabel}>Today's Attendance</Text>
                <Text
                  style={[
                    styles.statusValue,
                    { color: todayRecord ? colors.secondary : colors.textSecondary },
                  ]}
                >
                  {todayRecord ? 'Present' : 'Not marked yet'}
                </Text>
                {todayRecord && (
                  <Text style={styles.statusCaption}>Marked at {formatTime(todayRecord.markedAt)}</Text>
                )}
              </View>
              <View
                style={[
                  styles.statusIconWrap,
                  { backgroundColor: withAlpha(todayRecord ? colors.secondary : colors.textSecondary, 0.15) },
                ]}
              >
                <Feather
                  name={todayRecord ? 'check-circle' : 'alert-circle'}
                  size={30}
                  color={todayRecord ? colors.secondary : colors.textSecondary}
                />
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.actionsGrid}>
            {quickActions.map(action => (
              <TouchableOpacity
                key={action.key}
                style={styles.actionCard}
                onPress={() => (navigation as any).navigate(action.route)}
                accessibilityRole="button"
              >
                <View style={[styles.actionIconWrap, { backgroundColor: withAlpha(action.color, 0.1) }]}>
                  <Feather name={action.icon} size={26} color={action.color} />
                </View>
                <Text style={styles.actionTitle}>{action.title}</Text>
                <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {todaySchedule.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Today's Schedule</Text>
                <TouchableOpacity onPress={() => (navigation as any).navigate('Timetable')}>
                  <Text style={styles.sectionLink}>View All</Text>
                </TouchableOpacity>
              </View>
              {todaySchedule.map(entry => (
                <View key={entry.id} style={styles.scheduleRow}>
                  <View style={styles.scheduleTime}>
                    <Text style={styles.scheduleTimeText}>{entry.timeSlot.split('-')[0]?.trim()}</Text>
                  </View>
                  <View style={styles.scheduleInfo}>
                    <Text style={styles.scheduleSubject}>{entry.subject}</Text>
                    <Text style={styles.scheduleClass}>{entry.className}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {leaveBalances.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Leave Balance</Text>
              {leaveBalances
                .filter(b => b.total > 0)
                .map(balance => {
                  const name = LEAVE_TYPES.find(t => t.code === balance.type)?.name ?? balance.type;
                  return (
                    <View key={balance.type} style={styles.leaveRow}>
                      <View style={styles.leaveRowHeader}>
                        <Text style={styles.leaveRowName}>{name}</Text>
                        <Text style={styles.leaveRowValue}>
                          {balance.remaining}
                          <Text style={styles.leaveRowValueTotal}>/{balance.total}</Text>
                        </Text>
                      </View>
                      <ProgressBar progress={balance.total > 0 ? balance.remaining / balance.total : 0} />
                    </View>
                  );
                })}
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
    paddingBottom: spacing.xxl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    overflow: 'hidden',
  },
  headerOrb: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.secondary, 0.06),
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  greeting: {
    ...typography.h1,
    color: colors.surface,
    marginBottom: spacing.xs,
  },
  userName: {
    ...typography.body,
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
  },
  bellButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  statusText: {
    flex: 1,
  },
  statusLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statusValue: {
    ...typography.h1,
    fontSize: 26,
    marginBottom: spacing.xs,
  },
  statusCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusIconWrap: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing.lg,
    marginTop: -spacing.xl,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  actionCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  actionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  actionSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionLink: {
    ...typography.caption,
    color: colors.secondary,
    fontWeight: '700',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
    padding: spacing.md,
    marginBottom: spacing.sm + spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  scheduleTime: {
    minWidth: 56,
  },
  scheduleTimeText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  scheduleSubject: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  scheduleClass: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  leaveRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm + spacing.xs,
  },
  leaveRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  leaveRowName: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
  },
  leaveRowValue: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
  },
  leaveRowValueTotal: {
    color: colors.textSecondary,
    fontWeight: '400',
  },
});
