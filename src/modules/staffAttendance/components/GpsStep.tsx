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
import React, { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppSelector } from '../../../store';
import { colors, spacing, typography, borderRadius } from '../../../shared/theme';
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify your location</Text>
      <Text style={styles.subtitle}>
        We check that you are within the school geo-fence before face verification.
      </Text>

      {/* Map / location card — placeholder for the Figma map preview. */}
      <View style={styles.mapCard}>
        {isAcquiring ? (
          <View style={styles.mapCenter}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.mapCaption}>Acquiring GPS…</Text>
          </View>
        ) : (
          <View style={styles.mapCenter}>
            <View style={styles.mapPin} />
            <Text style={styles.mapCaption}>
              {isVerified ? 'You are inside the school area' : 'Location preview'}
            </Text>
          </View>
        )}
      </View>

      {/* Three status rows: distance, accuracy, mock. */}
      <View style={styles.statusCard}>
        <StatusRow
          label="Distance"
          value={
            result ? `${Math.round(result.distanceMeters)} m / ${Math.round(result.radiusMeters)} m` : '—'
          }
          tone={distanceTone}
        />
        <View style={styles.divider} />
        <StatusRow
          label="Accuracy"
          value={result ? `±${Math.round(result.accuracyMeters)} m` : '—'}
          tone={accuracyTone}
        />
        <View style={styles.divider} />
        <StatusRow
          label="Mock location"
          value={result ? (result.status === 'mock_detected' ? 'Detected' : 'Not detected') : '—'}
          tone={mockTone}
        />
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {isVerified ? (
        <TouchableOpacity style={styles.button} onPress={onContinue}>
          <Text style={styles.buttonText}>Continue to face verification</Text>
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
          style={[styles.button, isAcquiring && styles.buttonDisabled]}
          onPress={onVerifyLocation}
          disabled={isAcquiring}
        >
          <Text style={styles.buttonText}>Verify Location</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={styles.statusValueWrap}>
        <View style={[styles.dot, { backgroundColor: toneColor(tone) }]} />
        <Text style={[styles.statusValue, { color: toneColor(tone) }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  mapCard: {
    height: 180,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  mapCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPin: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    marginBottom: spacing.sm,
  },
  mapCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  statusLabel: {
    ...typography.body,
    color: colors.text,
  },
  statusValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  statusValue: {
    ...typography.body,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.md,
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
