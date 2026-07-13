export { default as StaffAttendanceScreen } from './screens/StaffAttendanceScreen';
export { default as FaceEnrollmentScreen } from './screens/FaceEnrollmentScreen';
export { default as GpsStep, type GpsStepProps } from './components/GpsStep';
export { default as FaceStep, type FaceStepProps } from './components/FaceStep';
export { default as SuccessStep, type SuccessStepProps } from './components/SuccessStep';
export { default as staffAttendanceReducer } from './state/staffAttendanceSlice';
export * from './state/staffAttendanceSlice';
export {
  StaffAttendanceService,
  staffAttendanceService,
  nextAttemptState,
  SCHOOL_LOCATION_STORAGE_KEY,
} from './services/staffAttendanceService';
export type {
  StaffFaceOutcome,
  StaffFaceAttemptState,
  StaffAttendanceServiceDeps,
  StaffSubmitResult,
} from './services/staffAttendanceService';
export {
  ensureStaffEnrollment,
  useStaffEnrollmentGuard,
  type StaffEnrollmentGuardDecision,
  type EnsureStaffEnrollmentDeps,
} from './services/staffEnrollmentGuard';
