import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { TimetableEntry } from '../../../shared/types';

interface TimeTableState {
  entries: TimetableEntry[];
  selectedDay: string;
  currentWeekOffset: number;
  isLoading: boolean;
  error: string | null;
}

const initialState: TimeTableState = {
  entries: [],
  selectedDay: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
  currentWeekOffset: 0,
  isLoading: false,
  error: null,
};

const timeTableSlice = createSlice({
  name: 'timeTable',
  initialState,
  reducers: {
    setEntries(state, action: PayloadAction<TimetableEntry[]>) {
      state.entries = action.payload;
    },
    setSelectedDay(state, action: PayloadAction<string>) {
      state.selectedDay = action.payload;
    },
    setWeekOffset(state, action: PayloadAction<number>) {
      state.currentWeekOffset = action.payload;
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
  setEntries,
  setSelectedDay,
  setWeekOffset,
  setLoading,
  setError,
} = timeTableSlice.actions;

export default timeTableSlice.reducer;
