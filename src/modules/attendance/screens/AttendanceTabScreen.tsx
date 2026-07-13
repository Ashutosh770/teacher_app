import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../../../shared/theme';
import { GradientHeader, PermissionGate } from '../../../shared/components';
import { useAppSelector } from '../../../store';
import {
  STAFF_ATTENDANCE_MODULE_KEY,
  STUDENT_ATTENDANCE_MODULE_KEY,
} from '../../../navigation/AppNavigator';
import StaffAttendanceScreen from '../../staffAttendance/screens/StaffAttendanceScreen';
import StudentAttendanceScreen from '../../studentAttendance/screens/StudentAttendanceScreen';

type Mode = 'staff' | 'student';

/**
 * Shell for the single "Attendance" bottom tab (Figma's `AttendanceScreen.tsx`
 * only models self-attendance, but this app has two distinct real attendance
 * flows — marking your own presence and scanning a class roster — so this
 * screen improvises a mode switcher in the shared navy header instead of
 * giving each its own bottom tab, keeping the 5-tab bar matching the design).
 */
export default function AttendanceTabScreen() {
  const [mode, setMode] = useState<Mode>('staff');
  const allowedModules = useAppSelector(s => s.auth.user?.allowedModules ?? []);
  const canStaffAttendance = allowedModules.includes(STAFF_ATTENDANCE_MODULE_KEY);
  const canStudentAttendance = allowedModules.includes(STUDENT_ATTENDANCE_MODULE_KEY);

  const showSwitcher = canStaffAttendance && canStudentAttendance;
  const activeMode: Mode = showSwitcher ? mode : canStudentAttendance ? 'student' : 'staff';

  return (
    <View style={styles.screen}>
      <GradientHeader title="Mark Attendance">
        {showSwitcher && (
          <View style={styles.switcher}>
            <SwitchButton
              label="My Attendance"
              icon="check-circle"
              active={activeMode === 'staff'}
              onPress={() => setMode('staff')}
            />
            <SwitchButton
              label="Student Attendance"
              icon="users"
              active={activeMode === 'student'}
              onPress={() => setMode('student')}
            />
          </View>
        )}
      </GradientHeader>

      <View style={styles.body}>
        {activeMode === 'staff' ? (
          <PermissionGate moduleKey={STAFF_ATTENDANCE_MODULE_KEY} moduleLabel="Staff Attendance">
            <StaffAttendanceScreen embedded />
          </PermissionGate>
        ) : (
          <PermissionGate moduleKey={STUDENT_ATTENDANCE_MODULE_KEY} moduleLabel="Student Attendance">
            <StudentAttendanceScreen embedded />
          </PermissionGate>
        )}
      </View>
    </View>
  );
}

function SwitchButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.switchButton, active && styles.switchButtonActive]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Feather name={icon} size={15} color={active ? colors.primary : colors.surface} />
      <Text style={[styles.switchButtonText, active && styles.switchButtonTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  switcher: {
    flexDirection: 'row',
    backgroundColor: colors.glassLight,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  switchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + spacing.xs,
    borderRadius: borderRadius.md,
  },
  switchButtonActive: {
    backgroundColor: colors.surface,
  },
  switchButtonText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.surface,
  },
  switchButtonTextActive: {
    color: colors.primary,
  },
  body: {
    flex: 1,
  },
});
