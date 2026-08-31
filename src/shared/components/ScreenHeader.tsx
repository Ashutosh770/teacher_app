import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Pressable from './Pressable';
import {
  borderRadius,
  colors,
  gradients,
  HIT_SLOP,
  MIN_TOUCH_TARGET,
  spacing,
  typography,
  withAlpha,
} from '../theme';

/**
 * Gradient screen header.
 *
 * Two things this fixes over the previous `GradientHeader`:
 *
 *  1. **Safe area.** The old header used a fixed `paddingTop: 32`. Every screen
 *     that used it renders with `headerShown: false`, so on any device with a
 *     status bar taller than 32pt (most modern Android and every notched iPhone)
 *     the title sat under the system clock. It now adds the real top inset.
 *  2. **Depth.** Two soft radial "orbs" and a bottom overhang give the header a
 *     sense of a lit surface rather than a flat colour block, and let content
 *     cards overlap it (`overlap`) without the seam showing.
 */
export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Gradient stops. Defaults to the brand indigo; use `moduleAccent[...].gradient`. */
  gradientColors?: [string, string, ...string[]];
  onBack?: () => void;
  /** Content rendered at the trailing edge of the top row (e.g. a bell button). */
  right?: React.ReactNode;
  /** Rendered below the subtitle, inside the gradient (e.g. a segmented control). */
  children?: React.ReactNode;
  /**
   * Extra bottom padding so a following card can be pulled up over the header
   * with a negative margin of the same size. Defaults to 0.
   */
  overlap?: number;
  /** Suppress the decorative orbs — use on headers that host dense chrome. */
  plain?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function ScreenHeader({
  title,
  subtitle,
  gradientColors = gradients.brand,
  onBack,
  right,
  children,
  overlap = 0,
  plain = false,
  style,
}: ScreenHeaderProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const hasTopRow = !!onBack || !!right;

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.header,
        {
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing.lg + overlap,
        },
        style,
      ]}
    >
      {!plain && (
        <>
          <View style={styles.orbTop} pointerEvents="none" />
          <View style={styles.orbBottom} pointerEvents="none" />
        </>
      )}

      {hasTopRow && (
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.iconButton}
            >
              <Feather name="arrow-left" size={22} color={colors.textInverse} />
            </Pressable>
          ) : (
            <View style={styles.iconButtonPlaceholder} />
          )}
          {right}
        </View>
      )}

      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children ? <View style={styles.childrenSlot}>{children}</View> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  orbTop: {
    position: 'absolute',
    top: -110,
    right: -70,
    width: 260,
    height: 260,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.08),
  },
  orbBottom: {
    position: 'absolute',
    bottom: -140,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.05),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.smd,
  },
  iconButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPlaceholder: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
  },
  title: {
    ...typography.h1,
    color: colors.textInverse,
  },
  subtitle: {
    ...typography.body,
    color: withAlpha(colors.overlayLight, 0.78),
    marginTop: spacing.xs,
  },
  childrenSlot: {
    marginTop: spacing.md,
  },
});
