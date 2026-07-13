import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { borderRadius, colors, spacing, typography } from '../../../shared/theme';
import { addStudent } from '../services/studentAttendanceService';

export interface AddStudentModalProps {
  visible: boolean;
  /** Close the modal (cancel or after a successful add). */
  onClose: () => void;
  /** Notified with the new student's name after a successful add (optional). */
  onAdded?: (name: string) => void;
}

/**
 * Mid-session onboarding modal (Req 13.1).
 *
 * Collects a name and roll number and delegates validation + insertion to
 * `studentAttendanceService.addStudent`, which enforces the name/roll-number
 * bounds and roll-number uniqueness and inserts a `pending` / `not_enrolled`
 * entry in roll-number order without ending the scan session. On a validation
 * failure the specific error from the service is surfaced inline and the
 * roster is left untouched; on success the fields reset and the modal closes.
 */
export default function AddStudentModal({
  visible,
  onClose,
  onAdded,
}: AddStudentModalProps) {
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset transient form state whenever the modal is (re)opened.
  useEffect(() => {
    if (visible) {
      setName('');
      setRollNo('');
      setError(null);
    }
  }, [visible]);

  const handleSubmit = useCallback(() => {
    const result = addStudent({ name, rollNo });
    if (result.ok) {
      onAdded?.(result.student.name);
      onClose();
      return;
    }
    setError(result.error);
  }, [name, rollNo, onAdded, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Add Student</Text>
          <Text style={styles.subtitle}>
            Add a student to the roster without ending the scan session.
          </Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Student name"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.label}>Roll Number</Text>
          <TextInput
            style={styles.input}
            value={rollNo}
            onChangeText={setRollNo}
            placeholder="Roll number"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleSubmit}
              accessibilityRole="button"
            >
              <Text style={styles.buttonPrimaryText}>Add Student</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginLeft: spacing.sm,
  },
  buttonSecondary: {
    backgroundColor: colors.border,
  },
  buttonSecondaryText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonPrimaryText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '600',
  },
});
