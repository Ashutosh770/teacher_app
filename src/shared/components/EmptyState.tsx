import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Button from './Button';
import { borderRadius, colors, spacing, typography, withAlpha } from '../theme';

export type EmptyStateTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

/**
 * The "nothing here" state.
 *
 * Only the timetable had one of these before, written inline; every other list
 * screen rendered blank space when empty, which reads as a loading failure.
 * The illustration is a tinted, ringed icon well rather than an asset, so it
 * re-tones per module without shipping images.
 */
export interface EmptyStateProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  /** One or two sentences explaining why it's empty and what to do next. */
  message?: string;
  tone?: EmptyStateTone;
  actionLabel?: string;
  onAction?: () => void;
  /** Reduce vertical padding for use inside a card rather than a full screen. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<EmptyStateTone, string> = {
  neutral: colors.textSecondary,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.info,
};

export default function EmptyState({
  icon,
  title,
  message,
  tone = 'neutral',
  actionLabel,
  onAction,
  compact = false,
  style,
}: EmptyStateProps): React.ReactElement {
  const tint = TONES[tone];

  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      <View style={[styles.iconOuter, { backgroundColor: withAlpha(tint, 0.08) }]}>
        <View style={[styles.iconInner, { backgroundColor: withAlpha(tint, 0.12) }]}>
          <Feather name={icon} size={compact ? 24 : 30} color={tint} />
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="outline" size="sm" fullWidth={false} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  containerCompact: {
    paddingVertical: spacing.lg,
  },
  iconOuter: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconInner: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.lg,
  },
});
