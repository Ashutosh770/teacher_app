import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { borderRadius, colors } from '../theme';

/**
 * Animated horizontal progress bar matching Figma's rounded progress tracks
 * (leave balances, timetable/marks stats, roster completion). `progress` is a
 * 0-1 fraction; the fill animates to the new width on change.
 */
export interface ProgressBarProps {
  /** 0-1 fraction complete. */
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export default function ProgressBar({
  progress,
  color = colors.secondary,
  trackColor = colors.border,
  height = 8,
  style,
}: ProgressBarProps): React.ReactElement {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: clamped,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [clamped, widthAnim]);

  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }, style]}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            height,
            borderRadius: height / 2,
            width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: borderRadius.full,
  },
  fill: {
    borderRadius: borderRadius.full,
  },
});
