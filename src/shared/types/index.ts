export type UserRole = 'teacher' | 'admin';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  allowedModules: string[];
}

export interface Session {
  token: string;
  expiresAt: number;
  user: User;
}

export interface SyncQueueItem {
  id: string;
  module: string;
  action: string;
  payload: unknown;
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  /**
   * Optional per-item cap on sync attempts before the item is marked
   * permanently `failed`. Attendance-related items carry
   * `attendanceConfig.offline.maxSyncAttempts` (5); items without this field
   * fall back to the default retry policy (MAX_RETRIES = 3) so other modules
   * are unaffected. (Req 15.2, 15.5)
   */
  maxAttempts?: number;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  personId: string;
  personName: string;
  status: 'present' | 'absent' | 'late' | 'unmarked';
}

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

export interface TimetableEntry {
  id: string;
  day: string;
  timeSlot: string;
  subject: string;
  className: string;
  room: string;
}

/** CBSE-style exam type codes used by the marks entry screen. */
export type ExamTypeCode = 'MT' | 'PT-1' | 'PT-2' | 'TE-1' | 'TE-2' | 'HY' | 'ANN';

export interface StudentMark {
  id: string;
  studentId: string;
  studentName: string;
  assessmentId: string;
  /** Null means "not entered yet" (rendered as a blank input, matching Figma). */
  theoryMark: number | null;
  practicalMark: number | null;
  internalMark: number | null;
}

export interface Assessment {
  id: string;
  name: string;
  type: ExamTypeCode;
  maxScore: number;
  subjectId: string;
  classId: string;
  status: 'draft' | 'submitted';
}

export interface DiaryEntry {
  id: string;
  date: string;
  classId: string;
  className: string;
  subject: string;
  topicsCovered: string;
  homework?: string;
  isFinalized: boolean;
  /** When the entry was created — drives the 24h edit/delete lock window. */
  postedAt: string;
  attachmentName?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  targetAudience: string;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  createdAt: string;
  isRead: boolean;
  category?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type {
  SchoolLocation,
  FaceEnrollmentRecord,
  StaffAttendanceRecord,
  RosterStudent,
  UnresolvedDetection,
  EnrollmentStatus,
  RosterAttendanceStatus,
  StatusSource,
} from './attendance';
