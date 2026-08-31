import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  borderRadius,
  colors,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';

/**
 * Shared heading for the staff attendance flow's steps.
 *
 * The flow is GPS → face → done, but nothing on screen previously said so
 * beyond a small "Step 1" caption — so a teacher who failed the face step had
 * no sense of how much was left. The dot track makes the sequence and the
 * current position explicit, and the same header is reused by every step so
 * they no longer drift apart typographically.
 */
export interface StepHeaderProps {
  /** 1-based index of the current step. */
  step: number;
  totalSteps: number;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  /** Accent for the icon well and the completed dots. */
  tone?: string;
}

export default function StepHeader({
  step,
  totalSteps,
  icon,
  title,
  subtitle,
  tone = colors.primary,
}: StepHeaderProps): React.ReactElement {
  return (
    <View style={styles.container}>
      <View style={styles.track} accessibilityLabel={`Step ${step} of ${totalSteps}`}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const isDone = i + 1 < step;
          const isCurrent = i + 1 === step;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                isCurrent && [styles.dotCurrent, { backgroundColor: tone }],
                isDone && { backgroundColor: withAlpha(tone, 0.45) },
              ]}
            />
          );
        })}
      </View>

      <View style={[styles.iconWell, { backgroundColor: withAlpha(tone, 0.12) }]}>
        <Feather name={icon} size={24} color={tone} />
      </View>

      <Text style={styles.stepLabel}>
        STEP {step} OF {totalSteps}
      </Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
  },
  dotCurrent: {
    width: 26,
  },
  iconWell: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.smd,
  },
  stepLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 320,
  },
});
