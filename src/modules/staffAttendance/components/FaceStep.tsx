/**
 * Face verification step of the staff attendance flow (task 10.1).
 *
 * Presentational step driven by the `staffAttendance` slice: renders the oval
 * capture guide, the live liveness checklist (face detected / blink / pose) from
 * `face.liveness`, and an attempt counter ("attempt X of maxStaffAttempts"). The
 * capture action drives `staffAttendanceService.captureAndMatch()` (first
 * attempt) / `retryFace()` (subsequent attempts). When the flow reaches
 * `confirm` (face verified or manual fallback) it exposes a submit action that
 * drives `staffAttendanceService.submit()` so the flow can reach the success grid.
 *
 * Detailed camera-permission / manual-fallback recovery controls are task 10.2;
 * optional callback props are declared as seams.
 *
 * Requirements: 5.2
 */
import React, { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppSelector } from '../../../store';
import { colors, spacing, typography, borderRadius } from '../../../shared/theme';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import { staffAttendanceService } from '../services/staffAttendanceService';
import { cameraPermissionManager } from '../../../shared/services/permissions';
import type { StaffFlowState } from '../state/staffAttendanceSlice';

/**
 * Seams for task 10.2. Optional so the router can render the face step today;
 * 10.2 will supply the camera-permission / manual-fallback handlers.
 */
export interface FaceStepProps {
  /** Retry camera permission (denied, not blocked) (Req 4.3). */
  onRetryPermission?: () => void;
  /** Open OS settings when the camera permission is blocked (Req 4.4). */
  onOpenSettings?: () => void;
  /** Switch to manual marking when the camera is unavailable (Req 4.5). */
  onManualFallback?: () => void;
}

const CAPTURE_PENDING_STATES: ReadonlySet<StaffFlowState> = new Set<StaffFlowState>([
  'camera_permission',
  'face_matching',
]);

export default function FaceStep(props: FaceStepProps): React.ReactElement {
  const flowState = useAppSelector((s) => s.staffAttendance.flowState);
  const attempts = useAppSelector((s) => s.staffAttendance.face.attempts);
  const liveness = useAppSelector((s) => s.staffAttendance.face.liveness);
  const lastConfidence = useAppSelector((s) => s.staffAttendance.face.lastConfidence);
  const errorMessage = useAppSelector((s) => s.staffAttendance.error);
  const isSubmitting = useAppSelector((s) => s.staffAttendance.isSubmitting);
  const cameraPermission = useAppSelector((s) => s.staffAttendance.cameraPermission);

  const maxAttempts = attendanceConfig.face.maxStaffAttempts;
  const isMatching = flowState === 'face_matching';
  const isPending = CAPTURE_PENDING_STATES.has(flowState);
  const isConfirm = flowState === 'confirm';
  const isRetry =
    flowState === 'attempt_failed' || flowState === 'face_failed' || flowState === 'service_error';

  const onCapture = useCallback(() => {
    if (isRetry) {
      void staffAttendanceService.retryFace();
    } else {
      void staffAttendanceService.captureAndMatch();
    }
  }, [isRetry]);

  const onSubmit = useCallback(() => {
    void staffAttendanceService.submit();
  }, []);

  // Retry camera permission (denied, not blocked) — re-enters the face step,
  // which re-checks/requests the permission (Req 4.3).
  const onRetryPermission = useCallback(() => {
    if (props.onRetryPermission) {
      props.onRetryPermission();
      return;
    }
    void staffAttendanceService.startFaceStep();
  }, [props]);

  // Open OS settings when the camera permission is blocked (Req 4.4).
  const onOpenSettings = useCallback(() => {
    if (props.onOpenSettings) {
      props.onOpenSettings();
      return;
    }
    void cameraPermissionManager.openSettings();
  }, [props]);

  // Manual (geo-verified location preserved) fallback when the camera is
  // unavailable (Req 4.5).
  const onManualFallback = useCallback(() => {
    if (props.onManualFallback) {
      props.onManualFallback();
      return;
    }
    staffAttendanceService.useManualFallback();
  }, [props]);

  // Camera DENIED / BLOCKED recovery view (Req 4.3/4.4/4.5). Rendered instead of
  // the capture UI so the teacher can recover permission or mark manually.
  if (flowState === 'camera_denied') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.subtitle}>
          Camera access is required to verify your identity. Grant access to continue, or mark your
          attendance manually.
        </Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.controls}>
          {/* DENIED (not blocked): retry the permission request. Hidden when the
              permission is undetermined or granted. */}
          {cameraPermission === 'denied' ? (
            <TouchableOpacity style={styles.button} onPress={onRetryPermission}>
              <Text style={styles.buttonText}>Retry</Text>
            </TouchableOpacity>
          ) : null}

          {/* BLOCKED: open the OS settings screen. */}
          {cameraPermission === 'blocked' ? (
            <TouchableOpacity style={styles.button} onPress={onOpenSettings}>
              <Text style={styles.buttonText}>Open settings</Text>
            </TouchableOpacity>
          ) : null}

          {/* Manual fallback is always available when the camera cannot be used. */}
          <TouchableOpacity style={styles.secondaryButton} onPress={onManualFallback}>
            <Text style={styles.secondaryButtonText}>Mark manually</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Attempt counter is displayed as a 1-based "current attempt" against the cap.
  const currentAttempt = Math.min(attempts + (isConfirm ? 0 : 1), maxAttempts);

  if (isConfirm) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Confirm attendance</Text>
        <View style={[styles.banner, styles.bannerSuccess]}>
          <Text style={styles.bannerText}>
            {lastConfidence !== null
              ? `Face verified (${Math.round(lastConfidence)}% match). Submit to record your attendance.`
              : 'Ready to submit your attendance.'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit attendance</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Face verification</Text>
      <Text style={styles.subtitle}>
        Center your face in the oval and hold still while we verify you.
      </Text>

      {/* Oval capture guide. */}
      <View style={styles.ovalWrap}>
        <View style={styles.oval}>
          {isPending ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      </View>

      {/* Live liveness checklist. */}
      <View style={styles.checklist}>
        <LivenessRow label="Face detected" done={liveness.faceDetected} />
        <LivenessRow label="Blink detected" done={liveness.blinkDetected} />
        <LivenessRow label="Pose OK" done={liveness.poseOk} />
      </View>

      {/* Attempt counter. */}
      <Text style={styles.attemptCounter}>
        Attempt {currentAttempt} of {maxAttempts}
      </Text>

      {flowState === 'attempt_failed' && lastConfidence !== null ? (
        <Text style={styles.warnText}>
          No match ({Math.round(lastConfidence)}%). Please try again.
        </Text>
      ) : null}
      {flowState === 'face_failed' ? (
        <Text style={styles.warnText}>Maximum attempts reached. You can try again.</Text>
      ) : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <TouchableOpacity
        style={[styles.button, isPending && styles.buttonDisabled]}
        onPress={onCapture}
        disabled={isPending}
      >
        <Text style={styles.buttonText}>
          {isMatching ? 'Verifying…' : isRetry ? 'Try again' : 'Capture'}
        </Text>
      </TouchableOpacity>

    </View>
  );
}

function LivenessRow({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkDot, { backgroundColor: done ? colors.success : colors.disabled }]}>
        <Text style={styles.checkMark}>{done ? '✓' : ''}</Text>
      </View>
      <Text style={[styles.checkLabel, done && styles.checkLabelDone]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  ovalWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  oval: {
    width: 200,
    height: 260,
    borderRadius: 130,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checklist: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  checkMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  checkLabelDone: {
    color: colors.text,
    fontWeight: '600',
  },
  attemptCounter: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  warnText: {
    ...typography.caption,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  banner: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: colors.success,
  },
  bannerText: {
    ...typography.body,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    color: '#fff',
    ...typography.body,
    fontWeight: '600',
  },
  controls: {
    gap: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    ...typography.body,
    fontWeight: '600',
  },
});
