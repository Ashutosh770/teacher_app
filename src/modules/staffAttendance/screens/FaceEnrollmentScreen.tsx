/**
 * Teacher face self-enrollment screen (Req 7.1–7.8).
 *
 * Lets a signed-in teacher enroll their own face so the staff face verification
 * step has reference data (the staff-flow guard hard-blocks that step until a
 * record exists — see `services/staffEnrollmentGuard`). The screen delegates the
 * capture → derive → persist pipeline to the shared `faceEnrollmentService` and
 * reflects its outcome:
 *
 * - running          → "capturing"/"saving" progress (Req 7.2)
 * - saved            → success confirmation + mark `hasRecord` true (Req 7.5)
 * - error            → descriptive message + retry, existing record untouched (Req 7.6)
 * - permission block → open-settings guidance (blocked) or retry (denied) (Req 7.4)
 *
 * When a record already exists it offers a re-enrollment control with a
 * confirm-before-replace prompt (Req 7.7); the replace only takes effect on a
 * successful capture (the service preserves the prior record on failure — Req 7.6).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { Feather } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../../store';
import { colors, spacing, typography, borderRadius } from '../../../shared/theme';
import {
  faceEnrollmentService,
  type EnrollmentResult,
} from '../../../shared/services/faceEnrollment';
import { faceCaptureService } from '../../../shared/services/faceCapture';
import { cameraPermissionManager } from '../../../shared/services/permissions';
import { setEnrollmentStatus, setHasEnrollmentRecord } from '../state/staffAttendanceSlice';

/** UI-level feedback derived from the last enrollment attempt. */
type Feedback =
  | { kind: 'none' }
  | { kind: 'success'; synced: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'permission'; message: string; canRetry: boolean };

export default function FaceEnrollmentScreen() {
  const dispatch = useAppDispatch();
  const teacherId = useAppSelector((state) => state.auth.user?.id ?? null);
  const { hasRecord, status } = useAppSelector((state) => state.staffAttendance.enrollment);

  const [feedback, setFeedback] = useState<Feedback>({ kind: 'none' });
  const isRunning = status === 'capturing' || status === 'saving';

  // Real camera preview + capture binding (Req 7.2). Without this,
  // `faceEnrollmentService.enroll()` always fails with "Camera is not
  // attached" since `captureFrame()` requires a mounted `<Camera>` ref.
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

  // Reflect whether a record already exists on entry so the UI can offer
  // re-enrollment (Req 7.7) vs first-time enrollment without waiting for an attempt.
  useEffect(() => {
    let active = true;
    if (!teacherId) return;
    faceEnrollmentService.hasEnrollment('staff', teacherId).then((exists) => {
      if (active) dispatch(setHasEnrollmentRecord(exists));
    });
    return () => {
      active = false;
    };
  }, [teacherId, dispatch]);

  const applyResult = useCallback(
    (result: EnrollmentResult) => {
      if (result.outcome === 'saved') {
        dispatch(setHasEnrollmentRecord(true));
        dispatch(setEnrollmentStatus('idle'));
        setFeedback({ kind: 'success', synced: result.synced });
        return;
      }
      if (result.outcome === 'cancelled') {
        // No confirm gate is used for staff, but handle defensively.
        dispatch(setEnrollmentStatus('idle'));
        setFeedback({ kind: 'none' });
        return;
      }
      // error — existing record is retained by the service (Req 7.6).
      dispatch(setEnrollmentStatus('error'));
      if (result.reason === 'camera_permission_required') {
        const blocked = result.permissionState === 'blocked';
        setFeedback({
          kind: 'permission',
          message: blocked
            ? 'Camera access is blocked. Open device settings to allow the camera, then try again.'
            : `${result.message} Please allow camera access to continue.`,
          canRetry: !blocked,
        });
        return;
      }
      setFeedback({ kind: 'error', message: result.message });
    },
    [dispatch]
  );

  const runEnrollment = useCallback(async () => {
    if (!teacherId || isRunning) return;
    setFeedback({ kind: 'none' });
    dispatch(setEnrollmentStatus('capturing'));
    try {
      const result = await faceEnrollmentService.enroll('staff', teacherId);
      applyResult(result);
    } catch {
      // enroll() is documented never to throw, but guard so the UI never hangs.
      dispatch(setEnrollmentStatus('error'));
      setFeedback({ kind: 'error', message: 'Enrollment failed unexpectedly. Please try again.' });
    }
  }, [teacherId, isRunning, dispatch, applyResult]);

  // Re-enrollment (Req 7.7): confirm before replacing the existing record.
  const confirmReEnroll = useCallback(() => {
    if (isRunning) return;
    Alert.alert(
      'Replace enrolled face?',
      'This will capture your face again and replace your existing enrollment. Your current enrollment stays in place unless the new capture succeeds.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: runEnrollment },
      ]
    );
  }, [isRunning, runEnrollment]);

  const openSettings = useCallback(() => {
    cameraPermissionManager.openSettings();
  }, []);

  if (!teacherId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Face Enrollment</Text>
        <Text style={styles.subtitle}>You must be signed in to enroll your face.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Face Enrollment</Text>
      <Text style={styles.subtitle}>
        Enroll your face so you can mark attendance with face verification.
      </Text>

      <View style={styles.cameraPanel}>
        {device ? (
          <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
        ) : (
          <View style={styles.cameraFallback}>
            <Feather name="camera" size={32} color={colors.disabled} />
          </View>
        )}
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Status</Text>
        <Text style={[styles.statusValue, hasRecord ? styles.statusEnrolled : styles.statusPending]}>
          {hasRecord ? 'Enrolled' : 'Not enrolled'}
        </Text>
      </View>

      {isRunning && (
        <View style={styles.progressRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.progressText}>
            {status === 'saving' ? 'Saving your enrollment…' : 'Capturing your face…'}
          </Text>
        </View>
      )}

      {feedback.kind === 'success' && (
        <View style={[styles.banner, styles.bannerSuccess]}>
          <Text style={styles.bannerText}>
            {feedback.synced
              ? 'Face enrolled successfully.'
              : 'Face enrolled and saved. It will sync when you are back online.'}
          </Text>
        </View>
      )}

      {feedback.kind === 'error' && (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>{feedback.message}</Text>
        </View>
      )}

      {feedback.kind === 'permission' && (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>{feedback.message}</Text>
          {!feedback.canRetry && (
            <TouchableOpacity style={styles.linkButton} onPress={openSettings}>
              <Text style={styles.linkButtonText}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {hasRecord ? (
        <TouchableOpacity
          style={[styles.button, isRunning && styles.buttonDisabled]}
          onPress={confirmReEnroll}
          disabled={isRunning}
        >
          <Text style={styles.buttonText}>Re-enroll face</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.button, isRunning && styles.buttonDisabled]}
          onPress={runEnrollment}
          disabled={isRunning}
        >
          <Text style={styles.buttonText}>Start enrollment</Text>
        </TouchableOpacity>
      )}

      {feedback.kind === 'error' || (feedback.kind === 'permission' && feedback.canRetry) ? (
        <TouchableOpacity
          style={[styles.buttonSecondary, isRunning && styles.buttonDisabled]}
          onPress={runEnrollment}
          disabled={isRunning}
        >
          <Text style={styles.buttonSecondaryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  cameraPanel: {
    height: 240,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: '#1A202C',
    marginBottom: spacing.lg,
  },
  cameraFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statusLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statusValue: {
    ...typography.h3,
  },
  statusEnrolled: {
    color: colors.success,
  },
  statusPending: {
    color: colors.warning,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  progressText: {
    ...typography.body,
    color: colors.text,
    marginLeft: spacing.sm,
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
  bannerError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: colors.error,
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
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    color: '#fff',
    ...typography.body,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonSecondaryText: {
    color: colors.primary,
    ...typography.body,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: spacing.sm,
  },
  linkButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
});
