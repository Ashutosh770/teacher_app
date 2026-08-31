import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  borderRadius,
  colors,
  moduleAccent,
  motion,
  shadows,
  spacing,
  typography,
} from '../../../shared/theme';
import { Pressable, PermissionGate, ScreenHeader } from '../../../shared/components';
import { useAppSelector } from '../../../store';
import {
  STAFF_ATTENDANCE_MODULE_KEY,
  STUDENT_ATTENDANCE_MODULE_KEY,
} from '../../../navigation/AppNavigator';
import StaffAttendanceScreen from '../../staffAttendance/screens/StaffAttendanceScreen';
import StudentAttendanceScreen from '../../studentAttendance/screens/StudentAttendanceScreen';

type Mode = 'staff' | 'student';

/**
 * Shell for the single "Attendance" bottom tab.
 *
 * This app has two distinct real attendance flows — marking your own presence
 * and scanning a class roster — so rather than spend two of the five bottom
 * tabs on them, both live here behind a segmented control in the shared header.
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
      <ScreenHeader
        title="Mark Attendance"
        subtitle={activeMode === 'staff' ? 'Verify your location and face' : 'Scan the class roster'}
        gradientColors={moduleAccent.attendance.gradient}
      >
        {showSwitcher && <ModeSwitcher mode={activeMode} onChange={setMode} />}
      </ScreenHeader>

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

/**
 * Segmented control on the header glass.
 *
 * The active thumb is a single sliding layer rather than a per-button
 * background swap, so switching modes reads as one continuous movement.
 */
function ModeSwitcher({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const slide = useRef(new Animated.Value(mode === 'staff' ? 0 : 1)).current;
  // Measured rather than expressed as a percentage: how Yoga resolves a
  // percentage on an absolutely-positioned child against a padded parent is
  // not worth depending on, and the travel distance is exactly one segment.
  const [segmentWidth, setSegmentWidth] = useState(0);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: mode === 'staff' ? 0 : 1,
      duration: motion.duration.normal,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start();
  }, [mode, slide]);

  return (
    <View
      style={styles.switcher}
      onLayout={e => setSegmentWidth((e.nativeEvent.layout.width - spacing.xs * 2) / 2)}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            width: segmentWidth,
            opacity: segmentWidth > 0 ? 1 : 0,
            transform: [
              {
                translateX: slide.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, segmentWidth],
                }),
              },
            ],
          },
        ]}
      />
      <SwitchButton
        label="My Attendance"
        icon="check-circle"
        active={mode === 'staff'}
        onPress={() => onChange('staff')}
      />
      <SwitchButton
        label="Students"
        icon="users"
        active={mode === 'student'}
        onPress={() => onChange('student')}
      />
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
  const tint = active ? colors.primaryText : colors.textInverse;
  return (
    <Pressable
      onPress={onPress}
      activeScale={0.98}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={styles.switchButton}
    >
      <Feather name={icon} size={15} color={tint} />
      <Text style={[styles.switchButtonText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
  },
  thumb: {
    position: 'absolute',
    top: spacing.xs,
    bottom: spacing.xs,
    left: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    ...shadows.sm,
  },
  switchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.smd - 2,
    borderRadius: borderRadius.sm,
  },
  switchButtonText: {
    ...typography.captionBold,
  },
  body: {
    flex: 1,
  },
});
