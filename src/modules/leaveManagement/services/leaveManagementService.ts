/**
 * Leave management service — owns loading leave balances/requests and
 * submitting new applications, keeping that logic out of the screen
 * components (mirrors the `studentAttendanceService` pattern). Backed by the
 * real `/leave-management` endpoints.
 */
import { store } from '../../../store';
import { apiService } from '../../../shared/services/api';
import type { LeaveRequest } from '../../../shared/types';
import { setBalances, setError, setLoading, setRequests, setSubmitting, addRequest } from '../state/leaveManagementSlice';

export const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave' },
  { code: 'EL', name: 'Earned Leave' },
  { code: 'SL', name: 'Sick Leave' },
  { code: 'ML', name: 'Maternity Leave' },
] as const;

interface BackendLeave {
  id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface BackendBalance {
  id: string;
  userId: string;
  type: string;
  total: number;
  used: number;
}

function toLeaveRequest(leave: BackendLeave): LeaveRequest {
  return {
    id: leave.id,
    userId: leave.userId,
    leaveType: leave.type,
    startDate: leave.startDate,
    endDate: leave.endDate,
    reason: leave.reason,
    status: leave.status,
    submittedAt: leave.createdAt,
  };
}

/** Fetches leave balances + requests for the signed-in user. */
export async function loadLeaveData(): Promise<void> {
  store.dispatch(setLoading(true));
  const response = await apiService.get<{ requests: BackendLeave[]; balances: BackendBalance[] }>(
    '/leave-management'
  );
  if (!response.success || !response.data) {
    store.dispatch(setError(response.error ?? 'Failed to load leave data'));
    store.dispatch(setLoading(false));
    return;
  }

  store.dispatch(setRequests(response.data.requests.map(toLeaveRequest)));
  store.dispatch(
    setBalances(
      response.data.balances.map(b => ({
        type: b.type,
        total: b.total,
        used: b.used,
        remaining: b.total - b.used,
      }))
    )
  );
  store.dispatch(setError(null));
  store.dispatch(setLoading(false));
}

export interface SubmitLeaveInput {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export type SubmitLeaveResult = { ok: true } | { ok: false; error: string };

/** Validates and submits a new leave application (Req: apply-leave form). */
export async function submitLeaveRequest(input: SubmitLeaveInput): Promise<SubmitLeaveResult> {
  if (!input.leaveType) {
    return { ok: false, error: 'Select a leave type.' };
  }
  if (!input.startDate || !input.endDate) {
    return { ok: false, error: 'Select both a from and to date.' };
  }
  if (new Date(input.endDate) < new Date(input.startDate)) {
    return { ok: false, error: 'To date must be on or after the from date.' };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'Enter a reason for leave.' };
  }

  store.dispatch(setSubmitting(true));
  const response = await apiService.post<BackendLeave>('/leave-management', {
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason.trim(),
  });
  store.dispatch(setSubmitting(false));

  if (!response.success || !response.data) {
    const error = response.error ?? 'Failed to submit leave request';
    store.dispatch(setError(error));
    return { ok: false, error };
  }

  store.dispatch(addRequest(toLeaveRequest(response.data)));
  // Re-fetch balances since the server reserved the requested days against them.
  void loadLeaveData();
  store.dispatch(setError(null));
  return { ok: true };
}
