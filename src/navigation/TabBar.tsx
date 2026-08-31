import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  borderRadius,
  colors,
  moduleAccent,
  motion,
  shadows,
  spacing,
  typography,
  withAlpha,
} from '../shared/theme';

/**
 * Route name → accent. Each tab carries the accent of the module it opens, so
 * the colour that lights up is the colour of the screen you arrive on rather
 * than an arbitrary per-tab hue.
 */
const TAB_ACCENT: Record<string, { solid: string; text: string }> = {
  Home: moduleAccent.home,
  StaffAttendance: moduleAccent.attendance,
  LeaveManagement: moduleAccent.leave,
  Timetable: moduleAccent.timetable,
  Profile: moduleAccent.profile,
};

/**
 * Custom bottom tab bar.
 *
 * Replaces React Navigation's default chrome, which had three problems here:
 * it ignored the bottom safe-area inset (the labels sat on the gesture bar on
 * gesture-nav Android), it used `colors.secondary` for the active tint at
 * 2.1:1 on white, and it gave no indication of the active tab beyond that
 * colour.
 *
 * The active tab now gets a tinted pill that slides and fades in behind it, so
 * position is legible without relying on colour alone (WCAG 1.4.1).
 */
export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps): React.ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          // Sit above the gesture bar / home indicator, but keep a floor so the
          // bar doesn't collapse on devices that report a zero bottom inset.
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TabItem
            key={route.key}
            label={String(label)}
            accent={TAB_ACCENT[route.name] ?? moduleAccent.home}
            renderIcon={options.tabBarIcon}
            focused={isFocused}
            onPress={onPress}
            onLongPress={onLongPress}
            testID={options.tabBarButtonTestID}
          />
        );
      })}
    </View>
  );
}

interface TabItemProps {
  label: string;
  accent: { solid: string; text: string };
  renderIcon?: BottomTabBarProps['descriptors'][string]['options']['tabBarIcon'];
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  testID?: string;
}

function TabItem({
  label,
  accent,
  renderIcon,
  focused,
  onPress,
  onLongPress,
  testID,
}: TabItemProps): React.ReactElement {
  const indicator = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(indicator, {
      toValue: focused ? 1 : 0,
      duration: motion.duration.normal,
      easing: motion.easing.emphasized,
      useNativeDriver: true,
    }).start();
  }, [focused, indicator]);

  // Each tab keeps its own hue at all times so the bar reads as five distinct
  // destinations. Selection is carried by weight rather than by colour alone:
  // the active icon goes to the full AA-safe step and gains the tinted pill,
  // while inactive icons sit at 55% of the same hue. The LABEL stays neutral
  // when inactive — an icon can be tinted freely, but a 11px label has to
  // clear 4.5:1, which the muted accents would not.
  const iconTint = focused ? accent.text : withAlpha(accent.solid, 0.55);
  const labelTint = focused ? accent.text : colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      style={styles.item}
    >
      <View style={styles.iconRow}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              backgroundColor: withAlpha(accent.solid, 0.13),
              opacity: indicator,
              transform: [
                { scaleX: indicator.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                { scaleY: indicator.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              ],
            },
          ]}
        />
        {renderIcon
          ? renderIcon({ focused, color: iconTint, size: 21 })
          : <Feather name="circle" size={21} color={iconTint} />}
      </View>

      <Text
        numberOfLines={1}
        style={[styles.label, focused ? styles.labelActive : null, { color: labelTint }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    // The bar floats over scrolling content, so it carries its own elevation
    // rather than relying on the hairline alone.
    ...Platform.select({
      ios: shadows.lg,
      default: {},
    }),
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  iconRow: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
    minWidth: 56,
  },
  indicator: {
    ...StyleSheet.absoluteFill,
    borderRadius: borderRadius.full,
  },
  label: {
    ...typography.micro,
    fontWeight: '600',
  },
  labelActive: {
    fontWeight: '700',
  },
});
