import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../../store';
import { loginStart, loginSuccess, loginFailure } from '../state/authSlice';
import { login } from '../services/authService';
import { Button, Card, Input } from '../../../shared/components';
import {
  borderRadius,
  colors,
  gradients,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { isLoading, error, lockoutUntil } = useAppSelector(state => state.auth);

  const isLockedOut = !!lockoutUntil && Date.now() < lockoutUntil;
  const canSubmit = username.length > 0 && password.length > 0 && !isLoading && !isLockedOut;

  const handleLogin = async () => {
    if (!canSubmit) return;

    dispatch(loginStart());
    try {
      const response = await login(username, password);
      if (response.success && response.data) {
        dispatch(loginSuccess(response.data));
      } else {
        dispatch(loginFailure(response.error ?? 'Authentication failed'));
      }
    } catch (err) {
      dispatch(loginFailure('Authentication failed'));
    }
  };

  const banner = isLockedOut
    ? 'Account temporarily locked. Try again in 60 seconds.'
    : error;

  return (
    <View style={styles.screen}>
      {/* The brand gradient fills the top third rather than the whole screen,
          so the form sits on a light surface where the inputs read cleanly. */}
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backdrop}
      >
        <View style={styles.orbTop} pointerEvents="none" />
        <View style={styles.orbBottom} pointerEvents="none" />
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <Image
              source={require('../../../../assets/kvs-logo.png')}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="Kendriya Vidyalaya Sangathan"
              style={styles.logo}
            />
            <Text style={styles.title}>Teacher App</Text>
            <Text style={styles.subtitle}>Attendance, marks and diary in one place</Text>
          </View>

          <Card elevation="lg" padding="lg" style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.cardCaption}>Use the credentials issued by your school</Text>

            {banner ? (
              <View style={styles.banner} accessibilityLiveRegion="polite" accessibilityRole="alert">
                <Feather name="alert-circle" size={16} color={colors.errorText} />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <Input
              label="Username"
              placeholder="e.g. r.sharma"
              icon="user"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              editable={!isLoading && !isLockedOut}
              containerStyle={styles.field}
            />

            <Input
              label="Password"
              placeholder="Enter your password"
              icon="lock"
              value={password}
              onChangeText={setPassword}
              secureToggle
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              editable={!isLoading && !isLockedOut}
              containerStyle={styles.field}
            />

            <Button
              label={isLockedOut ? 'Locked' : 'Sign in'}
              iconRight={canSubmit ? 'arrow-right' : undefined}
              onPress={handleLogin}
              loading={isLoading}
              disabled={!canSubmit}
              size="lg"
              style={styles.submit}
            />
          </Card>

          <Text style={styles.footer}>Contact your administrator if you can&apos;t sign in.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
    overflow: 'hidden',
  },
  orbTop: {
    position: 'absolute',
    top: -100,
    right: -70,
    width: 260,
    height: 260,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.08),
  },
  orbBottom: {
    position: 'absolute',
    bottom: -60,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.overlayLight, 0.06),
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    // Larger than the 68pt glass tile it replaced: the emblem carries two lines
    // of Devanagari that stop resolving much below this size.
    width: 104,
    height: 104,
    marginBottom: spacing.smd,
  },
  title: {
    ...typography.h1,
    color: colors.textInverse,
  },
  subtitle: {
    ...typography.caption,
    color: withAlpha(colors.overlayLight, 0.78),
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  card: {
    borderRadius: borderRadius.xl,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.text,
  },
  cardCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
    marginBottom: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.errorSoft,
    borderWidth: 1,
    borderColor: withAlpha(colors.error, 0.25),
    borderRadius: borderRadius.md,
    padding: spacing.smd,
    marginBottom: spacing.md,
  },
  bannerText: {
    ...typography.caption,
    color: colors.errorText,
    flex: 1,
  },
  field: {
    marginBottom: spacing.md,
  },
  submit: {
    marginTop: spacing.sm,
  },
  footer: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
