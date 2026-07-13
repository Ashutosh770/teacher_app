import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector } from '../store';
import { colors } from '../shared/theme';
import { PermissionGate } from '../shared/components';
import { useOfflineSyncProcessor } from '../modules/offlineSync';

// Module screens
import LoginScreen from '../modules/auth/screens/LoginScreen';
import StaffAttendanceScreen from '../modules/staffAttendance/screens/StaffAttendanceScreen';
import FaceEnrollmentScreen from '../modules/staffAttendance/screens/FaceEnrollmentScreen';
import StudentAttendanceScreen from '../modules/studentAttendance/screens/StudentAttendanceScreen';
import StudentFaceEnrollmentScreen from '../modules/studentAttendance/screens/StudentFaceEnrollmentScreen';
import LeaveManagementScreen from '../modules/leaveManagement/screens/LeaveManagementScreen';
import TimeTableScreen from '../modules/timeTable/screens/TimeTableScreen';
import StudentMarksScreen from '../modules/studentMarks/screens/StudentMarksScreen';
import ClassDiaryScreen from '../modules/classDiary/screens/ClassDiaryScreen';
import AnnouncementScreen from '../modules/announcement/screens/AnnouncementScreen';
import AdminDashboardScreen from '../modules/adminDashboard/screens/AdminDashboardScreen';

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
const StudentAttendanceStack = createNativeStackNavigator();

/**
 * Staff attendance sub-navigator. The home screen is wrapped in a
 * `PermissionGate` so direct navigation by an unauthorized user renders the
 * unauthorized view rather than the attendance flow (Req 16.3). Face enrollment
 * is a sibling route so the staff face-step guard can redirect to it and return
 * (Req 16.4, design "Navigation & Access Gating").
 */
function GatedStaffAttendanceScreen() {
  return (
    <PermissionGate moduleKey={STAFF_ATTENDANCE_MODULE_KEY} moduleLabel="Staff Attendance">
      <StaffAttendanceScreen />
    </PermissionGate>
  );
}

function StaffAttendanceNavigator() {
  return (
    <StaffAttendanceStack.Navigator screenOptions={{ headerShown: true }}>
      <StaffAttendanceStack.Screen
        name="StaffAttendanceHome"
        component={GatedStaffAttendanceScreen}
        options={{ title: 'Staff Attendance' }}
      />
      <StaffAttendanceStack.Screen
        name="FaceEnrollment"
        component={FaceEnrollmentScreen}
        options={{ title: 'Face Enrollment' }}
      />
    </StaffAttendanceStack.Navigator>
  );
}

/**
 * Student attendance sub-navigator. Mirrors the staff navigator: the home
 * screen is gated (Req 16.3) and student face enrollment is a sibling route
 * (Req 16.4).
 */
function GatedStudentAttendanceScreen() {
  return (
    <PermissionGate moduleKey={STUDENT_ATTENDANCE_MODULE_KEY} moduleLabel="Student Attendance">
      <StudentAttendanceScreen />
    </PermissionGate>
  );
}

function StudentAttendanceNavigator() {
  return (
    <StudentAttendanceStack.Navigator screenOptions={{ headerShown: true }}>
      <StudentAttendanceStack.Screen
        name="StudentAttendanceHome"
        component={GatedStudentAttendanceScreen}
        options={{ title: 'Student Attendance' }}
      />
      <StudentAttendanceStack.Screen
        name="StudentFaceEnrollment"
        component={StudentFaceEnrollmentScreen}
        options={{ title: 'Student Face Enrollment' }}
      />
    </StudentAttendanceStack.Navigator>
  );
}

function MainTabs() {
  const user = useAppSelector(state => state.auth.user);
  const isAdmin = user?.role === 'admin';
  const allowedModules = user?.allowedModules ?? [];
  const canStaffAttendance = allowedModules.includes(STAFF_ATTENDANCE_MODULE_KEY);
  const canStudentAttendance = allowedModules.includes(STUDENT_ATTENDANCE_MODULE_KEY);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        headerShown: true,
      }}
    >
      <Tab.Screen
        name="Timetable"
        component={TimeTableScreen}
        options={{ tabBarLabel: 'Schedule' }}
      />
      {canStaffAttendance && (
        <Tab.Screen
          name="StaffAttendance"
          component={StaffAttendanceNavigator}
          options={{ tabBarLabel: 'Staff Att.', headerShown: false }}
        />
      )}
      {canStudentAttendance && (
        <Tab.Screen
          name="StudentAttendance"
          component={StudentAttendanceNavigator}
          options={{ tabBarLabel: 'Student Att.', headerShown: false }}
        />
      )}
      <Tab.Screen
        name="LeaveManagement"
        component={LeaveManagementScreen}
        options={{ tabBarLabel: 'Leave' }}
      />
      <Tab.Screen
        name="StudentMarks"
        component={StudentMarksScreen}
        options={{ tabBarLabel: 'Marks' }}
      />
      <Tab.Screen
        name="ClassDiary"
        component={ClassDiaryScreen}
        options={{ tabBarLabel: 'Diary' }}
      />
      <Tab.Screen
        name="Announcements"
        component={AnnouncementScreen}
        options={{ tabBarLabel: 'Announce' }}
      />
      {isAdmin && (
        <Tab.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ tabBarLabel: 'Dashboard' }}
        />
      )}
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);

  // Drive the offline-sync queue: mirror connectivity, sync on reconnect, and
  // poll while online so queued attendance clears its indicators within 5s of a
  // successful sync (Req 15.3/15.4).
  useOfflineSyncProcessor();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
