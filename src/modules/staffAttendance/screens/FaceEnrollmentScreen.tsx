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
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../../store';
import { borderRadius, colors, spacing, typography } from '../../../shared/theme';
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
        <Text style={styles.subtitle}>You must be signed in to enroll your face.</Text>
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

      {phase === 'done' ? (
        <View style={styles.doneCard}>
          <Feather name="check-circle" size={40} color={colors.success} />
          <Text style={styles.doneText}>Enrollment complete</Text>
          <Text style={styles.subtitle}>{stagedCount} photos saved.</Text>
        </View>
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
          </View>

          {phase === 'idle' ? (
            <>
              <Text style={styles.subtitle}>
                {hasRecord
                  ? 'You are already enrolled. Re-enrolling replaces your existing photos.'
                  : `You will take ${total} photos, one at a time. You can review and retake each one.`}
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={hasRecord ? confirmReEnroll : begin}
              >
                <Text style={styles.primaryButtonText}>
                  {hasRecord ? 'Re-enroll' : 'Start enrollment'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.stepLabel}>
                Photo {Math.min(poseIndex + 1, total)} of {total} · {stagedCount} saved
              </Text>
              <Text style={styles.instruction}>{pose.instruction}</Text>

              {message ? <Text style={styles.errorText}>{message}</Text> : null}

              {phase === 'reviewing' ? (
                <View style={styles.reviewRow}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, isBusy && styles.disabled]}
                    onPress={onRetake}
                    disabled={isBusy}
                  >
                    <Text style={styles.secondaryButtonText}>Retake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.flex, isBusy && styles.disabled]}
                    onPress={onKeep}
                    disabled={isBusy}
                  >
                    <Text style={styles.primaryButtonText}>Use this photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, isBusy && styles.disabled]}
                  onPress={onCapture}
                  disabled={isBusy}
                >
                  <Text style={styles.primaryButtonText}>Take photo</Text>
                </TouchableOpacity>
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
                <TouchableOpacity
                  style={[styles.finishButton, isBusy && styles.disabled]}
                  onPress={onFinish}
                  disabled={isBusy}
                >
                  <Text style={styles.primaryButtonText}>
                    Finish enrollment ({stagedCount} photos)
                  </Text>
                </TouchableOpacity>
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
  flex: { flex: 1 },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.md },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  frame: {
    height: 320,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.primaryDark,
    marginBottom: spacing.lg,
  },
  stepLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  instruction: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: { color: colors.surface, fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginRight: spacing.md,
  },
  secondaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  reviewRow: { flexDirection: 'row', alignItems: 'center' },
  finishButton: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  disabled: { opacity: 0.6 },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  busyText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
  errorText: { ...typography.caption, color: colors.error, textAlign: 'center', marginBottom: spacing.sm },
  doneCard: { alignItems: 'center', paddingVertical: spacing.xl },
  doneText: { ...typography.h3, color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
});
