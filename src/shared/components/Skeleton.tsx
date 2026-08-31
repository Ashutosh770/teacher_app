import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { borderRadius, colors, motion, spacing } from '../theme';

/**
 * Shimmering placeholder block.
 *
 * Loading screens previously showed either a bare `ActivityIndicator` or
 * nothing at all, so a slow roster fetch was indistinguishable from an empty
 * roster. A skeleton communicates "this has shape, it's coming" and keeps the
 * layout from jumping when data lands.
 *
 * The pulse is opacity-only and native-driven, so it costs nothing on the JS
 * thread while the fetch it covers is in flight.
 */
export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export default function Skeleton({
  width = '100%',
  height = 14,
  radius = borderRadius.xs,
  style,
}: SkeletonProps): React.ReactElement {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: motion.duration.slower,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: motion.duration.slower,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.border,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }),
        },
        style,
      ]}
    />
  );
}

/**
 * Card-shaped skeleton for list placeholders — an icon well, a title line and
 * a shorter subtitle line, matching the proportions of the app's list rows.
 */
export function SkeletonCard({ style }: { style?: StyleProp<ViewStyle> }): React.ReactElement {
  return (
    <View style={[styles.card, style]}>
      <Skeleton width={44} height={44} radius={borderRadius.md} />
      <View style={styles.cardText}>
        <Skeleton width="65%" height={14} />
        <Skeleton width="40%" height={11} />
      </View>
    </View>
  );
}

/** Renders `count` stacked `SkeletonCard`s — the usual list-loading placeholder. */
export function SkeletonList({ count = 3 }: { count?: number }): React.ReactElement {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  cardText: {
    flex: 1,
    gap: spacing.sm,
  },
  list: {
    gap: spacing.smd,
  },
});
