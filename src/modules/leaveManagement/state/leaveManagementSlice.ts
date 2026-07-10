import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { LeaveRequest } from '../../../shared/types';

interface LeaveBalance {
  type: string;
  total: number;
  used: number;
  remaining: number;
}

interface LeaveManagementState {
  requests: LeaveRequest[];
  balances: LeaveBalance[];
  pendingApprovals: LeaveRequest[];
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
}

const initialState: LeaveManagementState = {
  requests: [],
  balances: [],
  pendingApprovals: [],
  isLoading: false,
  error: null,
  isSubmitting: false,
};

const leaveManagementSlice = createSlice({
  name: 'leaveManagement',
  initialState,
  reducers: {
    setRequests(state, action: PayloadAction<LeaveRequest[]>) {
      state.requests = action.payload;
    },
    setBalances(state, action: PayloadAction<LeaveBalance[]>) {
      state.balances = action.payload;
    },
    setPendingApprovals(state, action: PayloadAction<LeaveRequest[]>) {
      state.pendingApprovals = action.payload;
    },
    addRequest(state, action: PayloadAction<LeaveRequest>) {
      state.requests.unshift(action.payload);
    },
    updateRequestStatus(state, action: PayloadAction<{ id: string; status: 'approved' | 'rejected' }>) {
      const request = state.requests.find(r => r.id === action.payload.id);
      if (request) {
        request.status = action.payload.status;
      }
      state.pendingApprovals = state.pendingApprovals.filter(r => r.id !== action.payload.id);
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setSubmitting(state, action: PayloadAction<boolean>) {
      state.isSubmitting = action.payload;
    },
  },
});

export const {
  setRequests,
  setBalances,
  setPendingApprovals,
  addRequest,
  updateRequestStatus,
  setLoading,
  setError,
  setSubmitting,
} = leaveManagementSlice.actions;

export default leaveManagementSlice.reducer;
