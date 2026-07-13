import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../theme';

/**
 * Gradient header bar matching Figma's per-screen accent gradients (navy for
 * attendance/leave, green for timetable, indigo for diary, etc). Accepts an
 * arbitrary set of gradient colors so each module can use its own accent while
 * sharing the same back-button/title/subtitle/right-slot layout.
 */
export interface GradientHeaderProps {
  title: string;
  subtitle?: string;
  /** Gradient stops, e.g. [colors.primary, colors.primaryLight, colors.primary]. */
  gradientColors?: [string, string, ...string[]];
  onBack?: () => void;
  /** Optional content rendered at the right of the title row (e.g. a bell icon). */
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function GradientHeader({
  title,
  subtitle,
  gradientColors = [colors.primary, colors.primaryLight, colors.primary],
  onBack,
  right,
  children,
  style,
}: GradientHeaderProps): React.ReactElement {
  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, style]}>
      <View style={styles.topRow}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
          >
            <Feather name="arrow-left" size={22} color={colors.surface} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButtonPlaceholder} />
        )}
        {right}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  title: {
    ...typography.h1,
    color: colors.surface,
  },
  subtitle: {
    ...typography.body,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: spacing.xs,
  },
});
