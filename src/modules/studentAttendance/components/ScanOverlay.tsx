import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, spacing, typography } from '../../../shared/theme';
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
 * Renders a live camera-preview placeholder, the running scan counter
 * (present / total), transient match feedback for the most recent attempt, a
 * mock-mode banner when the face-match provider is running in mock mode
 * (Req 10.6), and an end/stop control (Req 10.5).
 *
 * The real camera preview surface is a seam: the frame loop lives in
 * `studentAttendanceService`, and wiring an actual `Camera` view / paused
 * resume controls is handled elsewhere (task 14.2). This component only
 * presents live scan state pushed through the store.
 */
export default function ScanOverlay({
  presentCount,
  total,
  lastMatch,
  providerMode,
  onEndSession,
}: ScanOverlayProps) {
  return (
    <View style={styles.container}>
      {providerMode === 'mock' && (
        <View style={styles.mockBanner} accessibilityRole="alert">
          <Text style={styles.mockBannerText}>
            MOCK MODE — face matching is simulated. No real recognition is running.
          </Text>
        </View>
      )}

      {/* Live camera preview placeholder. The real preview surface is wired in
          alongside the native camera integration. */}
      <View style={styles.preview}>
        <View style={styles.previewGuide} />
        <Text style={styles.previewText}>Scanning for faces…</Text>
      </View>

      <View style={styles.counterCard}>
        <Text style={styles.counterValue}>
          {presentCount}
          <Text style={styles.counterTotal}> / {total}</Text>
        </Text>
        <Text style={styles.counterLabel}>Present</Text>
      </View>

      <MatchFeedbackRow feedback={lastMatch} />

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

function MatchFeedbackRow({ feedback }: { feedback: MatchFeedback | null }) {
  if (!feedback) {
    return (
      <View style={[styles.feedback, styles.feedbackNeutral]}>
        <Text style={styles.feedbackText}>Point the camera at students to scan.</Text>
      </View>
    );
  }

  switch (feedback.kind) {
    case 'match':
      return (
        <View style={[styles.feedback, styles.feedbackMatch]}>
          <Text style={styles.feedbackText}>
            Matched {feedback.name} (Roll {feedback.rollNo})
          </Text>
        </View>
      );
    case 'already_present':
      return (
        <View style={[styles.feedback, styles.feedbackNeutral]}>
          <Text style={styles.feedbackText}>
            {feedback.name} (Roll {feedback.rollNo}) is already present.
          </Text>
        </View>
      );
    case 'no_match':
      return (
        <View style={[styles.feedback, styles.feedbackNoMatch]}>
          <Text style={styles.feedbackText}>No match found.</Text>
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
    backgroundColor: colors.text,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  previewGuide: {
    width: 180,
    height: 220,
    borderWidth: 3,
    borderColor: colors.surface,
    borderRadius: borderRadius.full,
    opacity: 0.6,
  },
  previewText: {
    ...typography.caption,
    color: colors.surface,
    marginTop: spacing.md,
    opacity: 0.8,
  },
  counterCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
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
  feedback: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  feedbackNeutral: {
    backgroundColor: colors.border,
  },
  feedbackMatch: {
    backgroundColor: colors.success,
  },
  feedbackNoMatch: {
    backgroundColor: colors.warning,
  },
  feedbackText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
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
