/**
 * Staff attendance screen — a step ROUTER keyed off the `staffAttendance` slice's
 * `flowState` (design → "Screen composition"). It renders one of three
 * presentational steps — `GpsStep`, `FaceStep`, `SuccessStep` — while the
 * `staffAttendanceService` state machine owns all transitions.
 *
 * On mount it enforces the enrollment guard (`useStaffEnrollmentGuard`) and kicks
 * off the flow via `staffAttendanceService.begin()`. When the flow lands in
 * `needs_enrollment` (no `FaceEnrollmentRecord`), it surfaces the enrollment
 * screen so the teacher can self-enroll before attempting the face step (Req 7.1).
 *
 * The detailed permission/error recovery controls (retry / open-settings /
 * manual fallback) are task 10.2; this router leaves those as seams on the step
 * components.
 *
 * Requirements: 2.5, 3.2, 5.2, 6.2, 6.5
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppSelector } from '../../../store';
import { colors, moduleAccent, spacing, typography } from '../../../shared/theme';
import { ScreenHeader } from '../../../shared/components';
import { staffAttendanceService } from '../services/staffAttendanceService';
import { useStaffEnrollmentGuard } from '../services/staffEnrollmentGuard';
import type { StaffFlowState } from '../state/staffAttendanceSlice';
import GpsStep from '../components/GpsStep';
import FaceStep from '../components/FaceStep';
import SuccessStep from '../components/SuccessStep';
import FaceEnrollmentScreen from './FaceEnrollmentScreen';

/** Which step component owns a given flow state. */
type StepKind = 'loading' | 'enrollment' | 'gps' | 'face' | 'success';

const GPS_STATES: ReadonlySet<StaffFlowState> = new Set<StaffFlowState>([
  'location_permission',
  'location_denied',
  'acquiring_gps',
  'gps_error',
  'evaluate_fence',
  'unreliable',
  'mock_detected',
  'out_of_fence',
  'location_verified',
  'manual_fallback',
]);

const FACE_STATES: ReadonlySet<StaffFlowState> = new Set<StaffFlowState>([
  'camera_permission',
  'camera_denied',
  'face_capture',
  'face_matching',
  'attempt_failed',
  'face_failed',
  'service_error',
  'confirm',
]);

const SUCCESS_STATES: ReadonlySet<StaffFlowState> = new Set<StaffFlowState>([
  'success',
  'already_marked',
  'pending_sync',
  'persist_error',
]);

function stepFor(flowState: StaffFlowState): StepKind {
  if (flowState === 'needs_enrollment') return 'enrollment';
  if (GPS_STATES.has(flowState)) return 'gps';
  if (FACE_STATES.has(flowState)) return 'face';
  if (SUCCESS_STATES.has(flowState)) return 'success';
  return 'loading';
}

export interface StaffAttendanceScreenProps {
  /** When true, renders without its own header — used when embedded under a
   * shared Attendance-tab header/mode-switcher (see `AttendanceTabScreen`). */
  embedded?: boolean;
}

export default function StaffAttendanceScreen({ embedded = false }: StaffAttendanceScreenProps = {}): React.ReactElement {
  const flowState = useAppSelector((s) => s.staffAttendance.flowState);

  // Enforce the enrollment guard, then begin the flow. When enrollment is
  // missing the guard drives the flow to `needs_enrollment`; we surface the
  // enrollment screen inline (no dedicated route is registered).
  const runGuard = useStaffEnrollmentGuard();
  useEffect(() => {
    let active = true;
    void (async () => {
      const decision = await runGuard();
      if (!active) return;
      if (decision.allowed) {
        await staffAttendanceService.begin();
      }
    })();
    return () => {
      active = false;
    };
  }, [runGuard]);

  const step = stepFor(flowState);

  if (step === 'enrollment') {
    // Redirect target: render the self-enrollment screen so the teacher can
    // enroll before the face step (Req 7.1).
    return <FaceEnrollmentScreen />;
  }

  return (
    <View style={styles.screen}>
      {!embedded && (
        <ScreenHeader
          title="Mark Attendance"
          subtitle="Verify your location and face"
          gradientColors={moduleAccent.attendance.gradient}
        />
      )}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'loading' ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Preparing attendance…</Text>
          </View>
        ) : step === 'gps' ? (
          <GpsStep />
        ) : step === 'face' ? (
          <FaceStep />
        ) : (
          <SuccessStep />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
