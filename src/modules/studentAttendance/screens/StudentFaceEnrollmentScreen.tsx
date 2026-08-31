/**
 * Student face enrollment — a class teacher enrolls one student, one pose at a
 * time (Req 8.1–8.8).
 *
 * Rebuilt on the same per-pose flow as staff enrollment, for the same reasons:
 * the batch path captured five frames on a timer and uploaded ~12 MB in a single
 * request, so nothing could be reviewed, a bad frame was only discovered at the
 * end, and any failure lost the whole session. Here each pose is capture →
 * review → keep or retake → upload one photo.
 *
 * Two things differ from the staff screen, both because someone else is holding
 * the device:
 *
 *  - The BACK camera, and instructions addressed to the teacher about the
 *    student rather than to the person in frame.
 *  - The identity check runs before COMMIT rather than before capture. Poses are
 *    staged server-side and are not matched against until committed, so the last
 *    moment before they become live is both the safest place to confirm and the
 *    one where the teacher has actually seen the photos they are about to attach
 *    to a named child (Req 8.2–8.4). Cancelling discards the staged photos.
 *
 * No liveness gate here, unlike staff self-enrollment: enrollment is supervised
 * and in person, so the teacher standing in front of the student is the check
 * that a presentation attack would have to defeat.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  borderRadius,
  colors,
  gradients,
  moduleAccent,
  shadows,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import {
  Button,
  Card,
  EmptyState,
  IconChip,
  ProgressBar,
  StatusPill,
} from '../../../shared/components';
import { faceCaptureService, FACE_PHOTO_RESOLUTION } from '../../../shared/services/faceCapture';
import { cameraPermissionManager } from '../../../shared/services/permissions';
import { faceEnrollmentService } from '../../../shared/services/faceEnrollment';
import type { CapturedFrame } from '../../../shared/services/faceMatch/types';
import {
  capturePose,
  uploadPose,
  commitEnrollment,
  discardStaging,
  ENROLLMENT_POSES,
  MIN_POSES_TO_COMMIT,
} from '../../../shared/services/incrementalEnrollment';
import { useAppDispatch } from '../../../store';
import { setStudentEnrollmentStatus } from '../state/studentAttendanceSlice';

/**
 * The minimal student identity this screen needs. Supplied either as a direct
 * prop (`student`) or through React Navigation `route.params.student`, so the
 * screen works whether it is pushed onto a stack or embedded directly.
 */
export interface StudentEnrollmentTarget {
  id: string;
  name: string;
  rollNo: string;
}

export interface StudentFaceEnrollmentScreenProps {
  /** Target student when rendered directly (tests / embedding). */
  student?: StudentEnrollmentTarget;
  /** React Navigation route shape when pushed onto a navigator. */
  route?: { params?: { student?: StudentEnrollmentTarget } };
}

type Phase =
  | 'idle'
  | 'ready' // camera live, waiting for the teacher to take this pose
  | 'reviewing' // shot taken, awaiting keep-or-retake
  | 'uploading'
  | 'committing'
  | 'done';

/**
 * The capture prompts, addressed to the teacher.
 *
 * `ENROLLMENT_POSES` is written in the second person for self-enrollment ("turn
 * your head"), which is the wrong voice when the person reading the screen is
 * not the person in frame. The poses themselves — and their order and indices —
 * are shared, so the two flows stay in step.
 */
const STUDENT_PROMPTS: Record<string, string> = {
  centre: 'looking straight at the camera',
  left: 'turning their head slightly to the left',
  right: 'turning their head slightly to the right',
  up: 'tilting their chin up slightly',
  'centre-2': 'looking straight ahead once more',
};

function promptFor(poseKey: string, firstName: string): string {
  const action = STUDENT_PROMPTS[poseKey];
  return action ? `Photograph ${firstName} ${action}` : `Photograph ${firstName}`;
}

export default function StudentFaceEnrollmentScreen(
  props: StudentFaceEnrollmentScreenProps,
) {
  const student = props.student ?? props.route?.params?.student;
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('idle');
  const [poseIndex, setPoseIndex] = useState(0);
  const [preview, setPreview] = useState<CapturedFrame | null>(null);
  const [stagedCount, setStagedCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [hasRecord, setHasRecord] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  // Back camera: the teacher points the device at the student. Falls back to the
  // front camera on a device that has no back one, rather than rendering a dead
  // screen with no way to proceed.
  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const device = backDevice ?? frontDevice;
  // Capped resolution — full-sensor JPEGs took 12–14s each to upload, which is
  // where the intermittent "network error" failures came from.
  const format = useCameraFormat(device, [{ photoResolution: FACE_PHOTO_RESOLUTION }]);

  /**
   * Attach via a callback ref, not an effect: an effect keyed on `device` runs
   * once, so any remount of the camera leaves the capture service holding a dead
   * reference and the next capture fails with "camera is unavailable" while the
   * preview looks fine.
   */
  const setCameraRef = useCallback((instance: Camera | null) => {
    if (instance) {
      faceCaptureService.attachCamera(instance);
    } else {
      faceCaptureService.detachCamera();
    }
  }, []);

  useEffect(() => () => faceCaptureService.detachCamera(), []);

  // Reflect whether a record already exists, so re-enrollment can require an
  // explicit confirm-before-replace (Req 8.6). Server-first, like the staff
  // guard — a local-only answer goes stale in both directions.
  useEffect(() => {
    let active = true;
    if (!student) return;
    faceEnrollmentService
      .hasEnrollment('student', student.id)
      .then(exists => {
        if (active) setHasRecord(exists);
      })
      .catch(() => {
        /* best-effort; absence of a record is the safe default */
      });
    return () => {
      active = false;
    };
  }, [student]);

  const total = ENROLLMENT_POSES.length;
  const isBusy = phase === 'uploading' || phase === 'committing';
  const canFinish = stagedCount >= MIN_POSES_TO_COMMIT;
  const firstName = student?.name.split(' ')[0] ?? '';

  const begin = useCallback(async () => {
    const permission = await cameraPermissionManager.check();
    const granted =
      permission === 'granted' ? 'granted' : await cameraPermissionManager.request();
    if (granted !== 'granted') {
      setMessage('Camera access is required to enroll a student.');
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
          : 'The camera is unavailable. Try again.',
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
    if (!student || !preview) return;
    setPhase('uploading');
    const result = await uploadPose('student', student.id, poseIndex, preview);

    if (result.outcome === 'no_face') {
      // A bad frame specifically, so send them back to retake THIS pose rather
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

    setMessage(null);
    setStagedCount(result.stagedCount);
    setPreview(null);
    if (poseIndex + 1 < total) {
      setPoseIndex(poseIndex + 1);
    }
    setPhase('ready');
  }, [student, preview, poseIndex, total]);

  /** Opens the identity check. Nothing is made live until it is confirmed. */
  const onFinish = useCallback(() => {
    setMessage(null);
    setConfirmVisible(true);
  }, []);

  /**
   * Identity confirmed: promote the staged poses. Enrollment status changes
   * only here, so every cancel and error path leaves it untouched (Req 8.3–8.5).
   */
  const onConfirmIdentity = useCallback(async () => {
    if (!student) return;
    setConfirmVisible(false);
    setPhase('committing');
    const result = await commitEnrollment('student', student.id);

    if (result.outcome === 'error') {
      setMessage(result.message);
      setPhase('ready');
      return;
    }
    dispatch(
      setStudentEnrollmentStatus({ studentId: student.id, enrollmentStatus: 'enrolled' }),
    );
    setHasRecord(true);
    setPhase('done');
  }, [student, dispatch]);

  /**
   * Identity rejected — these photos are of someone else. Discard the staged
   * poses rather than leaving a child's images on the server waiting to be
   * overwritten by an attempt that may never happen (Req 8.4).
   */
  const onRejectIdentity = useCallback(async () => {
    if (!student) return;
    setConfirmVisible(false);
    void discardStaging('student', student.id);
    setStagedCount(0);
    setPoseIndex(0);
    setPreview(null);
    setPhase('idle');
    setMessage('Enrollment cancelled. The captured photos were discarded.');
  }, [student]);

  const confirmReEnroll = useCallback(() => {
    if (!student) return;
    Alert.alert(
      'Replace enrolled face?',
      `${student.name} (Roll ${student.rollNo}) is already enrolled. The existing photos stay in place until the new enrollment is completed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Re-enroll', style: 'destructive', onPress: () => void begin() },
      ],
    );
  }, [begin, student]);

  if (!student) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.subtitle}>No student was selected for enrollment.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Card elevation="sm" padding="md" style={styles.studentCard}>
        <View style={styles.studentRow}>
          <IconChip icon="user" color={moduleAccent.students.solid} size={46} />
          <View style={styles.flex}>
            <Text style={styles.studentName} numberOfLines={1}>
              {student.name}
            </Text>
            <Text style={styles.studentRoll}>Roll no. {student.rollNo}</Text>
          </View>
          <StatusPill
            label={hasRecord ? 'Enrolled' : 'Not enrolled'}
            tone={hasRecord ? 'success' : 'warning'}
            icon={hasRecord ? 'check-circle' : 'alert-circle'}
          />
        </View>
      </Card>

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
          message={`${stagedCount} photo${stagedCount === 1 ? '' : 's'} saved for ${student.name}.`}
        />
      ) : (
        <>
          {/* The camera stays MOUNTED for the whole session with the review shot
              overlaid. Swapping the two out unmounted the camera between poses,
              which dropped the capture reference and forced a cold restart. */}
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
                  ? `${firstName} is already enrolled. Re-enrolling replaces the existing photos.`
                  : `You will take up to ${total} photos of ${firstName}, one at a time. You can review and retake each one.`}
              </Text>
              {message ? <ErrorBanner message={message} /> : null}
              <Button
                label={hasRecord ? 'Re-enroll student' : 'Start enrollment'}
                icon={hasRecord ? 'refresh-cw' : 'camera'}
                size="lg"
                onPress={hasRecord ? confirmReEnroll : begin}
                tone={{ gradient: moduleAccent.students.gradient }}
              />
            </>
          ) : (
            <>
              <Text style={styles.stepLabel}>
                PHOTO {Math.min(poseIndex + 1, total)} OF {total} · {stagedCount} SAVED
              </Text>
              <Text style={styles.instruction}>
                {promptFor(ENROLLMENT_POSES[poseIndex].key, firstName)}
              </Text>

              {message ? <ErrorBanner message={message} /> : null}

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
                  tone={{ gradient: moduleAccent.students.gradient }}
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

              {/* Available as soon as the server would accept a commit, so three
                  good photos are enough when the student will not sit for five. */}
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

      {/* Identity check (Req 8.2–8.4): the last step before the staged photos
          become this student's live enrollment. */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => void onRejectIdentity()}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <IconChip icon="user-check" color={moduleAccent.students.solid} size={44} />
              <Text style={styles.modalTitle}>Confirm student identity</Text>
            </View>

            <Text style={styles.modalBody}>
              Save these {stagedCount} photo{stagedCount === 1 ? '' : 's'} as the enrolled face of:
            </Text>

            <View style={styles.modalStudent}>
              <Text style={styles.modalStudentName}>{student.name}</Text>
              <Text style={styles.modalStudentRoll}>Roll no. {student.rollNo}</Text>
            </View>

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => void onRejectIdentity()}
                style={styles.modalAction}
              />
              <Button
                label="Confirm"
                icon="check"
                onPress={() => void onConfirmIdentity()}
                tone={{ gradient: gradients.success }}
                style={styles.modalAction}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },

  /* Student header */
  studentCard: {
    marginBottom: spacing.smd,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
  },
  studentName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  studentRoll: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  headerProgress: {
    marginBottom: spacing.md,
  },

  /* Camera frame */
  frame: {
    height: 330,
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

  /* Identity confirmation modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  modalBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.smd,
  },
  modalStudent: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  modalStudentName: {
    ...typography.h3,
    color: colors.text,
  },
  modalStudentRoll: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.smd,
  },
  modalAction: {
    flex: 1,
  },
});
