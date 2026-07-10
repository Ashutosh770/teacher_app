import type { AttendanceRecord } from './index';

export interface SchoolLocation {
  latitude: number;
  longitude: number;
  radiusMeters: number; // clamped 10..500 at read time; default 100
}

export interface FaceEnrollmentRecord {
  personId: string;
  personType: 'staff' | 'student';
  embedding: number[];
  imageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAttendanceRecord extends AttendanceRecord {
  markedAt: string;
  locationStatus: 'verified' | 'failed';
  distanceMeters: number | null;
  faceMatchConfidence: number | null;
  markedManually: boolean;
  syncState: 'synced' | 'pending' | 'failed';
}

export type EnrollmentStatus = 'enrolled' | 'not_enrolled';
export type RosterAttendanceStatus = 'present' | 'absent' | 'pending' | 'unmarked';
export type StatusSource = 'face_match' | 'manual';

export interface RosterStudent {
  id: string;
  name: string;
  rollNo: string;
  enrollmentStatus: EnrollmentStatus;
  attendanceStatus: RosterAttendanceStatus;
  statusSource: StatusSource | null;
  faceMatchConfidence: number | null;
}

export interface UnresolvedDetection {
  id: string;
  confidence: number;
  timestamp: number;
}
