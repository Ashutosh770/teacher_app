/**
 * Student marks service — owns the exam-type taxonomy, mock data seeding, and
 * mark/grade calculations, keeping that logic out of the screen component
 * (mirrors `leaveManagementService`). There is no backend yet, so this seeds
 * a self-contained mock roster the same way `mockAuthService` mocks auth.
 */
import { store } from '../../../store';
import type { Assessment, ExamTypeCode, StudentMark } from '../../../shared/types';
import { setAssessments, setAssessmentStatus, setMarks, updateMark } from '../state/studentMarksSlice';

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

/** Per-component input caps, matching the Figma mock's input `max` attributes. */
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

const seededKeys = new Set<string>();

/** Seeds mock assessments (one per exam type) + a mock roster's marks for a class/subject. */
export function loadMarksData(classId: string, subjectId: string): void {
  const key = `${classId}::${subjectId}`;
  if (seededKeys.has(key)) return;
  seededKeys.add(key);

  const assessments: Assessment[] = EXAM_TYPES.map(exam => ({
    id: `assessment-${key}-${exam.code}`,
    name: exam.name,
    type: exam.code,
    maxScore: exam.maxMarks,
    subjectId,
    classId,
    status: 'draft',
  }));

  const rosterSeed: Array<{ name: string; rollNo: string; theory: number | null; practical: number | null; internal: number | null }> = [
    { name: 'Aarav Kumar', rollNo: '01', theory: 68, practical: 18, internal: 8 },
    { name: 'Diya Patel', rollNo: '02', theory: 72, practical: 19, internal: 9 },
    { name: 'Arjun Singh', rollNo: '03', theory: 65, practical: 17, internal: 8 },
    { name: 'Ananya Sharma', rollNo: '04', theory: null, practical: null, internal: null },
    { name: 'Vihaan Gupta', rollNo: '05', theory: 58, practical: 16, internal: 7 },
  ];

  const marks: StudentMark[] = assessments.flatMap(assessment =>
    rosterSeed.map((student, index) => ({
      id: `mark-${assessment.id}-${index}`,
      studentId: `student-${key}-${index}`,
      studentName: student.name,
      assessmentId: assessment.id,
      // Only the default-visible exam (PT-1) ships pre-filled sample marks;
      // every other exam type starts blank so the "Draft"/pending state reads
      // truthfully rather than looking pre-completed everywhere.
      theoryMark: assessment.type === 'PT-1' ? student.theory : null,
      practicalMark: assessment.type === 'PT-1' ? student.practical : null,
      internalMark: assessment.type === 'PT-1' ? student.internal : null,
    }))
  );

  store.dispatch(setAssessments([...store.getState().studentMarks.assessments, ...assessments]));
  store.dispatch(setMarks([...store.getState().studentMarks.marks, ...marks]));
}

export function updateMarkValue(
  markId: string,
  component: 'theoryMark' | 'practicalMark' | 'internalMark',
  rawValue: string,
  max: number
): void {
  if (rawValue.trim() === '') {
    store.dispatch(updateMark({ id: markId, component, value: null }));
    return;
  }
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) return;
  const clamped = Math.max(0, Math.min(max, parsed));
  store.dispatch(updateMark({ id: markId, component, value: clamped }));
}

export function submitForReview(assessmentId: string): void {
  store.dispatch(setAssessmentStatus({ id: assessmentId, status: 'submitted' }));
}

export function saveDraft(assessmentId: string): void {
  store.dispatch(setAssessmentStatus({ id: assessmentId, status: 'draft' }));
}
