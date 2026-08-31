/**
 * GPS / geo-fence step of the staff attendance flow.
 *
 * Presentational step driven by the `staffAttendance` slice: renders a location
 * card and three status rows (distance / accuracy / mock) from `gps.result`, a
 * "Verify Location" action that drives `staffAttendanceService.requestLocation()`,
 * and reflects the acquiring / error / verified sub-states of the flow, plus the
 * permission/error recovery controls (retry, open-settings, manual fallback).
 *
 * Requirements: 1.3, 1.4, 1.6, 2.5, 2.6, 3.2, 3.3, 17.1
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useAppSelector } from '../../../store';
import {
  borderRadius,
  colors,
  gradients,
  motion,
  shadows,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import { Button, Card } from '../../../shared/components';
import { attendanceConfig } from '../../../shared/config/attendanceConfig';
import { staffAttendanceService } from '../services/staffAttendanceService';
import { locationPermissionManager } from '../../../shared/services/permissions';
import type { StaffFlowState } from '../state/staffAttendanceSlice';
import StepHeader from './StepHeader';

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

/** Fill colour — safe for icons, rings and bars. */
function toneFill(tone: Tone): string {
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

/**
 * Text colour. Distinct from the fill above: these values render at 15px on a
 * light tint, where the fill steps sit at ~2:1.
 */
function toneText(tone: Tone): string {
  switch (tone) {
    case 'good':
      return colors.successText;
    case 'pending':
      return colors.warningText;
    case 'bad':
    default:
      return colors.errorText;
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
  const flowState = useAppSelector(s => s.staffAttendance.flowState);
  const result = useAppSelector(s => s.staffAttendance.gps.result);
  const errorMessage = useAppSelector(s => s.staffAttendance.error);
  const locationPermission = useAppSelector(s => s.staffAttendance.locationPermission);

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
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: motion.easing.decelerate,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.container}>
      <StepHeader
        step={1}
        totalSteps={2}
        icon="map-pin"
        title="Location verification"
        subtitle="We check that you are within the school geo-fence before face verification."
      />

      {/* Map / location visual. */}
      <View style={styles.mapCard}>
        <LinearGradient colors={gradients.calm} style={StyleSheet.absoluteFill} />
        {/* A faint grid reads as "map" without shipping tiles or a map SDK. */}
        <View style={styles.grid} pointerEvents="none">
          {Array.from({ length: 5 }, (_, i) => (
            <View key={`h${i}`} style={[styles.gridLine, { top: `${(i + 1) * 16}%` }]} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 16}%` }]} />
          ))}
        </View>

        {isAcquiring ? (
          <View style={styles.mapCenter}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.mapCaption}>Acquiring GPS…</Text>
          </View>
        ) : (
          <>
            <View style={styles.mapCenter}>
              <Animated.View
                style={[
                  styles.pulseRing,
                  { backgroundColor: withAlpha(toneFill(distanceTone), 0.22) },
                  { opacity: ringOpacity, transform: [{ scale: ringScale }] },
                ]}
              />
              <View style={styles.fenceRing} />
              <View style={styles.mapPinWrap}>
                <Feather name="home" size={22} color={colors.textInverse} />
              </View>
            </View>

            {result ? (
              <View style={styles.youAreHereDot}>
                <View style={styles.youAreHereCore} />
              </View>
            ) : null}

            <View style={styles.distancePillWrap}>
              <View style={styles.distancePill}>
                <Feather name="navigation" size={13} color={toneText(distanceTone)} />
                <Text style={[styles.distancePillText, { color: toneText(distanceTone) }]}>
                  {result ? `${Math.round(result.distanceMeters)} m from school` : 'Locating…'}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Three tinted status rows: distance, accuracy, mock. */}
      <View style={styles.statusStack}>
        <StatusRow
          icon="navigation"
          label="Distance from school"
          value={
            result ? `${Math.round(result.distanceMeters)} m / ${Math.round(result.radiusMeters)} m` : '—'
          }
          tone={distanceTone}
        />
        <StatusRow
          icon="target"
          label="GPS accuracy"
          value={result ? `±${Math.round(result.accuracyMeters)} m` : '—'}
          tone={accuracyTone}
        />
        <StatusRow
          icon="shield"
          label="Mock location"
          value={result ? (result.status === 'mock_detected' ? 'Detected' : 'Not detected') : '—'}
          tone={mockTone}
        />
      </View>

      {errorMessage ? (
        <Card
          elevation="none"
          padding="sm"
          backgroundColor={colors.errorSoft}
          style={styles.errorBanner}
        >
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={16} color={colors.errorText} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        </Card>
      ) : null}

      {isVerified ? (
        <Button
          label="Continue to face verification"
          icon="check-circle"
          iconRight="arrow-right"
          size="lg"
          tone={{ gradient: gradients.success }}
          onPress={onContinue}
        />
      ) : isRecovery ? (
        /* Permission/error recovery + manual fallback controls, rendered per
           flowState + permission state with exact visibility rules. */
        <View style={styles.controls}>
          {/* Location DENIED (not blocked): retry the permission request (Req 1.3).
              Hidden when permission is undetermined, granted, or blocked. */}
          {isDenied && locationPermission === 'denied' ? (
            <Button label="Retry permission" icon="refresh-cw" size="lg" onPress={onRetryPermission} />
          ) : null}

          {/* Location BLOCKED: open the OS settings screen (Req 1.4). */}
          {isDenied && locationPermission === 'blocked' ? (
            <Button label="Open settings" icon="settings" size="lg" onPress={onOpenSettings} />
          ) : null}

          {/* GPS error / unreliable / out-of-fence / mock: retry GPS (Req 17.1). */}
          {isGpsError ? (
            <Button label="Retry" icon="refresh-cw" size="lg" onPress={onRetryLocation} />
          ) : null}

          {/* Manual fallback: shown in manual_fallback (accuracy retries exhausted)
              or once the overall GPS timeout has elapsed (Req 1.6/3.3). */}
          {isManualFallback || (isGpsError && canFallBack) ? (
            <Button label="Mark manually" variant="outline" size="lg" onPress={onManualFallback} />
          ) : null}
        </View>
      ) : (
        <Button
          label={isAcquiring ? 'Verifying…' : 'Verify location'}
          icon="crosshair"
          size="lg"
          loading={isAcquiring}
          disabled={isAcquiring}
          onPress={onVerifyLocation}
        />
      )}
    </View>
  );
}

function StatusRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  tone: Tone;
}) {
  const fill = toneFill(tone);
  const text = toneText(tone);

  return (
    <View
      style={[
        styles.statusRow,
        { backgroundColor: withAlpha(fill, 0.08), borderColor: withAlpha(fill, 0.2) },
      ]}
    >
      <View style={[styles.statusIcon, { backgroundColor: withAlpha(fill, 0.14) }]}>
        <Feather name={icon} size={15} color={text} />
      </View>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color: text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },

  /* Map */
  mapCard: {
    height: 230,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  grid: {
    ...StyleSheet.absoluteFill,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(colors.primary, 0.09),
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(colors.primary, 0.09),
  },
  mapCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: borderRadius.full,
  },
  fenceRing: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: withAlpha(colors.primary, 0.28),
    backgroundColor: withAlpha(colors.primary, 0.05),
  },
  mapPinWrap: {
    width: 54,
    height: 54,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  youAreHereDot: {
    position: 'absolute',
    top: '40%',
    left: '62%',
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    backgroundColor: colors.info,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  youAreHereCore: {
    width: 7,
    height: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  distancePillWrap: {
    position: 'absolute',
    bottom: spacing.smd,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: withAlpha(colors.overlayLight, 0.96),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    ...shadows.sm,
  },
  distancePillText: {
    ...typography.captionBold,
  },
  mapCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.smd,
  },

  /* Status rows */
  statusStack: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.smd,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  statusValue: {
    ...typography.captionBold,
  },

  /* Error */
  errorBanner: {
    marginBottom: spacing.md,
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

  controls: {
    gap: spacing.smd,
  },
});
