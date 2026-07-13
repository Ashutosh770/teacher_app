import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { borderRadius, colors, spacing, typography } from '../../../shared/theme';
import { useAppDispatch, useAppSelector } from '../../../store';
import { SyncStatusBadge } from '../../../shared/components';
import { useSyncStatus } from '../../../shared/hooks/useSyncStatus';
import type { RosterStudent } from '../../../shared/types/attendance';
import {
  canManuallyMark,
  isLockedByFaceMatch,
  selectRosterSummary,
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
export default function StudentAttendanceScreen() {
  const dispatch = useAppDispatch();

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
  useEffect(() => {
    if (selectedClassId) {
      void loadRoster(selectedClassId);
    }
  }, [selectedClassId]);

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
      <View style={styles.centered}>
        <Text style={styles.title}>Student Attendance</Text>
        <Text style={styles.message}>
          Select a class to load its roster and start attendance.
        </Text>
      </View>
    );
  }

  // --- Loading roster: spinner (Req 9.4). ---
  if (sessionState === 'loading_roster') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.message}>Loading roster…</Text>
      </View>
    );
  }

  // --- Roster error: message + retry (Req 9.4). ---
  if (sessionState === 'roster_error') {
    return (
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
    );
  }

  // --- Scanning: full-screen scan overlay (Req 10.1, 10.6, 11.1, 11.2). ---
  if (sessionState === 'scanning') {
    return (
      <View style={styles.container}>
        <ScanOverlay
          presentCount={presentCount}
          total={summary.total}
          lastMatch={lastMatch}
          providerMode={providerMode}
          onEndSession={handleEndScan}
        />
      </View>
    );
  }

  // --- Scan paused: pause reason + Resume / End controls (Req 10.8, 17.4). ---
  if (sessionState === 'scan_paused') {
    return (
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
    );
  }

  // --- Camera blocked: settings routing + back to roster (Req 10.7). ---
  if (sessionState === 'scan_blocked') {
    return (
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
    );
  }

  // --- Submitting: spinner (Req 14.1). ---
  if (sessionState === 'submitting') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.message}>Submitting attendance…</Text>
      </View>
    );
  }

  // --- Unmarked confirmation prompt (Req 14.2, 14.3). ---
  if (sessionState === 'confirm_unmarked') {
    const unmarked = countUnmarked(roster);
    return (
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
    );
  }

  // --- Submitted successfully (Req 14.1). ---
  if (sessionState === 'done') {
    return (
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
    );
  }

  // --- Queued offline for later sync (Req 14.5, 15.3). ---
  if (sessionState === 'pending_sync') {
    return (
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
    );
  }

  // --- Submission failed: message + retry (Req 17.5). ---
  if (sessionState === 'submit_error') {
    return (
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
    );
  }

  // --- Default: roster review (roster_ready). ---
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Student Attendance</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setAddVisible(true)}
          accessibilityRole="button"
        >
          <Text style={styles.addButtonText}>+ Add Student</Text>
        </TouchableOpacity>
      </View>

      {/* Pending/failed offline-sync indicators for this module (Req 15.3, 15.5). */}
      <SyncStatusBadge
        pending={syncStatus.pending}
        failed={syncStatus.failed}
        style={styles.syncRow}
      />

      <StatsCard summary={summary} />

      {/* Start Batch Scan control (roster_ready). The service handles camera
          permission + provider mode + preview startup (Req 10.1). */}
      <TouchableOpacity
        style={styles.scanButton}
        onPress={handleStartScan}
        accessibilityRole="button"
      >
        <Text style={styles.scanButtonText}>Start Batch Scan</Text>
      </TouchableOpacity>

      {/* Roster list with manual present/absent controls wired via
          renderStatusControl (Req 12.1, 12.3). */}
      <View style={styles.listWrap}>
        <RosterList roster={roster} renderStatusControl={renderStatusControl} />
      </View>

      {/* Submit Attendance (Req 14.2). Blocks on unmarked entries via the
          confirm_unmarked prompt above. */}
      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
        accessibilityRole="button"
        disabled={roster.length === 0}
      >
        <Text style={styles.submitButtonText}>Submit Attendance</Text>
      </TouchableOpacity>

      <AddStudentModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
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
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  scanButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '600',
  },
  listWrap: {
    flex: 1,
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
