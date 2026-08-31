import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography, withAlpha } from '../theme';

export type StatusPillTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';
export type StatusPillSize = 'sm' | 'md';

/**
 * Tinted status badge — "Face Verified", "Draft", "Not Scanned", "Now".
 *
 * Tone resolves to two different steps of the same ramp: a soft tint for the
 * fill and a `*Text` step for the label. The previous version tinted the fill
 * from the *same* hex it used for the text, which put warning labels at 2.0:1
 * and success labels at 2.1:1. Splitting fill from text is what makes every
 * tone legible without changing the visual language.
 */
export interface StatusPillProps {
  label: string;
  tone?: StatusPillTone;
  size?: StatusPillSize;
  /** Feather icon name rendered before the label, auto-coloured to the tone. */
  icon?: keyof typeof Feather.glyphMap;
  /** Draw a hairline ring — use on tinted surfaces where the fill alone is weak. */
  bordered?: boolean;
  /** Solid fill with inverse text. Reserve for the single most urgent badge on screen. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<StatusPillTone, { fill: string; text: string }> = {
  success: { fill: colors.success, text: colors.successText },
  warning: { fill: colors.warning, text: colors.warningText },
  error: { fill: colors.error, text: colors.errorText },
  info: { fill: colors.info, text: colors.infoText },
  brand: { fill: colors.primary, text: colors.primaryText },
  neutral: { fill: colors.textSecondary, text: colors.textSecondary },
};

export default function StatusPill({
  label,
  tone = 'neutral',
  size = 'sm',
  icon,
  bordered = false,
  solid = false,
  style,
}: StatusPillProps): React.ReactElement {
  const { fill, text } = TONES[tone];
  // A solid pill reads its label on the ramp's mid step, so the label flips to
  // the inverse token rather than staying on the (now unreadable) text step.
  const labelColor = solid ? colors.textInverse : text;
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <View
      style={[
        styles.pill,
        size === 'md' && styles.pillMd,
        { backgroundColor: solid ? fill : withAlpha(fill, 0.12) },
        bordered && { borderWidth: 1, borderColor: withAlpha(fill, solid ? 0 : 0.28) },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {icon ? <Feather name={icon} size={iconSize} color={labelColor} style={styles.icon} /> : null}
      <Text style={[size === 'sm' ? styles.text : styles.textMd, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
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
  pillMd: {
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm - 1,
  },
  icon: {
    marginRight: spacing.xs,
  },
  text: {
    ...typography.micro,
    fontWeight: '700',
  },
  textMd: {
    ...typography.captionBold,
  },
});
