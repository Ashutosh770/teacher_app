import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { borderRadius, colors, spacing } from '../theme';

/**
 * Glassmorphic card matching the Figma design's `bg-white/80 backdrop-blur-xl`
 * (light surface) and `bg-white/10 backdrop-blur-xl` (on-dark header chip)
 * treatments. RN has no native `backdrop-filter`, so this composes `expo-blur`'s
 * `BlurView` with a semi-opaque tint to approximate it.
 */
export interface GlassCardProps {
  children?: React.ReactNode;
  /** Use the light tint (white cards on light backgrounds) or dark tint (chips on navy headers). */
  variant?: 'light' | 'dark';
  /** Blur intensity, 0-100. Defaults to 20 (matches Figma's backdrop-blur-xl). */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}

export default function GlassCard({
  children,
  variant = 'light',
  intensity = 20,
  style,
}: GlassCardProps): React.ReactElement {
  return (
    <View style={[styles.container, variant === 'light' ? styles.light : styles.dark, style]}>
      <BlurView intensity={intensity} tint={variant === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  light: {
    backgroundColor: colors.glassSurface,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  dark: {
    backgroundColor: colors.glassLight,
    borderColor: colors.glassBorder,
  },
  content: {
    padding: spacing.lg,
  },
});
