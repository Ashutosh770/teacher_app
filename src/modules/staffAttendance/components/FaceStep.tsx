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
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';
import { useAppDispatch, useAppSelector } from '../../../store';
import { setLiveness } from '../state/staffAttendanceSlice';
import {
  applyFrame,
  isReadyToCapture,
  INITIAL_LIVENESS,
  type FaceFrameMetrics,
  type LivenessState,
} from '../../../shared/services/liveness';
import {
  borderRadius,
  colors,
  gradients,
  motion,
  shadows,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import { Button, Card, EmptyState, ProgressBar } from '../../../shared/components';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import { staffAttendanceService } from '../services/staffAttendanceService';
import { faceCaptureService, FACE_PHOTO_RESOLUTION } from '../../../shared/services/faceCapture';
import { cameraPermissionManager } from '../../../shared/services/permissions';
import type { StaffFlowState } from '../state/staffAttendanceSlice';
import StepHeader from './StepHeader';

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
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
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
  // Same capped resolution as enrollment: a verify photo is uploaded on every
  // attempt, so full-sensor JPEGs cost seconds per try for detail the server
  // discards when it crops the face to 112x112.
  const format = useCameraFormat(device, [{ photoResolution: FACE_PHOTO_RESOLUTION }]);
  useEffect(() => {
    if (cameraRef.current) {
      faceCaptureService.attachCamera(cameraRef.current);
    }
    return () => {
      faceCaptureService.detachCamera();
    };
  }, [device]);

  // -- Live liveness detection -------------------------------------------
  //
  // The frame processor runs on a separate native thread, so it cannot touch
  // Redux directly. It extracts the metrics it needs and hands them to JS,
  // where the (pure, tested) state machine folds them into the checklist.
  // Deliberately minimal work inside the worklet: anything expensive there
  // stalls the camera preview.
  const dispatch = useAppDispatch();
  const livenessRef = useRef<LivenessState>(INITIAL_LIVENESS);
  const { detectFaces } = useFaceDetector({
    // 'fast' over 'accurate': this drives a live checklist, not the identity
    // decision — that is the server's job, from the captured still.
    performanceMode: 'fast',
    // Needed for eye-open probability, which is the entire basis of the blink.
    classificationMode: 'all',
    landmarkMode: 'none',
    contourMode: 'none',
  });

  const onFrameMetrics = useMemo(
    () =>
      Worklets.createRunOnJS((metrics: FaceFrameMetrics | null) => {
        const next = applyFrame(livenessRef.current, metrics);
        const prev = livenessRef.current;
        livenessRef.current = next;
        // Only dispatch on a visible change — the processor fires many times a
        // second and re-rendering the whole step on every frame would make the
        // preview stutter for no benefit.
        if (
          prev.faceDetected !== next.faceDetected ||
          prev.blinkDetected !== next.blinkDetected ||
          prev.poseOk !== next.poseOk
        ) {
          dispatch(
            setLiveness({
              faceDetected: next.faceDetected,
              blinkDetected: next.blinkDetected,
              poseOk: next.poseOk,
            })
          );
        }
      }),
    [dispatch]
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const faces = detectFaces(frame);
      const face = faces[0];
      if (!face) {
        onFrameMetrics(null);
        return;
      }
      onFrameMetrics({
        leftEyeOpenProbability: face.leftEyeOpenProbability ?? null,
        rightEyeOpenProbability: face.rightEyeOpenProbability ?? null,
        yawDegrees: face.yawAngle ?? 0,
        pitchDegrees: face.pitchAngle ?? 0,
      });
    },
    [detectFaces, onFrameMetrics]
  );

  // Each capture attempt starts from a clean slate, so a blink from a previous
  // attempt cannot vouch for this one.
  useEffect(() => {
    if (flowState === 'face_capture') {
      livenessRef.current = INITIAL_LIVENESS;
      dispatch(setLiveness({ faceDetected: false, blinkDetected: false, poseOk: false }));
    }
  }, [flowState, dispatch]);

  const maxAttempts = attendanceConfig.face.maxStaffAttempts;
  const isMatching = flowState === 'face_matching';
  const isPending = CAPTURE_PENDING_STATES.has(flowState);
  const isConfirm = flowState === 'confirm';
  const isRetry =
    flowState === 'attempt_failed' || flowState === 'face_failed' || flowState === 'service_error';

  // A retry bypasses the gate: if detection is misbehaving on a given device or
  // in poor light, refusing to let someone even attempt a capture would strand
  // them with no route to marking attendance at all.
  const canCapture = isRetry || isReadyToCapture(liveness);

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
        <EmptyState
          icon="camera-off"
          tone="error"
          title="Camera access needed"
          message="Camera access is required to verify your identity. Grant access to continue, or mark your attendance manually."
        />

        {errorMessage ? (
          <Card
            elevation="none"
            padding="sm"
            backgroundColor={colors.errorSoft}
            style={styles.errorBanner}
          >
            <View style={styles.bannerRow}>
              <Feather name="alert-circle" size={16} color={colors.errorText} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          </Card>
        ) : null}

        <View style={styles.controls}>
          {/* DENIED (not blocked): retry the permission request. Hidden when the
              permission is undetermined or granted. */}
          {cameraPermission === 'denied' ? (
            <Button label="Retry" icon="refresh-cw" size="lg" onPress={onRetryPermission} />
          ) : null}

          {/* BLOCKED: open the OS settings screen. */}
          {cameraPermission === 'blocked' ? (
            <Button label="Open settings" icon="settings" size="lg" onPress={onOpenSettings} />
          ) : null}

          {/* Manual fallback is always available when the camera cannot be used. */}
          <Button label="Mark manually" variant="outline" size="lg" onPress={onManualFallback} />
        </View>
      </View>
    );
  }

  // Attempt counter is displayed as a 1-based "current attempt" against the cap.
  const currentAttempt = Math.min(attempts + (isConfirm ? 0 : 1), maxAttempts);

  if (isConfirm) {
    return (
      <View style={styles.container}>
        <StepHeader
          step={2}
          totalSteps={2}
          icon="user-check"
          title="Confirm attendance"
          tone={colors.success}
        />

        <Card
          elevation="sm"
          padding="lg"
          backgroundColor={colors.successSoft}
          style={styles.confirmCard}
        >
          <View style={styles.confirmRow}>
            <View style={styles.confirmIcon}>
              <Feather name="check" size={26} color={colors.textInverse} />
            </View>
            <View style={styles.confirmText}>
              <Text style={styles.confirmTitle}>
                {lastConfidence !== null ? 'Face verified' : 'Ready to submit'}
              </Text>
              <Text style={styles.confirmBody}>
                {lastConfidence !== null
                  ? 'Submit to record your attendance for today.'
                  : 'Submit to record your attendance for today.'}
              </Text>
            </View>
          </View>

          {lastConfidence !== null ? (
            <View style={styles.confidenceBlock}>
              <View style={styles.confidenceHeader}>
                <Text style={styles.confidenceLabel}>Match confidence</Text>
                <Text style={styles.confidenceValue}>{Math.round(lastConfidence)}%</Text>
              </View>
              <ProgressBar
                progress={lastConfidence / 100}
                colors={gradients.success}
                trackColor={withAlpha(colors.success, 0.18)}
                height={7}
                label="Face match confidence"
              />
            </View>
          ) : null}
        </Card>

        <Button
          label="Submit attendance"
          icon="send"
          size="lg"
          loading={isSubmitting}
          disabled={isSubmitting}
          tone={{ gradient: gradients.success }}
          onPress={onSubmit}
        />
      </View>
    );
  }

  const checksDone = [liveness.faceDetected, liveness.blinkDetected, liveness.poseOk].filter(
    Boolean,
  ).length;

  return (
    <View style={styles.container}>
      <StepHeader
        step={2}
        totalSteps={2}
        icon="user-check"
        title="Face verification"
        subtitle="Centre your face in the oval and hold still while we verify you."
      />

      {/* Camera capture panel — live preview when a front camera is available
          (device/dev-client dependent), otherwise the decorative fallback. */}
      <View style={styles.cameraPanel}>
        {device ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            photoQualityBalance="speed"
            isActive
            photo
            frameProcessor={frameProcessor}
          />
        ) : (
          <LinearGradient colors={gradients.camera} style={StyleSheet.absoluteFill} />
        )}

        {/* Scrims so the white pills stay legible against any background. */}
        <LinearGradient
          colors={[withAlpha(colors.overlayDark, 0.6), 'transparent']}
          style={styles.scrimTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', withAlpha(colors.overlayDark, 0.6)]}
          style={styles.scrimBottom}
          pointerEvents="none"
        />

        <View style={styles.cameraCenter} pointerEvents="none">
          {/* The oval turns green the moment every liveness check passes, so the
              readiness signal lands where the user is already looking rather
              than only in the checklist below. */}
          <Animated.View
            style={[
              styles.ovalGuide,
              canCapture && styles.ovalGuideReady,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.45] }),
                transform: [
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) },
                ],
              },
            ]}
          />
          {isPending ? (
            <ActivityIndicator color={colors.surface} size="large" />
          ) : !device ? (
            <Feather name="camera" size={36} color={withAlpha(colors.overlayLight, 0.3)} />
          ) : null}
        </View>

        <View style={styles.cameraTopPill} pointerEvents="none">
          <View style={styles.glassPill}>
            <Feather name="user" size={14} color={colors.text} />
            <Text style={styles.glassPillText}>Position your face in the oval</Text>
          </View>
        </View>

        {!liveness.blinkDetected && liveness.faceDetected ? (
          <View style={styles.cameraBottomPill} pointerEvents="none">
            <View style={[styles.glassPill, styles.glassPillWarning]}>
              <Feather name="eye" size={15} color={colors.textInverse} />
              <Text style={[styles.glassPillText, styles.glassPillTextOnWarning]}>Please blink…</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.cornerGuide, styles.cornerTL]} pointerEvents="none" />
        <View style={[styles.cornerGuide, styles.cornerTR]} pointerEvents="none" />
        <View style={[styles.cornerGuide, styles.cornerBL]} pointerEvents="none" />
        <View style={[styles.cornerGuide, styles.cornerBR]} pointerEvents="none" />
      </View>

      {/* Live liveness checklist. */}
      <Card elevation="sm" padding="md" style={styles.checklistCard}>
        <View style={styles.checklistHeader}>
          <Text style={styles.checklistTitle}>Liveness checks</Text>
          <Text style={[styles.checklistCount, canCapture && { color: colors.successText }]}>
            {checksDone}/3
          </Text>
        </View>

        <View style={styles.statusStack}>
          <LivenessRow icon="user" label="Face detected" done={liveness.faceDetected} />
          <LivenessRow icon="eye" label="Blink detected" done={liveness.blinkDetected} />
          <LivenessRow icon="crosshair" label="Pose OK" done={liveness.poseOk} />
        </View>

        <View style={styles.attemptRow}>
          <Text style={styles.attemptCounter}>
            Attempt {currentAttempt} of {maxAttempts}
          </Text>
          <View style={styles.attemptDots}>
            {Array.from({ length: maxAttempts }, (_, i) => (
              <View
                key={i}
                style={[styles.attemptDot, i < currentAttempt - 1 && styles.attemptDotUsed]}
              />
            ))}
          </View>
        </View>
      </Card>

      {flowState === 'attempt_failed' && lastConfidence !== null ? (
        <Banner
          tone="warning"
          icon="alert-triangle"
          text={`No match (${Math.round(lastConfidence)}%). Please try again.`}
        />
      ) : null}
      {flowState === 'face_failed' ? (
        <Banner tone="warning" icon="alert-triangle" text="Maximum attempts reached. You can try again." />
      ) : null}
      {errorMessage ? <Banner tone="error" icon="alert-circle" text={errorMessage} /> : null}

      {/* Capture is gated on the checklist, which is what makes it a control
          rather than decoration. Without the blink requirement a printed photo
          passes the whole flow — it satisfies "face detected" and "pose OK"
          perfectly well. The gate is lifted on a retry so a user cannot be
          trapped by flaky detection with no way forward. */}
      <Button
        label={isMatching ? 'Verifying…' : isRetry ? 'Try again' : 'Capture'}
        icon={isRetry ? 'refresh-cw' : 'camera'}
        size="lg"
        loading={isMatching}
        disabled={isPending || !canCapture}
        tone={{ gradient: canCapture ? gradients.success : gradients.brandFlat }}
        onPress={onCapture}
      />

      {!canCapture && !isPending && !isRetry ? (
        <Text style={styles.hintText}>
          {!liveness.faceDetected
            ? 'Position your whole face in the frame'
            : !liveness.poseOk
              ? 'Look straight at the camera'
              : 'Blink once to confirm you are present'}
        </Text>
      ) : null}
    </View>
  );
}

function LivenessRow({
  icon,
  label,
  done,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  done: boolean;
}) {
  const fill = done ? colors.success : colors.warning;
  const text = done ? colors.successText : colors.warningText;

  return (
    <View
      style={[
        styles.statusRow,
        { backgroundColor: withAlpha(fill, 0.08), borderColor: withAlpha(fill, 0.2) },
      ]}
    >
      <View style={[styles.statusIcon, { backgroundColor: withAlpha(fill, 0.14) }]}>
        <Feather name={done ? 'check' : icon} size={14} color={text} />
      </View>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusState, { color: text }]}>{done ? 'OK' : 'Waiting'}</Text>
    </View>
  );
}

function Banner({
  tone,
  icon,
  text,
}: {
  tone: 'warning' | 'error';
  icon: keyof typeof Feather.glyphMap;
  text: string;
}) {
  const fill = tone === 'warning' ? colors.warning : colors.error;
  const textColor = tone === 'warning' ? colors.warningText : colors.errorText;

  return (
    <Card
      elevation="none"
      padding="sm"
      backgroundColor={withAlpha(fill, 0.08)}
      style={[styles.errorBanner, { borderColor: withAlpha(fill, 0.25) }]}
    >
      <View style={styles.bannerRow}>
        <Feather name={icon} size={16} color={textColor} />
        <Text style={[styles.errorText, { color: textColor }]}>{text}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },

  /* Camera panel */
  cameraPanel: {
    aspectRatio: 3 / 4,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.md,
    backgroundColor: colors.cameraBackdrop,
  },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 130,
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
    width: 200,
    height: 252,
    borderRadius: 130,
    borderWidth: 4,
    borderColor: withAlpha(colors.overlayLight, 0.55),
  },
  ovalGuideReady: {
    borderColor: colors.success,
    borderWidth: 5,
  },
  cameraTopPill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
  },
  cameraBottomPill: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: withAlpha(colors.overlayLight, 0.96),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    ...shadows.sm,
  },
  glassPillWarning: {
    backgroundColor: colors.warning,
  },
  glassPillText: {
    ...typography.captionBold,
    color: colors.text,
  },
  glassPillTextOnWarning: {
    color: colors.textInverse,
  },
  cornerGuide: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: withAlpha(colors.overlayLight, 0.85),
  },
  cornerTL: {
    top: spacing.smd,
    left: spacing.smd,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: borderRadius.md,
  },
  cornerTR: {
    top: spacing.smd,
    right: spacing.smd,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: borderRadius.md,
  },
  cornerBL: {
    bottom: spacing.smd,
    left: spacing.smd,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: borderRadius.md,
  },
  cornerBR: {
    bottom: spacing.smd,
    right: spacing.smd,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: borderRadius.md,
  },

  /* Liveness checklist */
  checklistCard: {
    marginBottom: spacing.md,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.smd,
  },
  checklistTitle: {
    ...typography.label,
    color: colors.textTertiary,
  },
  checklistCount: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  statusStack: {
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  statusIcon: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  statusState: {
    ...typography.micro,
    fontWeight: '700',
  },

  /* Attempts */
  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.smd,
    paddingTop: spacing.smd,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  attemptCounter: {
    ...typography.small,
    color: colors.textSecondary,
  },
  attemptDots: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  attemptDot: {
    width: 7,
    height: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
  },
  attemptDotUsed: {
    backgroundColor: colors.warning,
  },

  /* Confirm */
  confirmCard: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.success, 0.25),
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  confirmIcon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    flex: 1,
  },
  confirmTitle: {
    ...typography.h3,
    color: colors.successText,
  },
  confirmBody: {
    ...typography.caption,
    color: colors.text,
    marginTop: spacing.xxs,
  },
  confidenceBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(colors.success, 0.3),
  },
  confidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  confidenceLabel: {
    ...typography.small,
    color: colors.text,
  },
  confidenceValue: {
    ...typography.captionBold,
    color: colors.successText,
  },

  /* Banners */
  errorBanner: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.error, 0.25),
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.errorText,
    flex: 1,
  },

  // Tells the user which check is still outstanding. Without it a disabled
  // Capture button reads as the app being broken rather than as waiting.
  hintText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.smd,
  },

  controls: {
    gap: spacing.smd,
  },
});
