import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AttendanceRecord } from '../../../shared/types';

interface StudentAttendanceState {
  records: AttendanceRecord[];
  selectedClassId: string | null;
  selectedDate: string;
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
}

const initialState: StudentAttendanceState = {
  records: [],
  selectedClassId: null,
  selectedDate: new Date().toISOString().split('T')[0],
  isLoading: false,
  error: null,
  isSubmitting: false,
};

const studentAttendanceSlice = createSlice({
  name: 'studentAttendance',
  initialState,
  reducers: {
    setRecords(state, action: PayloadAction<AttendanceRecord[]>) {
      state.records = action.payload;
    },
    updateRecord(state, action: PayloadAction<{ id: string; status: 'present' | 'absent' | 'late' }>) {
      const record = state.records.find(r => r.id === action.payload.id);
      if (record) {
        record.status = action.payload.status;
      }
    },
    setSelectedClass(state, action: PayloadAction<string | null>) {
      state.selectedClassId = action.payload;
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
  setSelectedClass,
  setSelectedDate,
  setLoading,
  setError,
  setSubmitting,
} = studentAttendanceSlice.actions;

export default studentAttendanceSlice.reducer;
