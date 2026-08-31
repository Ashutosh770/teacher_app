import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, withAlpha } from '../theme';

/**
 * Tinted icon well — the leading glyph on quick-action cards, announcement
 * rows, timetable periods and settings rows.
 *
 * Radius now comes off the token scale per size bucket instead of the old
 * `size * 0.3`, which produced off-scale corners (13.2, 16.5, ...) that never
 * matched the card they sat inside.
 */
export interface IconChipProps {
  /** Feather icon name. Rendered at a size proportional to the chip. */
  icon?: keyof typeof Feather.glyphMap;
  /** Custom content, when a Feather glyph won't do. */
  children?: React.ReactNode;
  /** Accent colour — the icon is drawn in it, the well in a 12% tint of it. */
  color: string;
  size?: number;
  /** Solid fill with an inverse icon, for the one chip that should shout. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Corners track the radius scale rather than a fraction of the box. */
function radiusFor(size: number): number {
  if (size <= 32) return borderRadius.sm;
  if (size <= 48) return borderRadius.md;
  if (size <= 64) return borderRadius.lg;
  return borderRadius.xl;
}

export default function IconChip({
  icon,
  children,
  color,
  size = 44,
  solid = false,
  style,
}: IconChipProps): React.ReactElement {
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: solid ? color : withAlpha(color, 0.12),
          width: size,
          height: size,
          borderRadius: radiusFor(size),
        },
        style,
      ]}
    >
      {icon ? (
        <Feather name={icon} size={Math.round(size * 0.48)} color={solid ? colors.textInverse : color} />
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
