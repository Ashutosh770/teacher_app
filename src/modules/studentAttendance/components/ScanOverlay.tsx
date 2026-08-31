import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
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
import { Button, ProgressBar } from '../../../shared/components';
import { faceCaptureService, FACE_PHOTO_RESOLUTION } from '../../../shared/services/faceCapture';
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
 * panel when no device is available), the running scan counter, transient match
 * feedback, a mock-mode banner (Req 10.6), and an end control (Req 10.5).
 *
 * The counter and controls sit *over* the preview rather than stacked below it:
 * this is a full-attention screen held up at a room of students, and the preview
 * is the thing that has to be as large as possible.
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
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const guideOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const guideScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.02] });

  // Real camera preview + capture binding (Req 10.1/11.x). Back camera, since
  // this scans a room of students rather than the device holder.
  const device = useCameraDevice('back');
  /**
   * Cap the capture resolution. Every scanned frame is now uploaded for
   * server-side recognition, and a full-sensor JPEG takes 12–14s to send — past
   * the per-frame timeout, so every frame failed and the scan paused itself
   * after three. The same cap fixed the identical problem in enrollment.
   */
  const format = useCameraFormat(device, [{ photoResolution: FACE_PHOTO_RESOLUTION }]);

  /**
   * Attach via a callback ref rather than an effect: an effect keyed on
   * `device` runs once, so a camera remount leaves the capture service holding
   * a dead reference and every later capture fails while the preview still
   * looks live.
   */
  const setCameraRef = useCallback((instance: Camera | null) => {
    if (instance) {
      faceCaptureService.attachCamera(instance);
    } else {
      faceCaptureService.detachCamera();
    }
  }, []);

  useEffect(() => () => faceCaptureService.detachCamera(), []);

  const fraction = total > 0 ? presentCount / total : 0;

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        {device ? (
          <Camera
            ref={setCameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            photoQualityBalance="speed"
            isActive
            photo
          />
        ) : (
          <LinearGradient colors={gradients.camera} style={StyleSheet.absoluteFill} />
        )}

        {/* Scrims top and bottom so white chrome stays legible over any scene. */}
        <LinearGradient
          colors={[withAlpha(colors.overlayDark, 0.7), 'transparent']}
          style={styles.scrimTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', withAlpha(colors.overlayDark, 0.8)]}
          style={styles.scrimBottom}
          pointerEvents="none"
        />

        {/* Reticle: corner brackets rather than a full box, so the frame guides
            without hiding the faces inside it. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.reticle, { opacity: guideOpacity, transform: [{ scale: guideScale }] }]}
        >
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </Animated.View>

        <View style={styles.topChrome} pointerEvents="box-none">
          {providerMode === 'mock' && (
            <View style={styles.mockBanner} accessibilityRole="alert">
              <Feather name="alert-triangle" size={14} color={colors.warningText} />
              <Text style={styles.mockBannerText}>
                Mock mode — face matching is simulated.
              </Text>
            </View>
          )}

          <View style={styles.counterChip}>
            <View style={styles.counterRow}>
              <Text style={styles.counterValue}>{presentCount}</Text>
              <Text style={styles.counterTotal}>/ {total}</Text>
              <Text style={styles.counterLabel}>present</Text>
            </View>
            <ProgressBar
              progress={fraction}
              colors={gradients.success}
              trackColor={withAlpha(colors.overlayLight, 0.25)}
              height={5}
              label="Students marked present"
            />
          </View>
        </View>

        <View style={styles.bottomChrome} pointerEvents="box-none">
          <MatchFeedbackPill feedback={lastMatch} />
          <Button
            label="End scan"
            icon="x-circle"
            variant="primary"
            size="lg"
            tone={{ gradient: gradients.danger }}
            onPress={onEndSession}
            style={styles.endButton}
          />
        </View>
      </View>
    </View>
  );
}

function MatchFeedbackPill({ feedback }: { feedback: MatchFeedback | null }) {
  if (!feedback) {
    return (
      <View style={[styles.feedbackPill, styles.feedbackNeutral]}>
        <Feather name="camera" size={15} color={colors.text} />
        <Text style={styles.feedbackPillText}>Point the camera at students to scan.</Text>
      </View>
    );
  }

  switch (feedback.kind) {
    case 'match':
      return (
        <View style={[styles.feedbackPill, styles.feedbackMatch]}>
          <Feather name="check-circle" size={16} color={colors.textInverse} />
          <Text style={[styles.feedbackPillText, styles.feedbackPillTextOnColor]}>
            {feedback.name} · Roll {feedback.rollNo}
          </Text>
        </View>
      );
    case 'already_present':
      return (
        <View style={[styles.feedbackPill, styles.feedbackNeutral]}>
          <Feather name="user-check" size={15} color={colors.textSecondary} />
          <Text style={styles.feedbackPillText}>
            {feedback.name} (Roll {feedback.rollNo}) is already present.
          </Text>
        </View>
      );
    case 'no_match':
      return (
        <View style={[styles.feedbackPill, styles.feedbackNoMatch]}>
          <Feather name="search" size={15} color={colors.textInverse} />
          <Text style={[styles.feedbackPillText, styles.feedbackPillTextOnColor]}>
            No match found.
          </Text>
        </View>
      );
  }
}

const RETICLE = 230;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  preview: {
    flex: 1,
    minHeight: 260,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.cameraBackdrop,
  },

  /* Scrims */
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 190,
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 230,
  },

  /* Reticle */
  reticle: {
    width: RETICLE,
    height: RETICLE,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: colors.success,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: borderRadius.md,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: borderRadius.md,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: borderRadius.md,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: borderRadius.md,
  },

  /* Chrome */
  topChrome: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
  },
  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm,
  },
  mockBannerText: {
    ...typography.micro,
    color: colors.warningText,
    fontWeight: '700',
  },
  counterChip: {
    alignSelf: 'flex-start',
    minWidth: 180,
    backgroundColor: withAlpha(colors.overlayDark, 0.5),
    borderWidth: 1,
    borderColor: withAlpha(colors.overlayLight, 0.18),
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  counterValue: {
    ...typography.h2,
    color: colors.textInverse,
  },
  counterTotal: {
    ...typography.captionBold,
    color: withAlpha(colors.overlayLight, 0.7),
  },
  counterLabel: {
    ...typography.micro,
    color: withAlpha(colors.overlayLight, 0.7),
    marginLeft: spacing.xxs,
  },

  bottomChrome: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.smd,
  },

  /* Feedback */
  feedbackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd - 2,
    ...shadows.md,
  },
  feedbackNeutral: {
    backgroundColor: withAlpha(colors.overlayLight, 0.96),
  },
  feedbackMatch: {
    backgroundColor: colors.success,
  },
  feedbackNoMatch: {
    backgroundColor: colors.warning,
  },
  feedbackPillText: {
    ...typography.captionBold,
    color: colors.text,
    textAlign: 'center',
    flexShrink: 1,
  },
  feedbackPillTextOnColor: {
    color: colors.textInverse,
  },
  endButton: {
    alignSelf: 'stretch',
  },
});
