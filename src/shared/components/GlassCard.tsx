import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { borderRadius, colors, shadows, spacing, withAlpha } from '../theme';

/**
 * Frosted surface — used for chips sitting on the gradient headers and for the
 * translucent panels over the camera preview.
 *
 * React Native has no `backdrop-filter`, so this composes `expo-blur` with a
 * semi-opaque tint. **On Android the blur is skipped entirely**: `expo-blur`
 * there is expensive enough to drop frames inside a scrolling roster, and it
 * frequently renders as a flat overlay anyway, so the fallback is a slightly
 * more opaque tint that reaches the same contrast without the cost. Use `Card`
 * for ordinary opaque content — this is only worth it over imagery.
 */
export interface GlassCardProps {
  children?: React.ReactNode;
  /** Light tint (over photos/light backgrounds) or dark tint (chips on gradient headers). */
  variant?: 'light' | 'dark';
  /** Blur intensity, 0-100. iOS only. */
  intensity?: number;
  padding?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

const USE_BLUR = Platform.OS === 'ios';

export default function GlassCard({
  children,
  variant = 'light',
  intensity = 24,
  padding = spacing.lg,
  radius = borderRadius.lg,
  style,
}: GlassCardProps): React.ReactElement {
  const isLight = variant === 'light';

  return (
    <View
      style={[
        styles.container,
        { borderRadius: radius },
        isLight ? styles.light : styles.dark,
        // Without the blur behind it the tint has to carry the separation on
        // its own, so it steps up in opacity on Android.
        !USE_BLUR && {
          backgroundColor: isLight
            ? withAlpha(colors.overlayLight, 0.94)
            : withAlpha(colors.cameraBackdrop, 0.34),
        },
        style,
      ]}
    >
      {USE_BLUR && (
        <BlurView
          intensity={intensity}
          tint={isLight ? 'light' : 'dark'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  light: {
    backgroundColor: colors.glassSurface,
    borderColor: withAlpha(colors.overlayLight, 0.5),
    ...shadows.md,
  },
  dark: {
    backgroundColor: colors.glassLight,
    borderColor: colors.glassBorder,
  },
});
