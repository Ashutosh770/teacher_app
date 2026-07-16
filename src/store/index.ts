import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import authReducer from '../modules/auth/state/authSlice';
import staffAttendanceReducer from '../modules/staffAttendance/state/staffAttendanceSlice';
import studentAttendanceReducer from '../modules/studentAttendance/state/studentAttendanceSlice';
import leaveManagementReducer from '../modules/leaveManagement/state/leaveManagementSlice';
import timeTableReducer from '../modules/timeTable/state/timeTableSlice';
import studentMarksReducer from '../modules/studentMarks/state/studentMarksSlice';
import classDiaryReducer from '../modules/classDiary/state/classDiarySlice';
import announcementReducer from '../modules/announcement/state/announcementSlice';
import adminDashboardReducer from '../modules/adminDashboard/state/adminDashboardSlice';
import offlineSyncReducer from '../modules/offlineSync/state/offlineSyncSlice';
import { persistQueue } from '../modules/offlineSync/services/queuePersistence';
import { reactotron } from '../shared/config/reactotron';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    staffAttendance: staffAttendanceReducer,
    studentAttendance: studentAttendanceReducer,
    leaveManagement: leaveManagementReducer,
    timeTable: timeTableReducer,
    studentMarks: studentMarksReducer,
    classDiary: classDiaryReducer,
    announcement: announcementReducer,
    adminDashboard: adminDashboardReducer,
    offlineSync: offlineSyncReducer,
  },
  // Reactotron's store enhancer streams every dispatched action + resulting
  // state diff to the desktop app; `reactotron` is null outside __DEV__ so
  // this is a no-op in production builds.
  enhancers: getDefaultEnhancers =>
    reactotron ? getDefaultEnhancers().concat(reactotron.createEnhancer()) : getDefaultEnhancers(),
});

// Persist the offline sync queue on every mutation so it survives restarts
// (Req 15.1). persistQueue guards against redundant writes via reference
// comparison, so this subscriber is cheap for non-queue state changes.
store.subscribe(() => {
  persistQueue(store.getState().offlineSync.queue);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
