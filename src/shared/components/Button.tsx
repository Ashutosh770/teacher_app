import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Pressable from './Pressable';
import {
  borderRadius,
  colors,
  gradients,
  MIN_TOUCH_TARGET,
  shadows,
  spacing,
  typography,
  withAlpha,
} from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * The app's single button.
 *
 * Previously every screen hand-rolled `TouchableOpacity` + a local StyleSheet,
 * which is why the login CTA, the consent CTA and the GPS CTA had three
 * different heights, radii and disabled treatments. Consolidating here also
 * gives every call site a real loading state and a 44pt minimum target.
 *
 * `primary` renders a gradient fill; pass `tone` to re-accent it per module
 * (e.g. the timetable's emerald) without leaving the token set.
 */
export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading Feather icon name. */
  icon?: keyof typeof Feather.glyphMap;
  /** Trailing Feather icon name — use for "next"/"continue" affordances. */
  iconRight?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width. Defaults to true — most CTAs here are full-bleed. */
  fullWidth?: boolean;
  /**
   * Accent override. Supply a `[from, to]` gradient for `primary`, or a solid
   * color for the other variants. Defaults to the brand indigo.
   */
  tone?: { gradient?: [string, string, ...string[]]; solid?: string };
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; text: TextStyle; icon: number; gap: number }> = {
  sm: { height: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, text: typography.captionBold, icon: 15, gap: spacing.xs },
  md: { height: 50, paddingHorizontal: spacing.lg, text: typography.bodyBold, icon: 18, gap: spacing.sm },
  lg: { height: 58, paddingHorizontal: spacing.lg, text: { ...typography.title, fontWeight: '700' }, icon: 20, gap: spacing.sm },
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
  tone,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps): React.ReactElement {
  const sizing = SIZES[size];
  const isInert = disabled || loading;
  const solid = tone?.solid ?? colors.primary;

  // Content colour is resolved first so the spinner and icons always match the
  // label — a mismatch was visible on the old login button, whose spinner was
  // hardcoded white while the disabled label was not.
  const contentColor = isInert
    ? variant === 'primary'
      ? colors.textInverse
      : colors.disabledText
    : variant === 'primary'
      ? colors.textInverse
      : variant === 'danger'
        ? colors.errorText
        : solid;

  const body = (
    <View style={[styles.content, { gap: sizing.gap }]}>
      {loading ? (
        <ActivityIndicator color={contentColor} size="small" />
      ) : (
        <>
          {icon ? <Feather name={icon} size={sizing.icon} color={contentColor} /> : null}
          <Text style={[sizing.text, { color: contentColor }]} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Feather name={iconRight} size={sizing.icon} color={contentColor} /> : null}
        </>
      )}
    </View>
  );

  const frame: ViewStyle = {
    height: sizing.height,
    paddingHorizontal: sizing.paddingHorizontal,
    borderRadius: borderRadius.md,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  if (variant === 'primary') {
    const stops = (tone?.gradient ?? gradients.brandFlat) as [string, string, ...string[]];
    return (
      <Pressable
        onPress={onPress}
        disabled={isInert}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isInert, busy: loading }}
        testID={testID}
        style={[frame, styles.base, !isInert && shadows.sm, style]}
      >
        <LinearGradient
          colors={isInert ? [colors.disabled, colors.disabled] : stops}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: borderRadius.md }]}
        />
        {body}
      </Pressable>
    );
  }

  const surfaceStyle: ViewStyle =
    variant === 'secondary'
      ? { backgroundColor: isInert ? colors.surfaceSunken : withAlpha(solid, 0.1) }
      : variant === 'danger'
        ? {
            backgroundColor: isInert ? colors.surfaceSunken : colors.errorSoft,
            borderWidth: 1,
            borderColor: isInert ? colors.border : withAlpha(colors.error, 0.28),
          }
        : variant === 'outline'
          ? {
              backgroundColor: colors.surface,
              borderWidth: 1.5,
              borderColor: isInert ? colors.border : withAlpha(solid, 0.35),
            }
          : { backgroundColor: 'transparent' };

  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      dimOnPress={variant === 'ghost'}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert, busy: loading }}
      testID={testID}
      style={[frame, styles.base, surfaceStyle, style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
