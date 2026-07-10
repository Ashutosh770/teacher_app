import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../../shared/theme';

export default function AdminDashboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Dashboard</Text>
      <Text style={styles.subtitle}>School operations overview</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
