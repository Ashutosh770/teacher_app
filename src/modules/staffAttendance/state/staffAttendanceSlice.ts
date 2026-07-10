import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AttendanceRecord } from '../../../shared/types';

interface StaffAttendanceState {
  records: AttendanceRecord[];
  selectedDate: string;
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
}

const initialState: StaffAttendanceState = {
  records: [],
  selectedDate: new Date().toISOString().split('T')[0],
  isLoading: false,
  error: null,
  isSubmitting: false,
};

const staffAttendanceSlice = createSlice({
  name: 'staffAttendance',
  initialState,
  reducers: {
    setRecords(state, action: PayloadAction<AttendanceRecord[]>) {
      state.records = action.payload;
    },
    updateRecord(state, action: PayloadAction<{ id: string; status: 'present' | 'absent' }>) {
      const record = state.records.find(r => r.id === action.payload.id);
      if (record) {
        record.status = action.payload.status;
      }
    },
    setSelectedDate(state, action: PayloadAction<string>) {
      state.selectedDate = action.payload;
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
  setRecords,
  updateRecord,
  setSelectedDate,
  setLoading,
  setError,
  setSubmitting,
} = staffAttendanceSlice.actions;

export default staffAttendanceSlice.reducer;
