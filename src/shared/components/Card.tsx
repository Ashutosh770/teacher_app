import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Pressable from './Pressable';
import { borderRadius, colors, shadows, ShadowLevel, spacing } from '../theme';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

/**
 * The app's content container.
 *
 * Replaces eleven hand-rolled card StyleSheets that disagreed on radius,
 * shadow and border. Elevation comes from `shadows`, so a card can no longer
 * end up with an invented shadow opacity — the previous Home grid had *no*
 * shadow at all, leaving white cards at ~1.1:1 against the background.
 *
 * Pass `onPress` to make it interactive; it then gets the shared press-scale
 * feedback and a button role automatically.
 */
export interface CardProps {
  children?: React.ReactNode;
  /** Elevation level. Defaults to `sm` (resting card). */
  elevation?: ShadowLevel;
  padding?: CardPadding;
  /** Draw a hairline border. Useful on tinted cards where the shadow reads weakly. */
  bordered?: boolean;
  /** Override the fill — e.g. a semantic tint for a highlighted row. */
  backgroundColor?: string;
  radius?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PADDING: Record<CardPadding, number> = {
  none: 0,
  sm: spacing.smd,
  md: spacing.md,
  lg: spacing.lg,
};

export default function Card({
  children,
  elevation = 'sm',
  padding = 'lg',
  bordered = false,
  backgroundColor = colors.surface,
  radius = borderRadius.lg,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardProps): React.ReactElement {
  const frame: StyleProp<ViewStyle> = [
    styles.base,
    shadows[elevation],
    {
      backgroundColor,
      borderRadius: radius,
      padding: PADDING[padding],
    },
    bordered && styles.bordered,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
        style={frame}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={frame} testID={testID} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.border,
  },
});
