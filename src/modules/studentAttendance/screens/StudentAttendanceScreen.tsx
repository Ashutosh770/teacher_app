import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  borderRadius,
  colors,
  moduleAccent,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import { useAppDispatch, useAppSelector } from '../../../store';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  Button,
  Card,
  EmptyState,
  Pressable,
  ScreenHeader,
  StatusPill,
  SyncStatusBadge,
} from '../../../shared/components';
import type { EmptyStateTone } from '../../../shared/components';
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
import { AddStudentModal, RosterList, ScanOverlay, StatsCard } from '../components';

/**
 * StudentAttendanceScreen — roster review + batch face-scan host (Req 9.x,
 * 10.x, 11.x, 12.x, 13.x, 14.x, 15.x, 17.x).
 *
 * The screen is a router over `sessionState`. Eight of those states are the
 * same shape — an icon, a headline, an explanation and one or two actions — so
 * they all render through `StatusView` rather than each carrying its own
 * bespoke centred stack, which is how they previously drifted into four
 * different button styles.
 */

/**
 * Class auto-selected when no class-selection UI has set one yet (Req 9.4
 * has no picker yet).
 */
const DEFAULT_CLASS_ID = 'X-A';

const ACCENT = moduleAccent.students;

/**
 * Wraps every session-state view in the shared gradient header. When
 * `embedded` is true (rendered under `AttendanceTabScreen`'s shared header +
 * mode switcher), the screen's own header is skipped to avoid stacking two.
 */
function ScreenFrame({ children, embedded }: { children: React.ReactNode; embedded: boolean }) {
  const navigation = useNavigation();
  return (
    <View style={styles.screen}>
      {!embedded && (
        <ScreenHeader
          title="Student Attendance"
          subtitle="Scan the class roster"
          gradientColors={ACCENT.gradient}
          onBack={() => navigation.goBack()}
        />
      )}
      <View style={styles.frameBody}>{children}</View>
    </View>
  );
}

/** Shared presentation for the router's terminal / interstitial states. */
function StatusView({
  icon,
  tone = 'neutral',
  title,
  message,
  primary,
  secondary,
}: {
  icon: keyof typeof Feather.glyphMap;
  tone?: EmptyStateTone;
  title: string;
  message: string;
  primary?: { label: string; onPress: () => void; icon?: keyof typeof Feather.glyphMap };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.centered}>
      <EmptyState icon={icon} tone={tone} title={title} message={message} />
      {(primary || secondary) && (
        <View style={styles.statusActions}>
          {primary && (
            <Button
              label={primary.label}
              icon={primary.icon}
              onPress={primary.onPress}
              tone={{ gradient: ACCENT.gradient }}
            />
          )}
          {secondary && (
            <Button label={secondary.label} variant="outline" onPress={secondary.onPress} />
          )}
        </View>
      )}
    </View>
  );
}

/** Centred spinner + caption, used for the two loading states. */
function LoadingView({ message }: { message: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{message}</Text>
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
        return <StatusPill label="Verified" tone="success" icon="check" />;
      }

      const isPresent = student.attendanceStatus === 'present';
      const isAbsent = student.attendanceStatus === 'absent';

      return (
        <View style={styles.markControl}>
          <Pressable
            onPress={() => handleMark(student.id, 'present')}
            activeScale={0.92}
            accessibilityRole="button"
            accessibilityState={{ selected: isPresent }}
            accessibilityLabel={`Mark ${student.name} present`}
            style={[styles.markButton, isPresent && styles.markButtonPresent]}
          >
            <Feather
              name="check"
              size={15}
              color={isPresent ? colors.textInverse : colors.textTertiary}
            />
          </Pressable>

          <Pressable
            onPress={() => handleMark(student.id, 'absent')}
            activeScale={0.92}
            accessibilityRole="button"
            accessibilityState={{ selected: isAbsent }}
            accessibilityLabel={`Mark ${student.name} absent`}
            style={[styles.markButton, isAbsent && styles.markButtonAbsent]}
          >
            <Feather
              name="x"
              size={15}
              color={isAbsent ? colors.textInverse : colors.textTertiary}
            />
          </Pressable>
        </View>
      );
    },
    [handleMark],
  );

  // --- No class selected: nothing to load yet (Req 9.4 empty state). ---
  if (!selectedClassId) {
    return (
      <ScreenFrame embedded={embedded}>
        <StatusView
          icon="users"
          tone="info"
          title="No class selected"
          message="Select a class to load its roster and start attendance."
        />
      </ScreenFrame>
    );
  }

  // --- Loading roster: spinner (Req 9.4). ---
  if (sessionState === 'loading_roster') {
    return (
      <ScreenFrame embedded={embedded}>
        <LoadingView message="Loading roster…" />
      </ScreenFrame>
    );
  }

  // --- Roster error: message + retry (Req 9.4). ---
  if (sessionState === 'roster_error') {
    return (
      <ScreenFrame embedded={embedded}>
        <StatusView
          icon="wifi-off"
          tone="error"
          title="Couldn't load roster"
          message={error ?? 'Something went wrong while loading the roster.'}
          primary={{ label: 'Retry', icon: 'refresh-cw', onPress: handleRetry }}
        />
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
        <StatusView
          icon="pause-circle"
          tone="warning"
          title="Scan paused"
          message={error ?? 'The scan was paused. Your recorded attendance has been kept.'}
          primary={{ label: 'Resume scan', icon: 'play', onPress: handleResumeScan }}
          secondary={{ label: 'End session', onPress: handleEndScan }}
        />
      </ScreenFrame>
    );
  }

  // --- Camera blocked: settings routing + back to roster (Req 10.7). ---
  if (sessionState === 'scan_blocked') {
    return (
      <ScreenFrame embedded={embedded}>
        <StatusView
          icon="camera-off"
          tone="error"
          title="Camera access required"
          message={error ?? 'Camera access is required to scan attendance. Enable it in settings.'}
          primary={{ label: 'Open settings', icon: 'settings', onPress: handleOpenSettings }}
          secondary={{ label: 'Back to roster', onPress: handleBackToRoster }}
        />
      </ScreenFrame>
    );
  }

  // --- Submitting: spinner (Req 14.1). ---
  if (sessionState === 'submitting') {
    return (
      <ScreenFrame embedded={embedded}>
        <LoadingView message="Submitting attendance…" />
      </ScreenFrame>
    );
  }

  // --- Unmarked confirmation prompt (Req 14.2, 14.3). ---
  if (sessionState === 'confirm_unmarked') {
    const unmarked = countUnmarked(roster);
    return (
      <ScreenFrame embedded={embedded}>
        <StatusView
          icon="alert-triangle"
          tone="warning"
          title="Unmarked students"
          message={`${unmarked} student${
            unmarked === 1 ? '' : 's'
          } will be submitted as unmarked. Submit anyway?`}
          primary={{ label: 'Confirm & submit', icon: 'check', onPress: handleConfirmSubmit }}
          secondary={{ label: 'Cancel', onPress: handleCancelSubmit }}
        />
      </ScreenFrame>
    );
  }

  // --- Submitted successfully (Req 14.1). ---
  if (sessionState === 'done') {
    return (
      <ScreenFrame embedded={embedded}>
        <StatusView
          icon="check-circle"
          tone="success"
          title="Attendance submitted"
          message="The class attendance has been saved."
          primary={{ label: 'Back to roster', onPress: handleBackToRoster }}
        />
      </ScreenFrame>
    );
  }

  // --- Queued offline for later sync (Req 14.5, 15.3). ---
  if (sessionState === 'pending_sync') {
    return (
      <ScreenFrame embedded={embedded}>
        <StatusView
          icon="upload-cloud"
          tone="warning"
          title="Saved offline"
          message="You're offline. The attendance was queued and will sync automatically when the connection returns."
          primary={{ label: 'Back to roster', onPress: handleBackToRoster }}
        />
      </ScreenFrame>
    );
  }

  // --- Submission failed: message + retry (Req 17.5). ---
  if (sessionState === 'submit_error') {
    return (
      <ScreenFrame embedded={embedded}>
        <StatusView
          icon="alert-circle"
          tone="error"
          title="Submission failed"
          message={error ?? 'Failed to submit attendance. Please try again.'}
          primary={{ label: 'Retry submit', icon: 'refresh-cw', onPress: handleSubmit }}
          secondary={{ label: 'Back to roster', onPress: handleBackToRoster }}
        />
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
                <View style={styles.headerText}>
                  <Text style={styles.rosterTitle}>Class roster</Text>
                  <Text style={styles.rosterCaption}>
                    {summary.total} student{summary.total === 1 ? '' : 's'} in {selectedClassId}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setAddVisible(true)}
                  activeScale={0.95}
                  accessibilityRole="button"
                  accessibilityLabel="Add student"
                  style={styles.addButton}
                >
                  <Feather name="user-plus" size={14} color={ACCENT.text} />
                  <Text style={styles.addButtonText}>Add</Text>
                </Pressable>
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
              <Button
                label="Start batch face scan"
                icon="camera"
                size="lg"
                onPress={handleStartScan}
                tone={{ gradient: ACCENT.gradient }}
                style={styles.scanButton}
              />
            </View>
          }
          ListFooterComponent={
            <Card
              elevation="none"
              padding="md"
              backgroundColor={withAlpha(colors.info, 0.07)}
              style={styles.infoBanner}
            >
              <View style={styles.infoBannerRow}>
                <Feather name="info" size={16} color={colors.infoText} />
                <Text style={styles.infoBannerText}>
                  Use batch scan for quick face verification. Students without face
                  enrollment can be marked manually.
                </Text>
              </View>
            </Card>
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
          {summary.pending > 0 ? (
            <Text style={styles.footerHint}>
              {summary.pending} student{summary.pending === 1 ? '' : 's'} still unmarked
            </Text>
          ) : null}
          <Button
            label="Submit attendance"
            icon="send"
            size="lg"
            onPress={handleSubmit}
            disabled={roster.length === 0}
            tone={{ gradient: ACCENT.gradient }}
          />
        </View>

        <AddStudentModal visible={addVisible} onClose={() => setAddVisible(false)} />
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

  /* Router state views */
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  statusActions: {
    alignSelf: 'stretch',
    gap: spacing.smd,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },

  /* Roster header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  rosterTitle: {
    ...typography.h3,
    color: colors.text,
  },
  rosterCaption: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.smd,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(ACCENT.solid, 0.12),
    borderWidth: 1,
    borderColor: withAlpha(ACCENT.solid, 0.28),
  },
  addButtonText: {
    ...typography.captionBold,
    color: ACCENT.text,
  },
  syncRow: {
    marginBottom: spacing.md,
  },
  scanButton: {
    marginBottom: spacing.md,
  },

  /* Footer */
  footer: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.smd,
    gap: spacing.sm,
  },
  footerHint: {
    ...typography.small,
    color: colors.warningText,
    textAlign: 'center',
  },

  /* Tip banner */
  infoBanner: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.info, 0.22),
  },
  infoBannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoBannerText: {
    ...typography.small,
    color: colors.text,
    flex: 1,
  },

  /* Manual marking controls (Req 12.1). */
  markControl: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  markButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markButtonPresent: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  markButtonAbsent: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
});
