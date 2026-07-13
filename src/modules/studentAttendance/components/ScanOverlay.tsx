import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { GlassCard } from '../../../shared/components';
import { faceCaptureService } from '../../../shared/services/faceCapture';
import type { MatchFeedback } from '../state/studentAttendanceSlice';

export interface ScanOverlayProps {
  /** Students marked present this session (Req 11.1). */
  presentCount: number;
  /** Roster size, used for the "present / total" counter. */
  total: number;
  /** Most recent match attempt feedback, or null (Req 11.2). */
  lastMatch: MatchFeedback | null;
  /** Provider mode — drives the mock-mode banner (Req 10.6). */
  providerMode: 'real' | 'mock';
  /** End/stop the scan session and return to roster review (Req 10.5). */
  onEndSession: () => void;
}

/**
 * Live batch-scan overlay, shown while `sessionState === 'scanning'`
 * (Req 10.1, 10.6, 11.1, 11.2).
 *
 * Renders the live camera preview (back camera, falling back to a decorative
 * panel when no device is available), the running scan counter
 * (present / total), transient match feedback for the most recent attempt, a
 * mock-mode banner when the face-match provider is running in mock mode
 * (Req 10.6), and an end/stop control (Req 10.5).
 *
 * The frame loop lives in `studentAttendanceService` and calls
 * `faceCaptureService.captureFrame()`, which requires a camera to be attached
 * via `attachCamera()` — this component owns that binding for the duration of
 * the scan session.
 */
export default function ScanOverlay({
  presentCount,
  total,
  lastMatch,
  providerMode,
  onEndSession,
}: ScanOverlayProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const guideOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  // Real camera preview + capture binding (Req 10.1/11.x). Back camera, since
  // this scans a room of students rather than the device holder.
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

  return (
    <View style={styles.container}>
      {providerMode === 'mock' && (
        <View style={styles.mockBanner} accessibilityRole="alert">
          <Text style={styles.mockBannerText}>
            MOCK MODE — face matching is simulated. No real recognition is running.
          </Text>
        </View>
      )}

      <View style={styles.preview}>
        {device ? (
          <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
        ) : (
          <LinearGradient colors={['#2D3748', '#1A202C']} style={StyleSheet.absoluteFill} />
        )}
        <Animated.View style={[styles.previewGuide, { opacity: guideOpacity }]} pointerEvents="none" />
        <Text style={styles.previewText} pointerEvents="none">
          Scanning for faces…
        </Text>

        <View style={styles.feedbackPillWrap} pointerEvents="none">
          <MatchFeedbackPill feedback={lastMatch} />
        </View>
      </View>

      <GlassCard style={styles.counterCard}>
        <Text style={styles.counterValue}>
          {presentCount}
          <Text style={styles.counterTotal}> / {total}</Text>
        </Text>
        <Text style={styles.counterLabel}>Present</Text>
      </GlassCard>

      <TouchableOpacity
        style={styles.endButton}
        onPress={onEndSession}
        accessibilityRole="button"
      >
        <Text style={styles.endButtonText}>End Scan</Text>
      </TouchableOpacity>
    </View>
  );
}

function MatchFeedbackPill({ feedback }: { feedback: MatchFeedback | null }) {
  if (!feedback) {
    return (
      <View style={[styles.feedbackPill, styles.feedbackNeutral]}>
        <Text style={styles.feedbackPillText}>Point the camera at students to scan.</Text>
      </View>
    );
  }

  switch (feedback.kind) {
    case 'match':
      return (
        <View style={[styles.feedbackPill, styles.feedbackMatch]}>
          <Text style={[styles.feedbackPillText, styles.feedbackPillTextOnColor]}>
            {feedback.name} - Roll {feedback.rollNo} ✓
          </Text>
        </View>
      );
    case 'already_present':
      return (
        <View style={[styles.feedbackPill, styles.feedbackNeutral]}>
          <Text style={styles.feedbackPillText}>
            {feedback.name} (Roll {feedback.rollNo}) is already present.
          </Text>
        </View>
      );
    case 'no_match':
      return (
        <View style={[styles.feedbackPill, styles.feedbackNoMatch]}>
          <Text style={[styles.feedbackPillText, styles.feedbackPillTextOnColor]}>No match found.</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mockBanner: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  mockBannerText: {
    ...typography.caption,
    color: colors.surface,
    fontWeight: '600',
  },
  preview: {
    flex: 1,
    minHeight: 220,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  previewGuide: {
    width: 180,
    height: 180,
    borderWidth: 4,
    borderColor: colors.secondary,
    borderRadius: borderRadius.lg,
  },
  previewText: {
    ...typography.caption,
    color: colors.surface,
    marginTop: spacing.md,
    opacity: 0.7,
  },
  feedbackPillWrap: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  counterCard: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  counterValue: {
    ...typography.h1,
    color: colors.success,
  },
  counterTotal: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  counterLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  feedbackPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  feedbackNeutral: {
    backgroundColor: withAlpha('#FFFFFF', 0.95),
  },
  feedbackMatch: {
    backgroundColor: withAlpha(colors.secondary, 0.95),
  },
  feedbackNoMatch: {
    backgroundColor: withAlpha(colors.warning, 0.95),
  },
  feedbackPillText: {
    ...typography.bodyBold,
    color: colors.primary,
    textAlign: 'center',
  },
  feedbackPillTextOnColor: {
    color: colors.surface,
  },
  endButton: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  endButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '600',
  },
});
