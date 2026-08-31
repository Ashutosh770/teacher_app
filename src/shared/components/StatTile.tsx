import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography, withAlpha } from '../theme';

/**
 * A single number with a label — the unit the dashboard, roster stats and
 * timetable summary are all built from.
 *
 * `value` uses the `stat` type token (28/34, -0.8 tracking) so a row of tiles
 * shares an optical baseline even when the digits differ in width, and `tone`
 * resolves to a `*Text` colour so a large figure never lands below 4.5:1.
 */
export interface StatTileProps {
  value: number | string;
  label: string;
  /** Optional Feather icon rendered in a tinted well above the value. */
  icon?: keyof typeof Feather.glyphMap;
  /** Text/icon colour. Pass a `*Text` token or a module accent's `.text`. */
  tone?: string;
  /** Small delta/context line under the label, e.g. "+3 today". */
  caption?: string;
  /** Fill the tile with a soft tint of `tone` and add a hairline ring. */
  filled?: boolean;
  align?: 'center' | 'left';
  style?: StyleProp<ViewStyle>;
}

export default function StatTile({
  value,
  label,
  icon,
  tone = colors.text,
  caption,
  filled = false,
  align = 'center',
  style,
}: StatTileProps): React.ReactElement {
  return (
    <View
      style={[
        styles.tile,
        align === 'left' ? styles.alignLeft : styles.alignCenter,
        filled && {
          backgroundColor: withAlpha(tone, 0.07),
          borderWidth: 1,
          borderColor: withAlpha(tone, 0.14),
        },
        style,
      ]}
      accessibilityLabel={`${label}: ${value}${caption ? `, ${caption}` : ''}`}
    >
      {icon ? (
        <View style={[styles.iconWell, { backgroundColor: withAlpha(tone, 0.12) }]}>
          <Feather name={icon} size={16} color={tone} />
        </View>
      ) : null}

      <Text style={[styles.value, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.smd,
    paddingHorizontal: spacing.sm,
    gap: spacing.xxs,
  },
  alignCenter: {
    alignItems: 'center',
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.stat,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  caption: {
    ...typography.micro,
    color: colors.textTertiary,
  },
});
