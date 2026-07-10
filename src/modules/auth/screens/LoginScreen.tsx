import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../store';
import { loginStart, loginSuccess, loginFailure } from '../state/authSlice';
import { colors, spacing, typography, borderRadius } from '../../../shared/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useAppDispatch();
  const { isLoading, error, lockoutUntil } = useAppSelector(state => state.auth);

  const isLockedOut = lockoutUntil && Date.now() < lockoutUntil;

  const handleLogin = async () => {
    if (isLockedOut) return;
    if (!username || !password) return;

    dispatch(loginStart());
    // TODO: Replace with actual API call
    try {
      // Placeholder - will connect to real auth service
      dispatch(loginFailure('Authentication service not yet configured'));
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
        editable={!isLoading && !isLockedOut}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!isLoading && !isLockedOut}
      />

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
