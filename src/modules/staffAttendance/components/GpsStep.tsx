/**
 * GPS / geo-fence step of the staff attendance flow (task 10.1).
 *
 * Presentational step driven by the `staffAttendance` slice: renders a location
 * card and three status rows (distance / accuracy / mock) from `gps.result`, a
 * "Verify Location" action that drives `staffAttendanceService.requestLocation()`,
 * and reflects the acquiring / error / verified sub-states of the flow.
 *
 * The detailed permission/error recovery controls (retry, open-settings, manual
 * fallback) are intentionally NOT wired here — that is task 10.2. Optional
 * callback props are declared as seams so 10.2 can attach those controls without
 * restructuring this component.
 *
 * Requirements: 2.5, 3.2
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useAppSelector } from '../../../store';
import { colors, spacing, typography, borderRadius, withAlpha } from '../../../shared/theme';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import { staffAttendanceService } from '../services/staffAttendanceService';
import { locationPermissionManager } from '../../../shared/services/permissions';
import type { StaffFlowState } from '../state/staffAttendanceSlice';

/**
 * Seams for task 10.2. These are optional so the router can render the GPS step
 * today; 10.2 will supply the permission/error recovery handlers.
 */
export interface GpsStepProps {
  /** Retry GPS acquisition without re-requesting permission (Req 17.1). */
  onRetryLocation?: () => void;
  /** Open the OS settings screen when permission is blocked (Req 1.4). */
  onOpenSettings?: () => void;
  /** Switch to manual (geo-unverified) marking (Req 1.6/3.3). */
  onManualFallback?: () => void;
  /** Whether the overall GPS timeout has elapsed so fallback may be offered. */
  canFallBack?: boolean;
}

/** Semantic tone used to colour a status row's value. */
type Tone = 'good' | 'pending' | 'bad';

function toneColor(tone: Tone): string {
  switch (tone) {
    case 'good':
      return colors.success;
    case 'pending':
      return colors.warning;
    case 'bad':
    default:
      return colors.error;
  }
}

const ACQUIRING_STATES: ReadonlySet<StaffFlowState> = new Set<StaffFlowState>([
  'location_permission',
  'acquiring_gps',
  'evaluate_fence',
]);

/**
 * Recoverable geo-fence failure states (Req 17.1/2.5/2.6/3.2). In these states
 * a "Retry" re-acquires GPS without re-requesting permission, and a manual
 * fallback may be offered once the overall timeout has elapsed (Req 1.6).
 */
const GPS_ERROR_STATES: ReadonlySet<StaffFlowState> = new Set<StaffFlowState>([
  'gps_error',
  'unreliable',
  'out_of_fence',
  'mock_detected',
]);

export default function GpsStep(props: GpsStepProps): React.ReactElement {
  const flowState = useAppSelector((s) => s.staffAttendance.flowState);
  const result = useAppSelector((s) => s.staffAttendance.gps.result);
  const errorMessage = useAppSelector((s) => s.staffAttendance.error);
  const locationPermission = useAppSelector((s) => s.staffAttendance.locationPermission);

  const isAcquiring = ACQUIRING_STATES.has(flowState);
  const isVerified = flowState === 'location_verified';
  const isDenied = flowState === 'location_denied';
  const isGpsError = GPS_ERROR_STATES.has(flowState);
  const isManualFallback = flowState === 'manual_fallback';
  const isRecovery = isDenied || isGpsError || isManualFallback;

  // Manual fallback is offered once accuracy retries are exhausted
  // (`manual_fallback`) or the overall GPS timeout has elapsed (Req 1.6).
  const canFallBack =
    props.canFallBack ?? (isManualFallback || staffAttendanceService.canFallBackFromGps());

  const onVerifyLocation = useCallback(() => {
    void staffAttendanceService.requestLocation();
  }, []);

  const onContinue = useCallback(() => {
    void staffAttendanceService.startFaceStep();
  }, []);

  // Re-trigger the location permission request (Req 1.3). Only shown while
  // permission is 'denied' (not blocked, undetermined, or granted).
  const onRetryPermission = useCallback(() => {
    void staffAttendanceService.requestLocation();
  }, []);

  // Deep-link to OS settings when permission is permanently blocked (Req 1.4).
  const onOpenSettings = useCallback(() => {
    if (props.onOpenSettings) {
      props.onOpenSettings();
      return;
    }
    void locationPermissionManager.openSettings();
  }, [props]);

  // Retry GPS acquisition WITHOUT re-requesting permission (Req 17.1).
  const onRetryLocation = useCallback(() => {
    if (props.onRetryLocation) {
      props.onRetryLocation();
      return;
    }
    void staffAttendanceService.retryLocation();
  }, [props]);

  // Switch to manual (geo-unverified) marking (Req 1.6/3.3).
  const onManualFallback = useCallback(() => {
    if (props.onManualFallback) {
      props.onManualFallback();
      return;
    }
    staffAttendanceService.useManualFallback();
  }, [props]);

  // Derive the three status-row tones from the held geo-fence result.
  const distanceTone: Tone = result
    ? result.distanceMeters <= result.radiusMeters
      ? 'good'
      : 'bad'
    : 'pending';
  const accuracyTone: Tone = result
    ? result.accuracyMeters <= attendanceConfig.geoFence.maxAccuracyMeters
      ? 'good'
      : 'bad'
    : 'pending';
  const mockTone: Tone = result ? (result.status === 'mock_detected' ? 'bad' : 'good') : 'pending';

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  return (
    <View style={styles.container}>
      <Text style={styles.stepLabel}>Step 1</Text>
      <Text style={styles.title}>Location Verification</Text>
      <Text style={styles.subtitle}>
        We check that you are within the school geo-fence before face verification.
      </Text>

      {/* Map / location visual. */}
      <View style={styles.mapCard}>
        <LinearGradient colors={['#EFF6FF', '#ECFDF5']} style={StyleSheet.absoluteFill} />
        {isAcquiring ? (
          <View style={styles.mapCenter}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.mapCaption}>Acquiring GPS…</Text>
          </View>
        ) : (
          <>
            <View style={styles.mapCenter}>
              <Animated.View
                style={[
                  styles.pulseRing,
                  { backgroundColor: withAlpha(toneColor(distanceTone), 0.25) },
                  { opacity: ringOpacity, transform: [{ scale: ringScale }] },
                ]}
              />
              <View style={[styles.mapPinWrap, { backgroundColor: colors.primary }]}>
                <Feather name="map-pin" size={22} color={colors.surface} />
              </View>
            </View>
            {result ? (
              <View style={styles.youAreHereDot}>
                <View style={styles.youAreHereCore} />
              </View>
            ) : null}
            <View style={styles.distancePillWrap}>
              <View style={styles.distancePill}>
                <Text style={[styles.distancePillText, { color: toneColor(distanceTone) }]}>
                  {result ? `${Math.round(result.distanceMeters)} meters` : 'Locating…'}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Three tinted status rows: distance, accuracy, mock. */}
      <View style={styles.statusStack}>
        <StatusRow
          label="Distance from school"
          value={
            result ? `${Math.round(result.distanceMeters)} m / ${Math.round(result.radiusMeters)} m` : '—'
          }
          tone={distanceTone}
        />
        <StatusRow
          label="GPS Accuracy"
          value={result ? `±${Math.round(result.accuracyMeters)} m` : '—'}
          tone={accuracyTone}
        />
        <StatusRow
          label="Mock Location"
          value={result ? (result.status === 'mock_detected' ? 'Detected' : 'Not Detected') : '—'}
          tone={mockTone}
        />
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {isVerified ? (
        <TouchableOpacity style={styles.primaryButton} onPress={onContinue}>
          <Feather name="check-circle" size={18} color={colors.surface} />
          <Text style={styles.primaryButtonText}>Continue to face verification</Text>
        </TouchableOpacity>
      ) : isRecovery ? (
        /* Permission/error recovery + manual fallback controls (task 10.2),
           rendered per flowState + permission state with exact visibility rules. */
        <View style={styles.controls}>
          {/* Location DENIED (not blocked): retry the permission request (Req 1.3).
              Hidden when permission is undetermined, granted, or blocked. */}
          {isDenied && locationPermission === 'denied' ? (
            <TouchableOpacity style={styles.button} onPress={onRetryPermission}>
              <Text style={styles.buttonText}>Retry permission</Text>
            </TouchableOpacity>
          ) : null}

          {/* Location BLOCKED: open the OS settings screen (Req 1.4). */}
          {isDenied && locationPermission === 'blocked' ? (
            <TouchableOpacity style={styles.button} onPress={onOpenSettings}>
              <Text style={styles.buttonText}>Open settings</Text>
            </TouchableOpacity>
          ) : null}

          {/* GPS error / unreliable / out-of-fence / mock: retry GPS (Req 17.1). */}
          {isGpsError ? (
            <TouchableOpacity style={styles.button} onPress={onRetryLocation}>
              <Text style={styles.buttonText}>Retry</Text>
            </TouchableOpacity>
          ) : null}

          {/* Manual fallback: shown in manual_fallback (accuracy retries exhausted)
              or once the overall GPS timeout has elapsed (Req 1.6/3.3). */}
          {isManualFallback || (isGpsError && canFallBack) ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={onManualFallback}>
              <Text style={styles.secondaryButtonText}>Mark manually</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.primaryButton, isAcquiring && styles.buttonDisabled]}
          onPress={onVerifyLocation}
          disabled={isAcquiring}
        >
          <Text style={styles.primaryButtonText}>Verify Location</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <View style={[styles.statusRow, { backgroundColor: withAlpha(toneColor(tone), 0.1) }]}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color: toneColor(tone) }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  stepLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  mapCard: {
    height: 220,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  mapCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: borderRadius.full,
  },
  mapPinWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  youAreHereDot: {
    position: 'absolute',
    top: '42%',
    left: '58%',
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.blue,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  youAreHereCore: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  distancePillWrap: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  distancePill: {
    backgroundColor: withAlpha('#FFFFFF', 0.95),
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + spacing.xs,
    borderRadius: borderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  distancePillText: {
    ...typography.bodyBold,
  },
  mapCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  statusStack: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  statusLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  statusValue: {
    ...typography.body,
    fontWeight: '700',
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.md,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.secondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.surface,
    ...typography.body,
    fontWeight: '700',
  },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    color: '#fff',
    ...typography.body,
    fontWeight: '600',
  },
  controls: {
    gap: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    ...typography.body,
    fontWeight: '600',
  },
});
