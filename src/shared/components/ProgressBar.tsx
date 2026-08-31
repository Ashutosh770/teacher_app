import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius, colors, gradients, motion, spacing, typography } from '../theme';

/**
 * Animated progress track — leave balances, roster completion, marks entry.
 *
 * The fill is a gradient rather than a flat colour so it keeps a sense of
 * direction at the small heights this app uses it at (6–10pt), and the timing
 * now comes from `motion` instead of a hardcoded 500ms.
 *
 * Width can't be animated on the native driver, so the fill uses a
 * `scaleX` transform on a full-width layer instead — that keeps the animation
 * off the JS thread even when several bars animate at once in a list.
 */
export interface ProgressBarProps {
  /** 0-1 fraction complete. Values outside the range are clamped. */
  progress: number;
  /** Gradient stops for the fill. Defaults to the brand indigo. */
  colors?: [string, string, ...string[]];
  trackColor?: string;
  height?: number;
  /** Render "x%" at the trailing edge above the track. */
  showValue?: boolean;
  /** Accessible description, e.g. "Casual leave remaining". */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export default function ProgressBar({
  progress,
  colors: fillColors = gradients.brandFlat,
  trackColor = colors.border,
  height = 8,
  showValue = false,
  label,
  style,
}: ProgressBarProps): React.ReactElement {
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const anim = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: clamped,
      duration: motion.duration.slower,
      easing: motion.easing.decelerate,
      useNativeDriver: true,
    }).start();
  }, [clamped, anim]);

  const radius = height / 2;

  return (
    <View style={style}>
      {showValue ? (
        <Text style={styles.value}>{Math.round(clamped * 100)}%</Text>
      ) : null}

      <View
        style={[styles.track, { backgroundColor: trackColor, height, borderRadius: radius }]}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              // Scale from the leading edge so the bar grows rightward rather
              // than outward from its centre.
              transform: [{ scaleX: anim }],
              transformOrigin: 'left',
            },
          ]}
        >
          <LinearGradient
            colors={fillColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: borderRadius.full,
  },
  value: {
    ...typography.micro,
    color: colors.textSecondary,
    alignSelf: 'flex-end',
    marginBottom: spacing.xs,
  },
});
