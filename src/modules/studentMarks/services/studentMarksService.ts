/**
 * Student marks service — owns the exam-type taxonomy and mark/grade
 * calculations client-side, and the real `/student-marks` fetch/update calls
 * server-side (mirrors `leaveManagementService`).
 */
import { store } from '../../../store';
import { apiService } from '../../../shared/services/api';
import type { Assessment, ExamTypeCode, StudentMark } from '../../../shared/types';
import { setAssessments, setAssessmentStatus, setLoading, setMarks, updateMark } from '../state/studentMarksSlice';

export interface ExamTypeConfig {
  code: ExamTypeCode;
  name: string;
  maxMarks: number;
  color: string;
}

export const EXAM_TYPES: ExamTypeConfig[] = [
  { code: 'MT', name: 'Monthly Test', maxMarks: 25, color: '#3498DB' },
  { code: 'PT-1', name: 'Periodic Test 1', maxMarks: 80, color: '#9B59B6' },
  { code: 'PT-2', name: 'Periodic Test 2', maxMarks: 80, color: '#9B59B6' },
  { code: 'TE-1', name: 'Term End Exam 1', maxMarks: 80, color: '#E67E22' },
  { code: 'TE-2', name: 'Term End Exam 2', maxMarks: 80, color: '#E67E22' },
  { code: 'HY', name: 'Half-Yearly', maxMarks: 80, color: '#2ECC71' },
  { code: 'ANN', name: 'Annual Exam', maxMarks: 80, color: '#E74C3C' },
];

/** Per-component input caps — must match the backend's `componentMax()`. */
export function componentMax(examCode: ExamTypeCode): { theory: number; practical: number; internal: number } {
  return { theory: examCode === 'MT' ? 20 : 70, practical: 20, internal: 10 };
}

const GRADE_BANDS: { min: number; grade: string }[] = [
  { min: 90, grade: 'A1' },
  { min: 80, grade: 'A2' },
  { min: 70, grade: 'B1' },
  { min: 60, grade: 'B2' },
  { min: 50, grade: 'C1' },
  { min: 40, grade: 'C2' },
  { min: 33, grade: 'D' },
  { min: 0, grade: 'E' },
];

/** Sum of entered components, or null if nothing has been entered yet. */
export function totalFor(mark: StudentMark): number | null {
  const parts = [mark.theoryMark, mark.practicalMark, mark.internalMark].filter(
    (v): v is number => v != null
  );
  if (parts.length === 0) return null;
  return parts.reduce((sum, v) => sum + v, 0);
}

export function gradeFor(mark: StudentMark, maxScore: number): string {
  const total = totalFor(mark);
  if (total == null || maxScore <= 0) return '-';
  const percentage = (total / maxScore) * 100;
  return GRADE_BANDS.find(band => percentage >= band.min)?.grade ?? '-';
}

interface BackendStudent {
  id: string;
  name: string;
  rollNo: string;
}

interface BackendAssessment {
  id: string;
  classId: string;
  subject: string;
  examType: ExamTypeCode;
  maxTheory: number;
  maxPractical: number;
  maxInternal: number;
  status: 'draft' | 'submitted';
}

interface BackendStudentMark {
  id: string;
  assessmentId: string;
  studentId: string;
  theoryMark: number | null;
  practicalMark: number | null;
  internalMark: number | null;
}

function toAssessment(a: BackendAssessment): Assessment {
  return {
    id: a.id,
    name: EXAM_TYPES.find(e => e.code === a.examType)?.name ?? a.examType,
    type: a.examType,
    maxScore: a.maxTheory + a.maxPractical + a.maxInternal,
    subjectId: a.subject,
    classId: a.classId,
    status: a.status,
  };
}

/** Fetches (auto-seeding server-side) all exam-type assessments + marks for a class/subject. */
export async function loadMarksData(classId: string, subject: string): Promise<void> {
  store.dispatch(setLoading(true));
  const response = await apiService.get<{
    students: BackendStudent[];
    assessments: BackendAssessment[];
    marks: BackendStudentMark[];
  }>(`/student-marks?classId=${encodeURIComponent(classId)}&subject=${encodeURIComponent(subject)}`);

  if (!response.success || !response.data) {
    store.dispatch(setLoading(false));
    return;
  }

  const studentNameById = new Map(response.data.students.map(s => [s.id, s.name]));
  const marks: StudentMark[] = response.data.marks.map(m => ({
    id: m.id,
    studentId: m.studentId,
    studentName: studentNameById.get(m.studentId) ?? 'Unknown student',
    assessmentId: m.assessmentId,
    theoryMark: m.theoryMark,
    practicalMark: m.practicalMark,
    internalMark: m.internalMark,
  }));

  store.dispatch(setAssessments(response.data.assessments.map(toAssessment)));
  store.dispatch(setMarks(marks));
  store.dispatch(setLoading(false));
}

export async function updateMarkValue(
  markId: string,
  component: 'theoryMark' | 'practicalMark' | 'internalMark',
  rawValue: string,
  max: number
): Promise<void> {
  if (rawValue.trim() === '') {
    store.dispatch(updateMark({ id: markId, component, value: null }));
    void apiService.patch(`/student-marks/${markId}`, { component, value: null });
    return;
  }
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) return;
  const clamped = Math.max(0, Math.min(max, parsed));
  store.dispatch(updateMark({ id: markId, component, value: clamped }));
  void apiService.patch(`/student-marks/${markId}`, { component, value: clamped });
}

export function submitForReview(assessmentId: string): void {
  store.dispatch(setAssessmentStatus({ id: assessmentId, status: 'submitted' }));
  void apiService.patch(`/student-marks/assessment/${assessmentId}/status`, { status: 'submitted' });
}

export function saveDraft(assessmentId: string): void {
  store.dispatch(setAssessmentStatus({ id: assessmentId, status: 'draft' }));
  void apiService.patch(`/student-marks/assessment/${assessmentId}/status`, { status: 'draft' });
}
