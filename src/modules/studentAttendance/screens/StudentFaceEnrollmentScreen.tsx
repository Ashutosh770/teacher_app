import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../../shared/theme';
import {
  faceEnrollmentService,
  type EnrollmentResult,
} from '../../../shared/services/faceEnrollment';
import { faceCaptureService } from '../../../shared/services/faceCapture';
import { cameraPermissionManager } from '../../../shared/services/permissions';
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

/** UI phase driving what the screen renders. */
type Phase =
  | { kind: 'idle' }
  | { kind: 'enrolling' }
  | { kind: 'success' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string; canOpenSettings: boolean };

/**
 * StudentFaceEnrollmentScreen — a class teacher enrolls a student's face on
 * their behalf (Req 8.1–8.8).
 *
 * The heavy lifting (permission → capture → derive → persist → queue-offline)
 * lives in the shared `faceEnrollmentService`. This screen owns the UI-level
 * pieces the service delegates back to it:
 *
 *  - The name+roll-number identity-confirm gate, passed as the `confirm`
 *    callback. It resolves the teacher's decision as a Promise<boolean>, so the
 *    service only persists after an explicit confirm (Req 8.2/8.3) and discards
 *    the capture on cancel, leaving enrollment status unchanged (Req 8.4).
 *  - The confirm-before-replace prompt for re-enrollment (Req 8.6).
 *  - Rendering the specific failure reason with a retry that never mutates the
 *    student's enrollment status (Req 8.5), including the camera-permission-
 *    required case where the attempt is cancelled without any status change
 *    (Req 8.7).
 *
 * Enrollment status only ever changes via `setStudentEnrollmentStatus` on the
 * `saved` outcome, so cancelled/error paths are safe by construction.
 */
export default function StudentFaceEnrollmentScreen(
  props: StudentFaceEnrollmentScreenProps,
) {
  const student = props.student ?? props.route?.params?.student;
  const dispatch = useAppDispatch();

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [hasRecord, setHasRecord] = useState(false);
  // Identity-confirm modal state. `resolver` holds the pending confirm()
  // promise's resolve fn so the modal buttons can settle the teacher's choice.
  const [confirmVisible, setConfirmVisible] = useState(false);
  const confirmResolver = useRef<((confirmed: boolean) => void) | null>(null);

  // Real camera preview + capture binding (Req 8.1). Without this,
  // `faceEnrollmentService.enroll()` always fails with "Camera is not
  // attached" since `captureFrame()` requires a mounted `<Camera>` ref. Back
  // camera, since the teacher points the device at the student.
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');
  useEffect(() => {
    if (cameraRef.current) {
      faceCaptureService.attachCamera(cameraRef.current);
    }
    return () => {
      faceCaptureService.detachCamera();
    };
  }, [device]);

  // Reflect whether a record already exists so we can show a re-enrollment
  // control and require confirm-before-replace (Req 8.6).
  useEffect(() => {
    let active = true;
    if (!student) {
      return;
    }
    faceEnrollmentService
      .hasEnrollment('student', student.id)
      .then(exists => {
        if (active) {
          setHasRecord(exists);
        }
      })
      .catch(() => {
        /* best-effort; absence of a record is the safe default */
      });
    return () => {
      active = false;
    };
  }, [student]);

  /**
   * The identity-confirm gate handed to the service. Opens the modal and
   * resolves with the teacher's decision (Req 8.2–8.4).
   */
  const confirmIdentity = useCallback((): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      confirmResolver.current = resolve;
      setConfirmVisible(true);
    });
  }, []);

  const settleConfirm = useCallback((confirmed: boolean) => {
    setConfirmVisible(false);
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    resolve?.(confirmed);
  }, []);

  const applyResult = useCallback(
    (result: EnrollmentResult) => {
      if (!student) {
        return;
      }
      switch (result.outcome) {
        case 'saved':
          // Only the save path mutates roster enrollment status (Req 8.3).
          dispatch(
            setStudentEnrollmentStatus({
              studentId: student.id,
              enrollmentStatus: 'enrolled',
            }),
          );
          setHasRecord(true);
          setPhase({ kind: 'success' });
          break;
        case 'cancelled':
          // Capture discarded; enrollment status unchanged (Req 8.4).
          setPhase({ kind: 'cancelled' });
          break;
        case 'error':
          // Specific reason surfaced; status unchanged, retry allowed
          // (Req 8.5). Permission problems route to Settings (Req 8.7).
          setPhase({
            kind: 'error',
            message: result.message,
            canOpenSettings:
              result.reason === 'camera_permission_required' &&
              result.permissionState === 'blocked',
          });
          break;
      }
    },
    [dispatch, student],
  );

  const runEnrollment = useCallback(async () => {
    if (!student) {
      return;
    }
    setPhase({ kind: 'enrolling' });
    try {
      const result = await faceEnrollmentService.enroll('student', student.id, {
        confirm: confirmIdentity,
      });
      applyResult(result);
    } catch {
      // The service is designed never to throw, but guard so the UI never gets
      // stuck in the enrolling state; the student's status stays unchanged.
      setPhase({
        kind: 'error',
        message: 'Face enrollment failed unexpectedly. Please try again.',
        canOpenSettings: false,
      });
    }
  }, [applyResult, confirmIdentity, student]);

  /**
   * Entry point for the enroll/re-enroll button. For an existing record we
   * require an explicit confirm-before-replace prompt before initiating the
   * capture (Req 8.6); a fresh enrollment starts immediately (Req 8.1).
   */
  const handleEnrollPress = useCallback(() => {
    if (!student) {
      return;
    }
    if (hasRecord) {
      Alert.alert(
        'Replace enrolled face?',
        `${student.name} (Roll ${student.rollNo}) already has an enrolled face. Replacing it will overwrite the existing record.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              void runEnrollment();
            },
          },
        ],
      );
      return;
    }
    void runEnrollment();
  }, [hasRecord, runEnrollment, student]);

  const handleOpenSettings = useCallback(() => {
    void cameraPermissionManager.openSettings();
  }, []);

  if (!student) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Student Face Enrollment</Text>
        <Text style={styles.error}>No student was selected for enrollment.</Text>
      </View>
    );
  }

  const enrolling = phase.kind === 'enrolling';
  const primaryLabel = hasRecord ? 'Re-enroll Face' : 'Start Face Enrollment';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Student Face Enrollment</Text>

      <View style={styles.cameraPanel}>
        {device ? (
          <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
        ) : (
          <View style={styles.cameraFallback}>
            <Feather name="camera" size={32} color={colors.disabled} />
          </View>
        )}
      </View>

      <View style={styles.studentCard}>
        <Text style={styles.studentName}>{student.name}</Text>
        <Text style={styles.studentRoll}>Roll No: {student.rollNo}</Text>
        <View
          style={[
            styles.statusPill,
            hasRecord ? styles.statusPillEnrolled : styles.statusPillPending,
          ]}
        >
          <Text style={styles.statusPillText}>
            {hasRecord ? 'Enrolled' : 'Not enrolled'}
          </Text>
        </View>
      </View>

      {phase.kind === 'success' && (
        <View style={[styles.banner, styles.bannerSuccess]}>
          <Text style={styles.bannerText}>
            {student.name}'s face was enrolled successfully.
          </Text>
        </View>
      )}

      {phase.kind === 'cancelled' && (
        <View style={[styles.banner, styles.bannerNeutral]}>
          <Text style={styles.bannerText}>
            Enrollment cancelled. {student.name}'s enrollment status is unchanged.
          </Text>
        </View>
      )}

      {phase.kind === 'error' && (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>{phase.message}</Text>
          {phase.canOpenSettings && (
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={handleOpenSettings}
            >
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, enrolling && styles.primaryButtonDisabled]}
        onPress={handleEnrollPress}
        disabled={enrolling}
      >
        {enrolling ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.primaryButtonText}>
            {phase.kind === 'error' ? 'Retry' : primaryLabel}
          </Text>
        )}
      </TouchableOpacity>

      {enrolling && (
        <Text style={styles.hint}>
          Capturing images. Hold the camera steady on the student's face.
        </Text>
      )}

      {/* Identity-confirm gate (Req 8.2–8.4): shown after capture, before the
          record is stored. */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => settleConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm student identity</Text>
            <Text style={styles.modalBody}>
              Store this face enrollment for the following student?
            </Text>
            <View style={styles.modalStudent}>
              <Text style={styles.modalStudentName}>{student.name}</Text>
              <Text style={styles.modalStudentRoll}>Roll No: {student.rollNo}</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => settleConfirm(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => settleConfirm(true)}
              >
                <Text style={styles.modalButtonPrimaryText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.text,
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
  studentCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  studentName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  studentRoll: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusPillEnrolled: {
    backgroundColor: colors.success,
  },
  statusPillPending: {
    backgroundColor: colors.warning,
  },
  statusPillText: {
    ...typography.small,
    color: colors.surface,
    fontWeight: '600',
  },
  banner: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerSuccess: {
    backgroundColor: '#DCFCE7',
  },
  bannerNeutral: {
    backgroundColor: colors.border,
  },
  bannerError: {
    backgroundColor: '#FEE2E2',
  },
  bannerText: {
    ...typography.body,
    color: colors.text,
  },
  settingsButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  settingsButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  primaryButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '600',
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  error: {
    ...typography.body,
    color: colors.error,
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
  modalTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  modalStudent: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  modalStudentName: {
    ...typography.h3,
    color: colors.text,
  },
  modalStudentRoll: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginLeft: spacing.sm,
  },
  modalButtonSecondary: {
    backgroundColor: colors.border,
  },
  modalButtonSecondaryText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  modalButtonPrimary: {
    backgroundColor: colors.primary,
  },
  modalButtonPrimaryText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '600',
  },
});
