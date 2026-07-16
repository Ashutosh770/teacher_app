import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../../store';
import { loginStart, loginSuccess, loginFailure } from '../state/authSlice';
import { login } from '../services/authService';
import { colors, spacing, typography, borderRadius } from '../../../shared/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useAppDispatch();
  const { isLoading, error, lockoutUntil } = useAppSelector(state => state.auth);

  const isLockedOut = lockoutUntil && Date.now() < lockoutUntil;

  const handleLogin = async () => {
    if (isLockedOut) return;
    if (!username || !password) return;

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Teacher App</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      {error && <Text style={styles.error}>{error}</Text>}
      {isLockedOut && (
        <Text style={styles.error}>Account temporarily locked. Try again in 60 seconds.</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading && !isLockedOut}
      />

      <View style={styles.passwordWrap}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          editable={!isLoading && !isLockedOut}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword(v => !v)}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        >
          <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, (isLoading || isLockedOut) ? styles.buttonDisabled : undefined]}
        onPress={handleLogin}
        disabled={isLoading || !!isLockedOut}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: 16,
    color: '#000000',
  },
  passwordWrap: {
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  passwordInput: {
    paddingRight: spacing.xl + spacing.md,
    marginBottom: 0,
  },
  eyeButton: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    color: '#fff',
    ...typography.body,
    fontWeight: '600',
  },
  error: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
