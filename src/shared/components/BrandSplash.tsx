import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  borderRadius,
  colors,
  gradients,
  motion,
  spacing,
  typography,
  withAlpha,
} from '../theme';

/**
 * Branded launch screen, shown from first JS frame until the session restore
 * resolves.
 *
 * Named `BrandSplash` rather than `SplashScreen` to keep it distinct from
 * `expo-splash-screen`'s API, which owns the *native* splash shown before JS
 * runs. The two are meant to be seen as one: the native splash draws the same
 * mark on the same indigo, so the handoff is invisible and the only thing that
 * changes at JS mount is that the mark starts animating.
 *
 * Previously this window rendered a bare `ActivityIndicator`, which on a warm
 * start flashed for a few hundred milliseconds and read as a stutter.
 */
export interface BrandSplashProps {
  /** Flips true once bootstrap work is done and the app is safe to show. */
  ready: boolean;
  /** Called after the exit animation completes — unmount the splash here. */
  onHidden: () => void;
  /** Optional line under the title, e.g. a restore-in-progress message. */
  caption?: string;
}

/**
 * Floor on how long the splash stays up. Without it a warm start hides the
 * splash mid-entrance, which reads as a glitch rather than as a fast launch.
 */
const MIN_VISIBLE_MS = 1100;

/** Emblem size in dp. Kept in sync with `imageWidth` in app.json. */
const MARK_SIZE = 180;

export default function BrandSplash({
  ready,
  onHidden,
  caption = 'Attendance, marks and diary in one place',
}: BrandSplashProps): React.ReactElement {
  const mark = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  const [minElapsed, setMinElapsed] = useState(false);
  const hasExited = useRef(false);

  /* Entrance + idle halo. */
  useEffect(() => {
    Animated.sequence([
      Animated.spring(mark, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(text, {
        toValue: 1,
        duration: motion.duration.slow,
        easing: motion.easing.decelerate,
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1,
          duration: 3000,
          easing: motion.easing.decelerate,
          useNativeDriver: true,
        }),
        Animated.timing(halo, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();

    const timer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => {
      loop.stop();
      clearTimeout(timer);
    };
  }, [mark, text, halo]);

  const runExit = useCallback(() => {
    if (hasExited.current) return;
    hasExited.current = true;
    Animated.timing(exit, {
      toValue: 0,
      duration: motion.duration.slow,
      easing: motion.easing.accelerate,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onHidden();
    });
  }, [exit, onHidden]);

  /* Leave only once the app is ready AND the floor has elapsed. */
  useEffect(() => {
    if (ready && minElapsed) runExit();
  }, [ready, minElapsed, runExit]);

  return (
    <Animated.View style={[styles.container, { opacity: exit }]}>
      <StatusBar style="light" />
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.orbTop} pointerEvents="none" />
      <View style={styles.orbBottom} pointerEvents="none" />

      <View style={styles.center}>
        <View style={styles.markWrap}>
          {/* Expanding ring — a slow outward pulse that reads as "working"
              without a spinner competing with the mark for attention. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                transform: [
                  { scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) },
                ],
              },
            ]}
          />

          {/* The animation is driven on a wrapper View, not on `Animated.Image`.
              React Native Web's animated Image does not flush animated style
              through to the underlying <img>, so the entrance silently never
              ran there and the emblem stayed at opacity 0. Animating a
              container and keeping the image plain behaves identically on every
              platform. */}
          <Animated.View
            style={[
              styles.mark,
              {
                opacity: mark,
                transform: [
                  { scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
                ],
              },
            ]}
          >
            <Image
              source={require('../../../assets/kvs-logo.png')}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="Kendriya Vidyalaya Sangathan"
              style={styles.markImage}
            />
          </Animated.View>
        </View>

        <Animated.View
          style={{
            opacity: text,
            transform: [
              { translateY: text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            ],
          }}
        >
          <Text style={styles.title}>Teacher App</Text>
          <Text style={styles.caption}>{caption}</Text>
        </Animated.View>
      </View>

      {/* Three-dot activity strip, staggered so it reads as motion rather than
          as a blinking row. */}
      <Animated.View style={[styles.dots, { opacity: text }]} pointerEvents="none">
        {[0, 1, 2].map(i => (
          <LoadingDot key={i} index={i} />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

function LoadingDot({ index }: { index: number }) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 160),
        Animated.timing(value, {
          toValue: 1,
          duration: 480,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 480,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay((2 - index) * 160),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, index]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          transform: [
            { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDeep,
  },
  orbTop: {
    position: 'absolute',
    top: -140,
    right: -110,
    width: 340,
    height: 340,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.07),
  },
  orbBottom: {
    position: 'absolute',
    bottom: -170,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.05),
  },
  center: {
    alignItems: 'center',
  },
  markWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  halo: {
    position: 'absolute',
    // Circular, and sized to the emblem's white disc, so the pulse reads as a
    // ring leaving the badge rather than as a box around it.
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.overlayLight,
  },
  mark: {
    // 180dp, matching `imageWidth` in app.json's expo-splash-screen config, so
    // the native splash and this one draw the emblem at the same size and the
    // handoff has nothing to jump. Below roughly 160dp the emblem's Devanagari
    // lines stop resolving.
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  markImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    ...typography.display,
    color: colors.textInverse,
    textAlign: 'center',
  },
  caption: {
    ...typography.caption,
    color: withAlpha(colors.overlayLight, 0.75),
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  dots: {
    position: 'absolute',
    bottom: spacing.xxl,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.overlayLight,
  },
});
