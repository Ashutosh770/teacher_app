import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { LeaveRequest } from '../../../shared/types';

interface DashboardStats {
  staffAttendancePercent: number;
  studentAttendancePercent: number;
  pendingLeaveCount: number;
  announcementCount: number;
}

interface AdminDashboardState {
  stats: DashboardStats | null;
  pendingLeaves: LeaveRequest[];
  lastUpdated: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: AdminDashboardState = {
  stats: null,
  pendingLeaves: [],
  lastUpdated: null,
  isLoading: false,
  error: null,
};

const adminDashboardSlice = createSlice({
  name: 'adminDashboard',
  initialState,
  reducers: {
    setStats(state, action: PayloadAction<DashboardStats>) {
      state.stats = action.payload;
      state.lastUpdated = new Date().toISOString();
    },
    setPendingLeaves(state, action: PayloadAction<LeaveRequest[]>) {
      state.pendingLeaves = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
});

export const {
  setStats,
  setPendingLeaves,
  setLoading,
  setError,
} = adminDashboardSlice.actions;

export default adminDashboardSlice.reducer;
