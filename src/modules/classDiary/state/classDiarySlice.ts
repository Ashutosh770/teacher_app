import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DiaryEntry } from '../../../shared/types';

interface ClassDiaryState {
  entries: DiaryEntry[];
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
}

const initialState: ClassDiaryState = {
  entries: [],
  isLoading: false,
  error: null,
  isSubmitting: false,
};

const classDiarySlice = createSlice({
  name: 'classDiary',
  initialState,
  reducers: {
    setEntries(state, action: PayloadAction<DiaryEntry[]>) {
      state.entries = action.payload;
    },
    addEntry(state, action: PayloadAction<DiaryEntry>) {
      state.entries.unshift(action.payload);
    },
    updateEntry(state, action: PayloadAction<DiaryEntry>) {
      const index = state.entries.findIndex(e => e.id === action.payload.id);
      if (index !== -1) {
        state.entries[index] = action.payload;
      }
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
  setEntries,
  addEntry,
  updateEntry,
  setLoading,
  setError,
  setSubmitting,
} = classDiarySlice.actions;

export default classDiarySlice.reducer;
