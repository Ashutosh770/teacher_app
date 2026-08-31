/**
 * Face enrollment — one pose at a time.
 *
 * Replaces a timed five-shot burst that gave the user no chance to see what was
 * captured. Each pose is now: read the instruction, take the shot when ready,
 * look at it, keep it or retake it, upload just that one photo.
 *
 * Why per-pose upload rather than one batch at the end:
 *  - a bad frame is rejected by the server while the user is still in position,
 *    instead of after all five have been taken;
 *  - a failure costs one ~2.5 MB retry, not the whole ~12 MB session;
 *  - each step is a single face inference, so nothing feels stalled.
 *
 * The server stages poses and only promotes them on commit, so abandoning
 * part-way leaves any existing enrollment exactly as it was.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../../store';
import {
  borderRadius,
  colors,
  gradients,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import { Button, Card, EmptyState, ProgressBar } from '../../../shared/components';
import { faceCaptureService, FACE_PHOTO_RESOLUTION } from '../../../shared/services/faceCapture';
import { cameraPermissionManager } from '../../../shared/services/permissions';
import type { CapturedFrame } from '../../../shared/services/faceMatch/types';
import {
  capturePose,
  uploadPose,
  commitEnrollment,
  ENROLLMENT_POSES,
  MIN_POSES_TO_COMMIT,
} from '../../../shared/services/incrementalEnrollment';
import { setEnrollmentStatus, setHasEnrollmentRecord } from '../state/staffAttendanceSlice';

type Phase =
  | 'idle'
  | 'ready' // camera live, waiting for the user to take this pose
  | 'reviewing' // shot taken, awaiting keep-or-retake
  | 'uploading'
  | 'committing'
  | 'done';

export default function FaceEnrollmentScreen() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const teacherId = useAppSelector(state => state.auth.user?.id ?? null);
  const hasRecord = useAppSelector(state => state.staffAttendance.enrollment.hasRecord);

  const [phase, setPhase] = useState<Phase>('idle');
  const [poseIndex, setPoseIndex] = useState(0);
  const [preview, setPreview] = useState<CapturedFrame | null>(null);
  const [stagedCount, setStagedCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const device = useCameraDevice('front');
  // Capped resolution: see FACE_PHOTO_RESOLUTION. Full-sensor JPEGs took 12-14s
  // each to upload, which is where the intermittent "network unreachable"
  // failures came from.
  const format = useCameraFormat(device, [{ photoResolution: FACE_PHOTO_RESOLUTION }]);

  /**
   * Attach via a callback ref, not an effect.
   *
   * An effect keyed on `device` only runs once, so any remount of the camera
   * leaves the capture service holding a dead reference — and the next capture
   * fails with "camera is unavailable" while the preview looks perfectly fine.
   * A callback ref fires on every mount and unmount, so the two can never
   * drift apart.
   */
  const setCameraRef = useCallback((instance: Camera | null) => {
    if (instance) {
      faceCaptureService.attachCamera(instance);
    } else {
      faceCaptureService.detachCamera();
    }
  }, []);

  useEffect(() => () => faceCaptureService.detachCamera(), []);

  const pose = ENROLLMENT_POSES[poseIndex];
  const total = ENROLLMENT_POSES.length;
  const isBusy = phase === 'uploading' || phase === 'committing';

  const begin = useCallback(async () => {
    const permission = await cameraPermissionManager.check();
    const granted =
      permission === 'granted' ? 'granted' : await cameraPermissionManager.request();
    if (granted !== 'granted') {
      setMessage('Camera permission is required to enroll your face.');
      return;
    }
    setMessage(null);
    setPoseIndex(0);
    setStagedCount(0);
    setPreview(null);
    setPhase('ready');
  }, []);

  const onCapture = useCallback(async () => {
    setMessage(null);
    const result = await capturePose();
    if (result.outcome === 'error') {
      setMessage(
        result.reason === 'capture_timeout'
          ? 'The camera did not produce a usable photo. Try again.'
          : 'The camera is unavailable. Try again.'
      );
      return;
    }
    setPreview(result.frame);
    setPhase('reviewing');
  }, []);

  /** Discards the reviewed shot without uploading — nothing to undo server-side. */
  const onRetake = useCallback(() => {
    setPreview(null);
    setMessage(null);
    setPhase('ready');
  }, []);

  const onKeep = useCallback(async () => {
    if (!teacherId || !preview) return;
    setPhase('uploading');
    const result = await uploadPose('staff', teacherId, poseIndex, preview);

    if (result.outcome === 'no_face') {
      // Specifically a bad frame, so send them back to retake THIS pose rather
      // than reporting a generic failure they cannot act on.
      setMessage(result.message);
      setPreview(null);
      setPhase('ready');
      return;
    }
    if (result.outcome === 'error') {
      setMessage(result.message);
      setPhase('reviewing'); // keep the shot so a retry needs no re-capture
      return;
    }

    // Clear any prior failure: leaving it on screen after a successful retry
    // makes a working upload look like it failed again.
    setMessage(null);
    setStagedCount(result.stagedCount);
    setPreview(null);
    if (poseIndex + 1 < total) {
      setPoseIndex(poseIndex + 1);
      setPhase('ready');
    } else {
      setPhase('ready'); // all poses captured; the commit button takes over
    }
  }, [teacherId, preview, poseIndex, total]);

  const onFinish = useCallback(async () => {
    if (!teacherId) return;
    setPhase('committing');
    dispatch(setEnrollmentStatus('saving'));
    const result = await commitEnrollment('staff', teacherId);

    if (result.outcome === 'error') {
      setMessage(result.message);
      dispatch(setEnrollmentStatus('error'));
      setPhase('ready');
      return;
    }
    dispatch(setHasEnrollmentRecord(true));
    dispatch(setEnrollmentStatus('idle'));
    setPhase('done');
  }, [teacherId, dispatch]);

  const confirmReEnroll = useCallback(() => {
    Alert.alert(
      'Replace enrolled face?',
      'Your current enrollment stays in place until the new one is completed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Re-enroll', style: 'destructive', onPress: () => void begin() },
      ]
    );
  }, [begin]);

  if (!teacherId) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <EmptyState
          icon="user-x"
          tone="warning"
          title="Not signed in"
          message="You must be signed in to enroll your face."
        />
      </View>
    );
  }

  const canFinish = stagedCount >= MIN_POSES_TO_COMMIT;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Text style={styles.title}>Face Enrollment</Text>
      {phase !== 'done' && phase !== 'idle' ? (
        <ProgressBar
          progress={total > 0 ? stagedCount / total : 0}
          colors={gradients.success}
          height={7}
          label="Enrollment photos saved"
          style={styles.headerProgress}
        />
      ) : null}

      {phase === 'done' ? (
        <EmptyState
          icon="check-circle"
          tone="success"
          title="Enrollment complete"
          message={`${stagedCount} photo${stagedCount === 1 ? '' : 's'} saved. You can now mark attendance with face verification.`}
        />
      ) : (
        <>
          {/* Preview of the shot under review, otherwise the live camera. */}
          {/* The camera stays MOUNTED for the whole session and the review shot
              is overlaid on top of it. Swapping the two out unmounted the
              camera between poses, which both dropped the capture reference and
              forced a cold re-initialisation on every pose. */}
          <View style={styles.frame}>
            {device ? (
              <Camera
                ref={setCameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                format={format}
                photoQualityBalance="speed"
                isActive={phase === 'ready' || phase === 'reviewing'}
                photo
              />
            ) : (
              <View style={[styles.centered, StyleSheet.absoluteFill]}>
                <Feather name="camera-off" size={32} color={colors.disabled} />
              </View>
            )}
            {phase === 'reviewing' && preview ? (
              <Image source={{ uri: preview.uri }} style={StyleSheet.absoluteFill} />
            ) : null}

            {/* Pose dots ride on the frame itself, so progress is visible while
                the user is looking at the camera rather than at the caption. */}
            {phase !== 'idle' ? (
              <View style={styles.poseDots} pointerEvents="none">
                {Array.from({ length: total }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.poseDot,
                      i < stagedCount && styles.poseDotDone,
                      i === poseIndex && styles.poseDotCurrent,
                    ]}
                  />
                ))}
              </View>
            ) : null}

            {phase === 'reviewing' ? (
              <View style={styles.reviewTag} pointerEvents="none">
                <Feather name="image" size={13} color={colors.textInverse} />
                <Text style={styles.reviewTagText}>Review</Text>
              </View>
            ) : null}
          </View>

          {phase === 'idle' ? (
            <>
              <Text style={styles.subtitle}>
                {hasRecord
                  ? 'You are already enrolled. Re-enrolling replaces your existing photos.'
                  : `You will take ${total} photos, one at a time. You can review and retake each one.`}
              </Text>
              <Button
                label={hasRecord ? 'Re-enroll' : 'Start enrollment'}
                icon={hasRecord ? 'refresh-cw' : 'camera'}
                size="lg"
                onPress={hasRecord ? confirmReEnroll : begin}
              />
            </>
          ) : (
            <>
              <Text style={styles.stepLabel}>
                PHOTO {Math.min(poseIndex + 1, total)} OF {total} · {stagedCount} SAVED
              </Text>
              <Text style={styles.instruction}>{pose.instruction}</Text>

              {message ? (
                <Card
                  elevation="none"
                  padding="sm"
                  backgroundColor={colors.errorSoft}
                  style={styles.errorBanner}
                >
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={16} color={colors.errorText} />
                    <Text style={styles.errorText}>{message}</Text>
                  </View>
                </Card>
              ) : null}

              {phase === 'reviewing' ? (
                <View style={styles.reviewRow}>
                  <Button
                    label="Retake"
                    icon="rotate-ccw"
                    variant="outline"
                    size="lg"
                    onPress={onRetake}
                    disabled={isBusy}
                    style={styles.reviewAction}
                  />
                  <Button
                    label="Use this"
                    icon="check"
                    size="lg"
                    onPress={onKeep}
                    disabled={isBusy}
                    tone={{ gradient: gradients.success }}
                    style={styles.reviewAction}
                  />
                </View>
              ) : (
                // `onKeep` moves the phase out of `reviewing`, so an in-flight
                // upload lands here rather than on the review pair above.
                <Button
                  label={phase === 'uploading' ? 'Uploading…' : 'Take photo'}
                  icon="camera"
                  size="lg"
                  onPress={onCapture}
                  loading={isBusy}
                  disabled={isBusy}
                />
              )}

              {isBusy ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.busyText}>
                    {phase === 'committing' ? 'Finishing enrollment…' : 'Uploading photo…'}
                  </Text>
                </View>
              ) : null}

              {/* Available as soon as the server would accept a commit, so a
                  user who is happy after three good photos need not take five. */}
              {canFinish && phase !== 'reviewing' ? (
                <Button
                  label={`Finish enrollment (${stagedCount} photos)`}
                  icon="check-circle"
                  size="lg"
                  onPress={onFinish}
                  loading={phase === 'committing'}
                  disabled={isBusy}
                  tone={{ gradient: gradients.success }}
                  style={styles.finishButton}
                />
              ) : null}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.smd,
  },
  headerProgress: {
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },

  /* Camera frame */
  frame: {
    height: 340,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.cameraBackdrop,
    marginBottom: spacing.md,
  },
  poseDots: {
    position: 'absolute',
    bottom: spacing.smd,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  poseDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.35),
  },
  poseDotDone: {
    backgroundColor: colors.success,
  },
  poseDotCurrent: {
    width: 22,
    backgroundColor: colors.textInverse,
  },
  reviewTag: {
    position: 'absolute',
    top: spacing.smd,
    left: spacing.smd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: withAlpha(colors.overlayDark, 0.6),
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xs + 1,
  },
  reviewTagText: {
    ...typography.micro,
    fontWeight: '700',
    color: colors.textInverse,
  },

  /* Instructions */
  stepLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  instruction: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },

  /* Actions */
  reviewRow: {
    flexDirection: 'row',
    gap: spacing.smd,
  },
  reviewAction: {
    flex: 1,
  },
  finishButton: {
    marginTop: spacing.smd,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.smd,
  },
  busyText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* Error */
  errorBanner: {
    marginBottom: spacing.smd,
    borderWidth: 1,
    borderColor: withAlpha(colors.error, 0.25),
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.errorText,
    flex: 1,
  },
});
