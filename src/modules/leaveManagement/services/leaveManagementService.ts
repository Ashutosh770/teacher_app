/**
 * Leave management service — owns loading leave balances/requests and
 * submitting new applications, keeping that logic out of the screen
 * components (mirrors the `studentAttendanceService` pattern).
 *
 * There is no backend yet (`shared/services/api.ts` points at a placeholder
 * URL), so this is a self-contained mock data source, the same approach
 * `mockAuthService` uses for auth. Swapping in a real API is a matter of
 * replacing the bodies of `loadLeaveData`/`submitLeaveRequest` with
 * `apiService` calls — the dispatch shape below is already what a real
 * fetch would populate.
 */
import { store } from '../../../store';
import type { LeaveRequest } from '../../../shared/types';
import { setBalances, setError, setLoading, setRequests, setSubmitting, addRequest } from '../state/leaveManagementSlice';

export const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave' },
  { code: 'EL', name: 'Earned Leave' },
  { code: 'SL', name: 'Sick Leave' },
  { code: 'ML', name: 'Maternity Leave' },
] as const;

function generateRequestId(): string {
  return `leave-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let loaded = false;

/** Seeds leave balances + requests into the store on first entry to the module. */
export function loadLeaveData(): void {
  if (loaded) return;
  loaded = true;

  store.dispatch(setLoading(true));
  store.dispatch(
    setBalances([
      { type: 'CL', total: 12, used: 3, remaining: 9 },
      { type: 'EL', total: 15, used: 5, remaining: 10 },
      { type: 'SL', total: 10, used: 2, remaining: 8 },
      { type: 'ML', total: 0, used: 0, remaining: 0 },
    ])
  );
  store.dispatch(
    setRequests([
      {
        id: 'leave-seed-1',
        userId: 'self',
        leaveType: 'CL',
        startDate: '2026-04-25',
        endDate: '2026-04-26',
        reason: 'Family function',
        status: 'pending',
        submittedAt: '2026-04-10T09:00:00.000Z',
      },
      {
        id: 'leave-seed-2',
        userId: 'self',
        leaveType: 'SL',
        startDate: '2026-03-28',
        endDate: '2026-03-29',
        reason: 'Fever',
        status: 'approved',
        submittedAt: '2026-03-27T09:00:00.000Z',
      },
      {
        id: 'leave-seed-3',
        userId: 'self',
        leaveType: 'CL',
        startDate: '2026-02-22',
        endDate: '2026-02-22',
        reason: 'Personal',
        status: 'rejected',
        submittedAt: '2026-02-20T09:00:00.000Z',
      },
    ])
  );
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
export function submitLeaveRequest(input: SubmitLeaveInput): SubmitLeaveResult {
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
  const request: LeaveRequest = {
    id: generateRequestId(),
    userId: 'self',
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason.trim(),
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };
  store.dispatch(addRequest(request));
  store.dispatch(setSubmitting(false));
  store.dispatch(setError(null));
  return { ok: true };
}
