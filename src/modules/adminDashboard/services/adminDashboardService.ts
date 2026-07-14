import { store } from '../../../store';
import { apiService } from '../../../shared/services/api';
import type { LeaveRequest } from '../../../shared/types';
import { setStats, setPendingLeaves, setLoading, setError } from '../state/adminDashboardSlice';

interface DashboardStatsResponse {
  stats: {
    staffAttendancePercent: number;
    studentAttendancePercent: number;
    pendingLeaveCount: number;
    announcementCount: number;
  };
  pendingLeaves: LeaveRequest[];
}

/** Fetches today's admin dashboard stats + pending leave requests. */
export async function loadDashboardStats(): Promise<void> {
  store.dispatch(setLoading(true));
  const response = await apiService.get<DashboardStatsResponse>('/admin-dashboard/stats');
  if (!response.success || !response.data) {
    store.dispatch(setError(response.error ?? 'Failed to load dashboard stats'));
    store.dispatch(setLoading(false));
    return;
  }

  store.dispatch(setStats(response.data.stats));
  store.dispatch(setPendingLeaves(response.data.pendingLeaves));
  store.dispatch(setError(null));
  store.dispatch(setLoading(false));
}
