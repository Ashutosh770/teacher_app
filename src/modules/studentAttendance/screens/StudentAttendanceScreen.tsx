import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { useAppDispatch, useAppSelector } from '../../../store';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { GradientHeader, SyncStatusBadge } from '../../../shared/components';
import { useSyncStatus } from '../../../shared/hooks/useSyncStatus';
import type { RosterStudent } from '../../../shared/types/attendance';
import {
  canManuallyMark,
  isLockedByFaceMatch,
  selectRosterSummary,
  setSelectedClass,
  setSessionState,
} from '../state/studentAttendanceSlice';
import {
  cancelSubmit,
  confirmSubmit,
  countUnmarked,
  loadRoster,
  markManually,
  resumeScanSession,
  startScanSession,
  stopScanSession,
  submitAttendance,
} from '../services/studentAttendanceService';
import { cameraPermissionManager } from '../../../shared/services/permissions';
import {
  AddStudentModal,
  RosterList,
  ScanOverlay,
  StatsCard,
} from '../components';

/**
 * StudentAttendanceScreen — roster review + batch face-scan host (Req 9.x,
 * 10.x, 11.x, 12.x, 13.x, 14.x, 15.x, 17.x).
 *
 * Task 14.1 built the live stats card, read-only roster list, scan overlay, the
 * add-student modal, and the roster load states. Task 14.2 wires the remaining
 * controls onto that structure:
 *  - manual present/absent controls + a locked "Face Verified" indicator via
 *    `renderStatusControl` (Req 12.1, 12.3),
 *  - the Submit Attendance button + unmarked-confirmation prompt and the
 *    done / pending_sync / submit_error outcomes (Req 14.2, 14.3),
 *  - the scan-paused resume/end controls (Req 10.8, 17.4),
 *  - the camera-blocked message + Open Settings routing (Req 10.7), and
 *  - the pending/failed offline-sync indicators (Req 15.3, 15.5).
 */
/**
 * Class auto-selected when no class-selection UI has set one yet (Req 9.4
 * has no picker yet).
 */
const DEFAULT_CLASS_ID = 'X-A';

/**
 * Wraps every session-state view in the shared navy gradient header. When
 * `embedded` is true (rendered under `AttendanceTabScreen`'s shared header +
 * mode switcher), the screen's own header is skipped to avoid stacking two
 * navy headers.
 */
function ScreenFrame({ children, embedded }: { children: React.ReactNode; embedded: boolean }) {
  const navigation = useNavigation();
  return (
    <View style={styles.screen}>
      {!embedded && <GradientHeader title="Student Attendance" onBack={() => navigation.goBack()} />}
      <View style={styles.frameBody}>{children}</View>
    </View>
  );
}

export interface StudentAttendanceScreenProps {
  /** When true, renders without its own header — used when embedded under a
   * shared Attendance-tab header/mode-switcher (see `AttendanceTabScreen`). */
  embedded?: boolean;
}

export default function StudentAttendanceScreen({ embedded = false }: StudentAttendanceScreenProps = {}) {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const sessionState = useAppSelector(s => s.studentAttendance.sessionState);
  const roster = useAppSelector(s => s.studentAttendance.roster);
  const summary = useAppSelector(selectRosterSummary);
  const error = useAppSelector(s => s.studentAttendance.error);
  const selectedClassId = useAppSelector(s => s.studentAttendance.selectedClassId);
  const providerMode = useAppSelector(s => s.studentAttendance.providerMode);
  const presentCount = useAppSelector(s => s.studentAttendance.scan.presentCount);
  const lastMatch = useAppSelector(s => s.studentAttendance.scan.lastMatch);
  // Pending vs failed sync counts for this module, derived off the live queue
  // so they clear automatically once records sync (Req 15.3, 15.4, 15.5).
  const syncStatus = useSyncStatus('studentAttendance');

  const [addVisible, setAddVisible] = useState(false);

  // Load the roster on mount / when the selected class changes (Req 9.1, 9.4).
  // No class-selection UI exists yet, so default to a fixed class.
  useEffect(() => {
    if (!selectedClassId) {
      dispatch(setSelectedClass(DEFAULT_CLASS_ID));
    } else {
      void loadRoster(selectedClassId);
    }
  }, [selectedClassId, dispatch]);

  const handleRetry = useCallback(() => {
    if (selectedClassId) {
      void loadRoster(selectedClassId);
    }
  }, [selectedClassId]);

  const handleStartScan = useCallback(() => {
    void startScanSession();
  }, []);

  const handleEndScan = useCallback(() => {
    stopScanSession();
  }, []);

  const handleResumeScan = useCallback(() => {
    void resumeScanSession();
  }, []);

  const handleOpenSettings = useCallback(() => {
    void cameraPermissionManager.openSettings();
  }, []);

  const handleBackToRoster = useCallback(() => {
    dispatch(setSessionState('roster_ready'));
  }, [dispatch]);

  const handleSubmit = useCallback(() => {
    // submitAttendance blocks on unmarked entries by moving the session to
    // `confirm_unmarked` (Req 14.2); the confirm view below drives confirm /
    // cancel. Otherwise it persists and the outcome states render below.
    void submitAttendance();
  }, []);

  const handleConfirmSubmit = useCallback(() => {
    void confirmSubmit();
  }, []);

  const handleCancelSubmit = useCallback(() => {
    cancelSubmit();
  }, []);

  const handleMark = useCallback((studentId: string, status: 'present' | 'absent') => {
    markManually(studentId, status);
  }, []);

  // Opens per-student face enrollment. Only the fields the enrollment screen
  // needs are passed: it re-reads enrollment state from the server itself, so
  // handing it a roster row would mean two copies of a status that can differ.
  const handleEnrollPress = useCallback(
    (student: RosterStudent) => {
      (navigation as any).navigate('StudentFaceEnrollment', {
        student: { id: student.id, name: student.name, rollNo: student.rollNo },
      });
    },
    [navigation],
  );

  // Manual present/absent controls seam (Req 12.1, 12.3). Locked students show
  // a read-only "Face Verified" indicator with no control; everyone else gets
  // Present/Absent buttons that highlight the current status.
  const renderStatusControl = useCallback(
    (student: RosterStudent): React.ReactNode => {
      if (isLockedByFaceMatch(student) || !canManuallyMark(student)) {
        return (
          <View style={styles.lockedIndicator}>
            <Text style={styles.lockedText}>✓ Face Verified</Text>
          </View>
        );
      }
      const isPresent = student.attendanceStatus === 'present';
      const isAbsent = student.attendanceStatus === 'absent';
      return (
        <View style={styles.markControl}>
          <TouchableOpacity
            style={[styles.markButton, isPresent && styles.markButtonPresent]}
            onPress={() => handleMark(student.id, 'present')}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${student.name} present`}
          >
            <Text
              style={[styles.markButtonText, isPresent && styles.markButtonTextActive]}
            >
              Present
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.markButton, isAbsent && styles.markButtonAbsent]}
            onPress={() => handleMark(student.id, 'absent')}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${student.name} absent`}
          >
            <Text
              style={[styles.markButtonText, isAbsent && styles.markButtonTextActive]}
            >
              Absent
            </Text>
          </TouchableOpacity>
        </View>
      );
    },
    [handleMark],
  );

  // --- No class selected: nothing to load yet (Req 9.4 empty state). ---
  if (!selectedClassId) {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <Text style={styles.message}>
            Select a class to load its roster and start attendance.
          </Text>
        </View>
      </ScreenFrame>
    );
  }

  // --- Loading roster: spinner (Req 9.4). ---
  if (sessionState === 'loading_roster') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.message}>Loading roster…</Text>
        </View>
      </ScreenFrame>
    );
  }

  // --- Roster error: message + retry (Req 9.4). ---
  if (sessionState === 'roster_error') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <Text style={styles.title}>Couldn't load roster</Text>
          <Text style={styles.errorMessage}>
            {error ?? 'Something went wrong while loading the roster.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    );
  }

  // --- Scanning: full-screen scan overlay (Req 10.1, 10.6, 11.1, 11.2). ---
  if (sessionState === 'scanning') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.container}>
          <ScanOverlay
            presentCount={presentCount}
            total={summary.total}
            lastMatch={lastMatch}
            providerMode={providerMode}
            onEndSession={handleEndScan}
          />
        </View>
      </ScreenFrame>
    );
  }

  // --- Scan paused: pause reason + Resume / End controls (Req 10.8, 17.4). ---
  if (sessionState === 'scan_paused') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <Text style={styles.title}>Scan paused</Text>
          <Text style={styles.errorMessage}>
            {error ??
              'The scan was paused. Your recorded attendance has been kept.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleResumeScan}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Resume Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleEndScan}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>End Session</Text>
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    );
  }

  // --- Camera blocked: settings routing + back to roster (Req 10.7). ---
  if (sessionState === 'scan_blocked') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <Text style={styles.title}>Camera access required</Text>
          <Text style={styles.errorMessage}>
            {error ??
              'Camera access is required to scan attendance. Enable it in settings.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleOpenSettings}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleBackToRoster}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Back to Roster</Text>
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    );
  }

  // --- Submitting: spinner (Req 14.1). ---
  if (sessionState === 'submitting') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.message}>Submitting attendance…</Text>
        </View>
      </ScreenFrame>
    );
  }

  // --- Unmarked confirmation prompt (Req 14.2, 14.3). ---
  if (sessionState === 'confirm_unmarked') {
    const unmarked = countUnmarked(roster);
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <Text style={styles.title}>Unmarked students</Text>
          <Text style={styles.message}>
            {unmarked} student{unmarked === 1 ? '' : 's'} will be submitted as
            unmarked. Submit anyway?
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleConfirmSubmit}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Confirm & Submit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleCancelSubmit}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    );
  }

  // --- Submitted successfully (Req 14.1). ---
  if (sessionState === 'done') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <Text style={styles.title}>Attendance submitted</Text>
          <Text style={styles.successMessage}>
            The class attendance has been saved.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleBackToRoster}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Back to Roster</Text>
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    );
  }

  // --- Queued offline for later sync (Req 14.5, 15.3). ---
  if (sessionState === 'pending_sync') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <Text style={styles.title}>Saved offline</Text>
          <Text style={styles.message}>
            You're offline. The attendance was queued and will sync automatically
            when the connection returns.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleBackToRoster}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Back to Roster</Text>
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    );
  }

  // --- Submission failed: message + retry (Req 17.5). ---
  if (sessionState === 'submit_error') {
    return (
      <ScreenFrame embedded={embedded}>
        <View style={styles.centered}>
          <Text style={styles.title}>Submission failed</Text>
          <Text style={styles.errorMessage}>
            {error ?? 'Failed to submit attendance. Please try again.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSubmit}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Retry Submit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleBackToRoster}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Back to Roster</Text>
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    );
  }

  // --- Default: roster review (roster_ready). ---
  return (
    <ScreenFrame embedded={embedded}>
      <View style={styles.container}>
        {/* Everything above the rows scrolls WITH them. Held as fixed siblings
            these consumed most of the screen and left the roster about one row
            tall — the stats, the scan button and the tip are all reference
            material, and none of them earns permanent space over the list the
            teacher is actually working through. */}
        <RosterList
          roster={roster}
          renderStatusControl={renderStatusControl}
          onEnrollPress={handleEnrollPress}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <Text style={styles.rosterTitle}>Class Roster</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setAddVisible(true)}
                  accessibilityRole="button"
                >
                  <Feather name="user-plus" size={14} color={colors.secondary} />
                  <Text style={styles.addButtonText}>Add Student</Text>
                </TouchableOpacity>
              </View>

              {/* Pending/failed offline-sync indicators (Req 15.3, 15.5). */}
              <SyncStatusBadge
                pending={syncStatus.pending}
                failed={syncStatus.failed}
                style={styles.syncRow}
              />

              <StatsCard summary={summary} />

              {/* Start Batch Scan control (roster_ready). The service handles
                  camera permission + provider mode + preview startup (Req 10.1). */}
              <TouchableOpacity
                style={styles.scanButton}
                onPress={handleStartScan}
                accessibilityRole="button"
              >
                <Feather name="camera" size={20} color={colors.surface} />
                <Text style={styles.scanButtonText}>Start Batch Face Scan</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                <Text style={styles.infoBannerBold}>Tip: </Text>
                Use batch scan mode for quick face verification. Students without face
                enrollment can be marked manually.
              </Text>
            </View>
          }
        />

        {/* Submit Attendance (Req 14.2) is the one thing that stays put: it is
            the action that ends the session, and hunting for it at the bottom of
            a 60-student roster would be worse than the space it costs. Bottom
            inset only when NOT embedded — under the Attendance tab the tab bar
            already reserves it, and padding twice leaves a gap. */}
        <View
          style={[
            styles.footer,
            { paddingBottom: embedded ? spacing.md : insets.bottom + spacing.md },
          ]}
        >
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            accessibilityRole="button"
            disabled={roster.length === 0}
          >
            <Text style={styles.submitButtonText}>Submit Attendance</Text>
          </TouchableOpacity>
        </View>

        <AddStudentModal
          visible={addVisible}
          onClose={() => setAddVisible(false)}
        />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  frameBody: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    // Horizontal only. Bottom spacing now belongs to the pinned footer, and a
    // bottom pad here would sit below it as dead space.
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  rosterTitle: {
    ...typography.h2,
    color: colors.text,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  successMessage: {
    ...typography.body,
    color: colors.success,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  errorMessage: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  retryButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.secondary, 0.1),
  },
  addButtonText: {
    ...typography.caption,
    color: colors.secondary,
    fontWeight: '700',
  },
  scanButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  scanButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '700',
  },
  footer: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  infoBanner: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: withAlpha(colors.blue, 0.08),
    borderLeftWidth: 4,
    borderLeftColor: colors.blue,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  infoBannerText: {
    ...typography.caption,
    color: colors.text,
  },
  infoBannerBold: {
    fontWeight: '700',
  },
  // Manual marking controls (Req 12.1).
  markControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  markButton: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: spacing.xs,
  },
  markButtonPresent: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  markButtonAbsent: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  markButtonText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  markButtonTextActive: {
    color: colors.surface,
  },
  // Locked "Face Verified" indicator (Req 12.3).
  lockedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success,
  },
  lockedText: {
    ...typography.small,
    color: colors.surface,
    fontWeight: '600',
  },
  // Offline-sync indicator row spacing (Req 15.3, 15.5).
  syncRow: {
    marginBottom: spacing.md,
  },
});
