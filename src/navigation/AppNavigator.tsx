import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector } from '../store';

// Module screens
import LoginScreen from '../modules/auth/screens/LoginScreen';
import StaffAttendanceScreen from '../modules/staffAttendance/screens/StaffAttendanceScreen';
import StudentAttendanceScreen from '../modules/studentAttendance/screens/StudentAttendanceScreen';
import LeaveManagementScreen from '../modules/leaveManagement/screens/LeaveManagementScreen';
import TimeTableScreen from '../modules/timeTable/screens/TimeTableScreen';
import StudentMarksScreen from '../modules/studentMarks/screens/StudentMarksScreen';
import ClassDiaryScreen from '../modules/classDiary/screens/ClassDiaryScreen';
import AnnouncementScreen from '../modules/announcement/screens/AnnouncementScreen';
import AdminDashboardScreen from '../modules/adminDashboard/screens/AdminDashboardScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const user = useAppSelector(state => state.auth.user);
  const isAdmin = user?.role === 'admin';

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#64748B',
        headerShown: true,
      }}
    >
      <Tab.Screen
        name="Timetable"
        component={TimeTableScreen}
        options={{ tabBarLabel: 'Schedule' }}
      />
      <Tab.Screen
        name="StaffAttendance"
        component={StaffAttendanceScreen}
        options={{ tabBarLabel: 'Staff Att.' }}
      />
      <Tab.Screen
        name="StudentAttendance"
        component={StudentAttendanceScreen}
        options={{ tabBarLabel: 'Student Att.' }}
      />
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
