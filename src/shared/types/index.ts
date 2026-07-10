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

export interface StudentMark {
  id: string;
  studentId: string;
  studentName: string;
  assessmentId: string;
  mark: number;
}

export interface Assessment {
  id: string;
  name: string;
  type: 'exam' | 'assignment' | 'quiz';
  maxScore: number;
  subjectId: string;
  classId: string;
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
