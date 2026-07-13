import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { StudentMark, Assessment } from '../../../shared/types';

interface StudentMarksState {
  marks: StudentMark[];
  assessments: Assessment[];
  selectedClassId: string | null;
  selectedSubjectId: string | null;
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
}

const initialState: StudentMarksState = {
  marks: [],
  assessments: [],
  selectedClassId: null,
  selectedSubjectId: null,
  isLoading: false,
  error: null,
  isSubmitting: false,
};

const studentMarksSlice = createSlice({
  name: 'studentMarks',
  initialState,
  reducers: {
    setMarks(state, action: PayloadAction<StudentMark[]>) {
      state.marks = action.payload;
    },
    setAssessments(state, action: PayloadAction<Assessment[]>) {
      state.assessments = action.payload;
    },
    updateMark(
      state,
      action: PayloadAction<{
        id: string;
        component: 'theoryMark' | 'practicalMark' | 'internalMark';
        value: number | null;
      }>
    ) {
      const existing = state.marks.find(m => m.id === action.payload.id);
      if (existing) {
        existing[action.payload.component] = action.payload.value;
      }
    },
    setAssessmentStatus(state, action: PayloadAction<{ id: string; status: 'draft' | 'submitted' }>) {
      const assessment = state.assessments.find(a => a.id === action.payload.id);
      if (assessment) {
        assessment.status = action.payload.status;
      }
    },
    setSelectedClass(state, action: PayloadAction<string | null>) {
      state.selectedClassId = action.payload;
    },
    setSelectedSubject(state, action: PayloadAction<string | null>) {
      state.selectedSubjectId = action.payload;
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
  setMarks,
  setAssessments,
  updateMark,
  setAssessmentStatus,
  setSelectedClass,
  setSelectedSubject,
  setLoading,
  setError,
  setSubmitting,
} = studentMarksSlice.actions;

export default studentMarksSlice.reducer;
