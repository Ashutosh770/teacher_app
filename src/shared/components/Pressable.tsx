import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Pressable as RNPressable,
  PressableProps as RNPressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { motion } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * `Pressable` with a spring scale-down on hold.
 *
 * Before the redesign every touchable in the app was a bare `TouchableOpacity`,
 * so the only press feedback anywhere was RN's default opacity dip — which is
 * nearly invisible on the large white cards this app is built from. Scaling
 * reads clearly at any card size and on any background.
 *
 * Uses the native driver, so the animation runs off the JS thread and stays
 * smooth while a list is scrolling or a face match is running.
 */
export interface PressableScaleProps extends Omit<RNPressableProps, 'style'> {
  children?: React.ReactNode;
  /** Scale to settle at while held. Defaults to `motion.pressScale` (0.97). */
  activeScale?: number;
  /** Additionally dim while held — useful for flat rows with no shadow. */
  dimOnPress?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Pressable({
  children,
  activeScale = motion.pressScale,
  dimOnPress = false,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps): React.ReactElement {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (toScale: number, toOpacity: number, duration: number) => {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: toScale,
          duration,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: toOpacity,
          duration,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [opacity, scale],
  );

  const handlePressIn = useCallback<NonNullable<RNPressableProps['onPressIn']>>(
    event => {
      animateTo(activeScale, dimOnPress ? 0.75 : 1, motion.duration.instant);
      onPressIn?.(event);
    },
    [activeScale, animateTo, dimOnPress, onPressIn],
  );

  const handlePressOut = useCallback<NonNullable<RNPressableProps['onPressOut']>>(
    event => {
      animateTo(1, 1, motion.duration.fast);
      onPressOut?.(event);
    },
    [animateTo, onPressOut],
  );

  return (
    // Animated *Pressable*, not a Pressable wrapping an Animated.View. With a
    // wrapper, `style` lands on the inner node while the outer Pressable is the
    // one that participates in the parent's flex layout — so `flex: 1`,
    // `flexBasis`, `maxWidth` and `alignSelf` were all being applied to a node
    // that had already been sized to its content. One node keeps layout and
    // transform on the same box.
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      style={[style, { transform: [{ scale }], opacity }]}
    >
      {children}
    </AnimatedPressable>
  );
}
