import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { borderRadius, colors, spacing, typography, withAlpha } from '../theme';

export type StatusPillTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Rounded, tinted status badge matching Figma's `bg-{color}/10` + solid-text
 * pill pattern (e.g. "Face Verified", "Draft", "Not Scanned"). Tone maps to a
 * theme color at low opacity for the background and full opacity for the text.
 */
export interface StatusPillProps {
  label: string;
  tone?: StatusPillTone;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const TONE_COLORS: Record<StatusPillTone, string> = {
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.blue,
  neutral: colors.textSecondary,
};

export default function StatusPill({ label, tone = 'neutral', icon, style }: StatusPillProps): React.ReactElement {
  const tint = TONE_COLORS[tone];
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(tint, 0.12) }, style]}>
      {icon}
      <Text style={[styles.text, { color: tint }, icon ? styles.textWithIcon : null]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  text: {
    ...typography.small,
    fontWeight: '700',
  },
  textWithIcon: {
    marginLeft: spacing.xs,
  },
});
