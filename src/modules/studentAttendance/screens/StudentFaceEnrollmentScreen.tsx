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
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../../../shared/theme';
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
      <View style={styles.studentCard}>
        <View style={styles.flex}>
          <Text style={styles.studentName}>{student.name}</Text>
          <Text style={styles.studentRoll}>Roll No: {student.rollNo}</Text>
        </View>
        <View
          style={[
            styles.statusPill,
            hasRecord ? styles.statusPillEnrolled : styles.statusPillPending,
          ]}
        >
          <Text style={styles.statusPillText}>{hasRecord ? 'Enrolled' : 'Not enrolled'}</Text>
        </View>
      </View>

      {phase === 'done' ? (
        <View style={styles.doneCard}>
          <Feather name="check-circle" size={40} color={colors.success} />
          <Text style={styles.doneText}>Enrollment complete</Text>
          <Text style={styles.subtitle}>
            {stagedCount} photos saved for {student.name}.
          </Text>
        </View>
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
          </View>

          {phase === 'idle' ? (
            <>
              <Text style={styles.subtitle}>
                {hasRecord
                  ? `${firstName} is already enrolled. Re-enrolling replaces the existing photos.`
                  : `You will take up to ${total} photos of ${firstName}, one at a time. You can review and retake each one.`}
              </Text>
              {message ? <Text style={styles.errorText}>{message}</Text> : null}
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={hasRecord ? confirmReEnroll : begin}
              >
                <Text style={styles.primaryButtonText}>
                  {hasRecord ? 'Re-enroll student' : 'Start enrollment'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.stepLabel}>
                Photo {Math.min(poseIndex + 1, total)} of {total} · {stagedCount} saved
              </Text>
              <Text style={styles.instruction}>
                {promptFor(ENROLLMENT_POSES[poseIndex].key, firstName)}
              </Text>

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

              {/* Available as soon as the server would accept a commit, so three
                  good photos are enough when the student will not sit for five. */}
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
            <Text style={styles.modalTitle}>Confirm student identity</Text>
            <Text style={styles.modalBody}>
              Save these {stagedCount} photos as the enrolled face of:
            </Text>
            <View style={styles.modalStudent}>
              <Text style={styles.modalStudentName}>{student.name}</Text>
              <Text style={styles.modalStudentRoll}>Roll No: {student.rollNo}</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => void onRejectIdentity()}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => void onConfirmIdentity()}
              >
                <Text style={styles.modalButtonPrimaryText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  studentName: { ...typography.h3, color: colors.text },
  studentRoll: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusPillEnrolled: { backgroundColor: colors.success },
  statusPillPending: { backgroundColor: colors.warning },
  statusPillText: { ...typography.small, color: colors.surface, fontWeight: '600' },
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
  primaryButtonText: { ...typography.body, color: colors.surface, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: { ...typography.body, color: colors.text, fontWeight: '600' },
  finishButton: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  reviewRow: { flexDirection: 'row' },
  disabled: { opacity: 0.5 },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  busyText: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  doneCard: { alignItems: 'center', paddingVertical: spacing.xl },
  doneText: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  modalTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  modalBody: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  modalStudent: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  modalStudentName: { ...typography.h3, color: colors.text },
  modalStudentRoll: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginLeft: spacing.sm,
  },
  modalButtonSecondary: { backgroundColor: colors.border },
  modalButtonSecondaryText: { ...typography.body, color: colors.text, fontWeight: '600' },
  modalButtonPrimary: { backgroundColor: colors.primary },
  modalButtonPrimaryText: { ...typography.body, color: colors.surface, fontWeight: '600' },
});
