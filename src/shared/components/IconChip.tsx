import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { borderRadius, spacing, withAlpha } from '../theme';

/**
 * Small rounded, tinted container for a leading icon — matches Figma's
 * `bg-{color}/10 p-4 rounded-xl` icon wells used on quick-action cards,
 * announcement rows, and timetable period cards.
 */
export interface IconChipProps {
  children: React.ReactNode;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export default function IconChip({ children, color, size = 44, style }: IconChipProps): React.ReactElement {
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: withAlpha(color, 0.1), width: size, height: size, borderRadius: size * 0.3 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
  },
});
