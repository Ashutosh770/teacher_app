import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../store';
import { colors } from '../shared/theme';
import { PermissionGate } from '../shared/components';
import { useOfflineSyncProcessor } from '../modules/offlineSync';
import { restoreSession } from '../modules/auth/services/authService';
import { loginFailure, loginSuccess } from '../modules/auth/state/authSlice';

// Module screens
import HomeScreen from '../modules/home/screens/HomeScreen';
import LoginScreen from '../modules/auth/screens/LoginScreen';
import FaceEnrollmentScreen from '../modules/staffAttendance/screens/FaceEnrollmentScreen';
import StudentAttendanceScreen from '../modules/studentAttendance/screens/StudentAttendanceScreen';
import StudentFaceEnrollmentScreen from '../modules/studentAttendance/screens/StudentFaceEnrollmentScreen';
import AttendanceTabScreen from '../modules/attendance/screens/AttendanceTabScreen';
import LeaveManagementScreen from '../modules/leaveManagement/screens/LeaveManagementScreen';
import LeaveStatusScreen from '../modules/leaveManagement/screens/LeaveStatusScreen';
import TimeTableScreen from '../modules/timeTable/screens/TimeTableScreen';
import StudentMarksScreen from '../modules/studentMarks/screens/StudentMarksScreen';
import ClassDiaryScreen from '../modules/classDiary/screens/ClassDiaryScreen';
import AnnouncementScreen from '../modules/announcement/screens/AnnouncementScreen';
import AdminDashboardScreen from '../modules/adminDashboard/screens/AdminDashboardScreen';
import ProfileScreen from '../modules/profile/screens/ProfileScreen';

/**
 * `allowedModules` keys for the two attendance modules (Req 16.1–16.4). These
 * match the module folder names under `src/modules/` and the store slice keys,
 * and are the single source of truth for both tab-visibility gating (below) and
 * the per-screen `PermissionGate` guards.
 */
export const STAFF_ATTENDANCE_MODULE_KEY = 'staffAttendance';
export const STUDENT_ATTENDANCE_MODULE_KEY = 'studentAttendance';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const StaffAttendanceStack = createNativeStackNavigator();
const LeaveManagementStack = createNativeStackNavigator();

/**
 * Attendance sub-navigator. The home route is `AttendanceTabScreen`, which
 * improvises a mode switcher between staff self-attendance and student
 * roster scanning under one shared header (Req 16.3 gating is enforced inside
 * that screen per-mode). Face enrollment stays a sibling route so the staff
 * face-step guard can redirect to it and return (Req 16.4).
 */
function StaffAttendanceNavigator() {
  return (
    <StaffAttendanceStack.Navigator screenOptions={{ headerShown: true }}>
      <StaffAttendanceStack.Screen
        name="StaffAttendanceHome"
        component={AttendanceTabScreen}
        options={{ title: 'Attendance', headerShown: false }}
      />
      <StaffAttendanceStack.Screen
        name="FaceEnrollment"
        component={FaceEnrollmentScreen}
        options={{ title: 'Face Enrollment' }}
      />
    </StaffAttendanceStack.Navigator>
  );
}

/** Gates direct navigation to Student Attendance the same way staff attendance is gated (Req 16.3). */
function GatedStudentAttendanceScreen() {
  return (
    <PermissionGate moduleKey={STUDENT_ATTENDANCE_MODULE_KEY} moduleLabel="Student Attendance">
      <StudentAttendanceScreen />
    </PermissionGate>
  );
}

/**
 * Leave management sub-navigator. The apply screen is the tab root; leave
 * status is a pushed sibling route reached via the header's "View Status"
 * link, mirroring the staff attendance sub-navigator pattern. Both screens
 * render their own `GradientHeader`, so the native stack header is hidden
 * throughout.
 */
function LeaveManagementNavigator() {
  return (
    <LeaveManagementStack.Navigator screenOptions={{ headerShown: false }}>
      <LeaveManagementStack.Screen name="LeaveManagementHome" component={LeaveManagementScreen} />
      <LeaveManagementStack.Screen name="LeaveStatus" component={LeaveStatusScreen} />
    </LeaveManagementStack.Navigator>
  );
}

/** Builds a `tabBarIcon` renderer for a Feather icon name. */
function tabIcon(name: keyof typeof Feather.glyphMap) {
  return ({ color, size }: { color: string; size: number }) => (
    <Feather name={name} size={size} color={color} />
  );
}

/**
 * Bottom tab bar — mirrors the Figma design's `BottomNav.tsx` exactly: Home,
 * Attendance, Leave, Timetable, Profile. Every other screen (Student
 * Attendance, Marks, Diary, Announcements, Admin Dashboard) is reached from
 * Home's quick-action cards and pushed on top of these tabs via the root
 * stack below — matching how the Figma mock only ever renders those five
 * destinations as persistent nav items.
 */
function MainTabs() {
  const user = useAppSelector(state => state.auth.user);
  const allowedModules = user?.allowedModules ?? [];
  const canStaffAttendance = allowedModules.includes(STAFF_ATTENDANCE_MODULE_KEY);
  const canStudentAttendance = allowedModules.includes(STUDENT_ATTENDANCE_MODULE_KEY);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.textSecondary,
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home', tabBarIcon: tabIcon('home') }}
      />
      {(canStaffAttendance || canStudentAttendance) && (
        <Tab.Screen
          name="StaffAttendance"
          component={StaffAttendanceNavigator}
          options={{ tabBarLabel: 'Attendance', tabBarIcon: tabIcon('check-circle') }}
        />
      )}
      <Tab.Screen
        name="LeaveManagement"
        component={LeaveManagementNavigator}
        options={{ tabBarLabel: 'Leave', tabBarIcon: tabIcon('clock') }}
      />
      <Tab.Screen
        name="Timetable"
        component={TimeTableScreen}
        options={{ tabBarLabel: 'Timetable', tabBarIcon: tabIcon('calendar') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile', tabBarIcon: tabIcon('user') }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  const user = useAppSelector(state => state.auth.user);
  const isAdmin = user?.role === 'admin';
  const canStudentAttendance = (user?.allowedModules ?? []).includes(STUDENT_ATTENDANCE_MODULE_KEY);

  // Drive the offline-sync queue: mirror connectivity, sync on reconnect, and
  // poll while online so queued attendance clears its indicators within 5s of a
  // successful sync (Req 15.3/15.4).
  useOfflineSyncProcessor();

  // Restore a session from a persisted access token on app boot, so a signed-in
  // teacher isn't dropped back to the login screen every relaunch. Gated behind
  // `isBootstrapping` so we never flash the Login screen while this resolves.
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await restoreSession();
        if (!active) return;
        if (result?.success && result.data) {
          dispatch(loginSuccess(result.data));
        } else if (result && !result.success) {
          dispatch(loginFailure(result.error ?? 'Session expired'));
        }
      } catch (err) {
        // Never let a storage/network failure strand the app on the loading
        // spinner — fall through to the login screen instead.
        if (active) {
          dispatch(loginFailure('Session expired'));
        }
      } finally {
        if (active) setIsBootstrapping(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [dispatch]);

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            {/* Reached from Home's "Student Attendance" quick-action card — not a
                bottom tab, matching the Figma design (Req: nav parity). */}
            {canStudentAttendance && (
              <Stack.Screen name="StudentAttendance" component={GatedStudentAttendanceScreen} />
            )}
            <Stack.Screen
              name="StudentFaceEnrollment"
              component={StudentFaceEnrollmentScreen}
              options={{ headerShown: true, title: 'Student Face Enrollment' }}
            />
            <Stack.Screen name="StudentMarks" component={StudentMarksScreen} />
            <Stack.Screen name="ClassDiary" component={ClassDiaryScreen} />
            <Stack.Screen
              name="Announcements"
              component={AnnouncementScreen}
              options={{ headerShown: true, title: 'Announcements' }}
            />
            {isAdmin && (
              <Stack.Screen
                name="AdminDashboard"
                component={AdminDashboardScreen}
                options={{ headerShown: true, title: 'Admin Dashboard' }}
              />
            )}
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
