import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, moduleAccent, shadows, spacing, typography } from '../../../shared/theme';
import { Button, IconChip, Input } from '../../../shared/components';
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
export default function AddStudentModal({ visible, onClose, onAdded }: AddStudentModalProps) {
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping the scrim dismisses. Previously the only way out was the
          Cancel button, which is not what a scrim implies. */}
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Dismiss">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centerer}
        >
          {/* Swallow presses inside the sheet so they don't reach the scrim. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <IconChip icon="user-plus" color={moduleAccent.students.solid} size={44} />
              <View style={styles.headerText}>
                <Text style={styles.title}>Add student</Text>
                <Text style={styles.subtitle}>The scan session stays running.</Text>
              </View>
            </View>

            <Input
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Student name"
              icon="user"
              autoCapitalize="words"
              returnKeyType="next"
              containerStyle={styles.field}
            />

            <Input
              label="Roll number"
              value={rollNo}
              onChangeText={setRollNo}
              placeholder="e.g. 24"
              icon="hash"
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              error={error}
              containerStyle={styles.field}
            />

            <View style={styles.actions}>
              <Button label="Cancel" variant="outline" onPress={onClose} style={styles.action} />
              <Button
                label="Add"
                icon="plus"
                onPress={handleSubmit}
                tone={{ gradient: moduleAccent.students.gradient }}
                style={styles.action}
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  centerer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    marginBottom: spacing.lg,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  subtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  field: {
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.smd,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
