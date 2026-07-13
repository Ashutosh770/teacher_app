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
import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useAppSelector } from '../../../store';
import { colors, spacing, typography, borderRadius, withAlpha } from '../../../shared/theme';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import { staffAttendanceService } from '../services/staffAttendanceService';
import { faceCaptureService } from '../../../shared/services/faceCapture';
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

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Real camera preview + capture binding (Req 4.5/5.2). `attachCamera` gives
  // `staffAttendanceService.captureAndMatch()` a live controller to call
  // `takePhoto()` on; without this the capture step always fails with
  // "Camera is not attached". `device` is undefined on simulators/web with no
  // front camera, in which case the decorative gradient panel below is shown
  // instead so the UI never crashes when no real camera exists.
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('front');
  useEffect(() => {
    if (cameraRef.current) {
      faceCaptureService.attachCamera(cameraRef.current);
    }
    return () => {
      faceCaptureService.detachCamera();
    };
  }, [device]);

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
          style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>Submit attendance</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.stepLabel}>Step 2</Text>
      <Text style={styles.title}>Face Verification</Text>
      <Text style={styles.subtitle}>
        Center your face in the oval and hold still while we verify you.
      </Text>

      {/* Camera capture panel — live preview when a front camera is available
          (device/dev-client dependent), otherwise the decorative fallback. */}
      <View style={styles.cameraPanel}>
        {device ? (
          <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
        ) : (
          <LinearGradient colors={['#2D3748', '#1A202C']} style={StyleSheet.absoluteFill} />
        )}

        <View style={styles.cameraCenter} pointerEvents="none">
          <Animated.View
            style={[
              styles.ovalGuide,
              { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0.3] }) },
            ]}
          />
          {isPending ? (
            <ActivityIndicator color={colors.surface} style={styles.cameraSpinner} />
          ) : !device ? (
            <Feather name="camera" size={36} color="rgba(255,255,255,0.3)" style={styles.cameraSpinner} />
          ) : null}
        </View>

        <View style={styles.cameraTopPill}>
          <View style={styles.glassPill}>
            <Text style={styles.glassPillText}>Position your face in the oval</Text>
          </View>
        </View>

        {!liveness.blinkDetected && liveness.faceDetected ? (
          <View style={styles.cameraBottomPill}>
            <View style={[styles.glassPill, styles.glassPillWarning]}>
              <Feather name="eye" size={16} color={colors.surface} />
              <Text style={[styles.glassPillText, styles.glassPillTextOnWarning]}>Please blink…</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.cornerGuide, styles.cornerTL]} />
        <View style={[styles.cornerGuide, styles.cornerTR]} />
        <View style={[styles.cornerGuide, styles.cornerBL]} />
        <View style={[styles.cornerGuide, styles.cornerBR]} />
      </View>

      {/* Live liveness checklist. */}
      <View style={styles.statusStack}>
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
        style={[styles.primaryButton, isPending && styles.buttonDisabled]}
        onPress={onCapture}
        disabled={isPending}
      >
        <Text style={styles.primaryButtonText}>
          {isMatching ? 'Verifying…' : isRetry ? 'Try again' : 'Capture'}
        </Text>
      </TouchableOpacity>

    </View>
  );
}

function LivenessRow({ label, done }: { label: string; done: boolean }) {
  const tone = done ? colors.success : colors.warning;
  return (
    <View style={[styles.statusRow, { backgroundColor: withAlpha(tone, 0.1) }]}>
      {done ? (
        <Feather name="check-circle" size={18} color={tone} />
      ) : (
        <View style={[styles.pendingDot, { borderColor: tone }]} />
      )}
      <Text style={[styles.statusLabel, { marginLeft: spacing.sm }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  stepLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  cameraPanel: {
    aspectRatio: 3 / 4,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  cameraCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ovalGuide: {
    position: 'absolute',
    width: 190,
    height: 240,
    borderRadius: 130,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  cameraSpinner: {
    opacity: 0.6,
  },
  cameraTopPill: {
    position: 'absolute',
    top: spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cameraBottomPill: {
    position: 'absolute',
    bottom: spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: withAlpha('#FFFFFF', 0.95),
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + spacing.xs,
    borderRadius: borderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  glassPillWarning: {
    backgroundColor: withAlpha(colors.warning, 0.95),
  },
  glassPillText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  glassPillTextOnWarning: {
    color: colors.surface,
  },
  cornerGuide: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.surface,
  },
  cornerTL: { top: spacing.md, left: spacing.md, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: borderRadius.md },
  cornerTR: { top: spacing.md, right: spacing.md, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: borderRadius.md },
  cornerBL: { bottom: spacing.md, left: spacing.md, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: borderRadius.md },
  cornerBR: { bottom: spacing.md, right: spacing.md, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: borderRadius.md },
  statusStack: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  statusLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  pendingDot: {
    width: 18,
    height: 18,
    borderRadius: borderRadius.full,
    borderWidth: 2,
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
    backgroundColor: withAlpha(colors.success, 0.1),
    borderWidth: 1,
    borderColor: colors.success,
  },
  bannerText: {
    ...typography.body,
    color: colors.text,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.secondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.surface,
    ...typography.body,
    fontWeight: '700',
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
