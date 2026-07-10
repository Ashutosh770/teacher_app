import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../../shared/theme';

export default function StudentMarksScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Student Marks</Text>
      <Text style={styles.subtitle}>Record and manage student marks</Text>
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
