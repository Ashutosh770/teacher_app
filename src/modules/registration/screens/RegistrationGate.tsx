/**
 * Decides what a signed-in user sees before they reach the app.
 *
 * Mounted for every authenticated session, so an unregistered user is walked
 * through registration at login rather than discovering the requirement when
 * they first try to mark attendance.
 *
 * Registration has two steps and the gate carries the user through both —
 * consent, then face capture. An earlier version stopped after consent and let
 * `capture` fall through to the app, on the reasoning that leave, timetable and
 * diary need no face. That was wrong in practice: agreeing to the notice
 * dropped the user straight into the app with nothing prompting them to enroll,
 * so registration silently never completed. Capture is now part of the flow, with
 * an explicit skip for the non-face features rather than an implicit one.
 *
 * Fails OPEN, deliberately, and this is the opposite of the enroll gate on the
 * server. If the status call fails — offline, backend down — the user reaches
 * the app rather than being trapped on a screen they cannot complete without a
 * network. The server still refuses to enroll or verify without consent, so
 * nothing is bypassed; only the prompt is deferred.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../../shared/theme';
import { Pressable } from '../../../shared/components';
import { useAppDispatch, useAppSelector } from '../../../store';
import { loadRegistrationStatus } from '../state/registrationSlice';
import ConsentScreen from './ConsentScreen';

export default function RegistrationGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { status, data } = useAppSelector(state => state.registration);
  const hasRecord = useAppSelector(state => state.staffAttendance.enrollment.hasRecord);
  const [skippedCapture, setSkippedCapture] = useState(false);

  useEffect(() => {
    if (status === 'unknown') {
      dispatch(loadRegistrationStatus());
    }
  }, [status, dispatch]);

  // FaceEnrollmentScreen reports success into the staffAttendance slice, not
  // ours. Re-read the server's view when that flips so the gate advances on a
  // confirmed enrollment rather than on the screen's local opinion of one.
  useEffect(() => {
    if (hasRecord && data?.nextStep === 'capture') {
      dispatch(loadRegistrationStatus());
    }
  }, [hasRecord, data?.nextStep, dispatch]);

  if (status === 'unknown' || status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Checking your registration…</Text>
      </View>
    );
  }

  if (status === 'ready' && data?.nextStep === 'consent' && data.notice) {
    return <ConsentScreen notice={data.notice} />;
  }

  if (status === 'ready' && data?.nextStep === 'capture' && !skippedCapture) {
    // Required lazily, inside render, for the same reason `AppNavigator` uses
    // `getComponent` for every camera screen: this gate is mounted for EVERY
    // authenticated session, so a top-level import pulled the whole
    // `react-native-vision-camera` chain in at app boot. On any platform the
    // native module is missing (web, or a device where it is not ready when the
    // JS bundle first executes) that threw before the first screen rendered and
    // produced a blank app with no catchable error.
    const FaceEnrollmentScreen =
      require('../../staffAttendance/screens/FaceEnrollmentScreen').default;

    return (
      <View style={[styles.captureWrap, { paddingTop: insets.top }]}>
        <View style={styles.captureScreen}>
          <FaceEnrollmentScreen />
        </View>
        <Pressable
          // Padded clear of the gesture/navigation bar. Without this the skip
          // control sits directly under the system back gesture area, where it
          // is both hard to hit and easy to trigger by accident.
          style={[styles.skip, { paddingBottom: insets.bottom + spacing.sm }]}
          onPress={() => setSkippedCapture(true)}
          dimOnPress
          accessibilityRole="button"
          accessibilityLabel="Skip face enrollment for now"
        >
          <Text style={styles.skipText}>Skip for now — I&apos;ll enroll later</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  captureWrap: { flex: 1, backgroundColor: colors.background },
  captureScreen: { flex: 1 },
  skip: {
    paddingTop: spacing.smd,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  // Understated on purpose: skipping is supported (attendance falls back to
  // manual marking) but it should not read as the expected path.
  skipText: {
    ...typography.caption,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
