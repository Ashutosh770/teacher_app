import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { GradientHeader, ProgressBar } from '../../../shared/components';
import { useAppSelector } from '../../../store';
import { LEAVE_TYPES, loadLeaveData, submitLeaveRequest } from '../services/leaveManagementService';

const TYPE_COLOR: Record<string, string> = {
  CL: colors.secondary,
  EL: colors.accent,
  SL: colors.blue,
  ML: colors.purple,
};

export default function LeaveManagementScreen() {
  const navigation = useNavigation();
  const balances = useAppSelector(s => s.leaveManagement.balances);
  const isSubmitting = useAppSelector(s => s.leaveManagement.isSubmitting);

  const [showForm, setShowForm] = useState(false);
  const [leaveType, setLeaveType] = useState('CL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadLeaveData();
  }, []);

  const selectedBalance = balances.find(b => b.type === leaveType);

  const handleSubmit = () => {
    const result = submitLeaveRequest({ leaveType, startDate, endDate, reason });
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setFormError(null);
    setStartDate('');
    setEndDate('');
    setReason('');
    setShowForm(false);
    setSubmitted(true);
  };

  const totals = balances.reduce(
    (acc, b) => ({ available: acc.available + b.remaining, used: acc.used + b.used, total: acc.total + b.total }),
    { available: 0, used: 0, total: 0 }
  );

  return (
    <View style={styles.screen}>
      <GradientHeader
        title="Leave"
        subtitle="Apply and manage your leaves"
        right={
          <TouchableOpacity
            onPress={() => (navigation as any).navigate('LeaveStatus')}
            accessibilityRole="button"
          >
            <Text style={styles.viewStatusLink}>View Status</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.applyButton}
          onPress={() => {
            setShowForm(v => !v);
            setSubmitted(false);
          }}
          accessibilityRole="button"
        >
          <Feather name="plus" size={20} color={colors.surface} />
          <Text style={styles.applyButtonText}>Apply for Leave</Text>
        </TouchableOpacity>

        {submitted && !showForm && (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={18} color={colors.secondaryDark} />
            <Text style={styles.successBannerText}>
              Application submitted. Check View Status for updates.
            </Text>
          </View>
        )}

        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Leave Application</Text>

            <Text style={styles.label}>Leave Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
              {LEAVE_TYPES.map(type => {
                const balance = balances.find(b => b.type === type.code);
                const disabled = balance?.total === 0;
                const active = leaveType === type.code;
                const color = TYPE_COLOR[type.code] ?? colors.primary;
                return (
                  <TouchableOpacity
                    key={type.code}
                    disabled={disabled}
                    onPress={() => setLeaveType(type.code)}
                    style={[
                      styles.typePill,
                      active && { backgroundColor: color },
                      disabled && styles.typePillDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.typePillText,
                        active && styles.typePillTextActive,
                        disabled && styles.typePillTextDisabled,
                      ]}
                    >
                      {type.code}
                      {balance && balance.remaining > 0 ? ` (${balance.remaining}/${balance.total})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {selectedBalance && selectedBalance.remaining > 0 && (
              <Text style={styles.helperText}>
                {selectedBalance.remaining} of {selectedBalance.total} days remaining
              </Text>
            )}

            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.label}>From Date</Text>
                <TextInput
                  style={styles.input}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.label}>To Date</Text>
                <TextInput
                  style={styles.input}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            <Text style={styles.label}>Reason</Text>
            <TextInput
              style={styles.textarea}
              value={reason}
              onChangeText={setReason}
              placeholder="Enter reason for leave..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
            />

            {formError && (
              <View style={styles.errorBanner}>
                <Feather name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            )}

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting}
                accessibilityRole="button"
              >
                <Text style={styles.submitButtonText}>Submit Application</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowForm(false)}
                accessibilityRole="button"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Leave Balance</Text>
        <View style={styles.balanceList}>
          {balances
            .filter(b => b.total > 0)
            .map(balance => {
              const color = TYPE_COLOR[balance.type] ?? colors.primary;
              const typeName = LEAVE_TYPES.find(t => t.code === balance.type)?.name ?? balance.type;
              return (
                <View key={balance.type} style={styles.balanceCard}>
                  <View style={styles.balanceHeader}>
                    <View style={styles.balanceHeaderText}>
                      <Text style={styles.balanceName}>{typeName}</Text>
                      <Text style={styles.balanceSub}>
                        Used: {balance.used} | Available: {balance.remaining}
                      </Text>
                    </View>
                    <Text style={styles.balanceValue}>
                      {balance.remaining}
                      <Text style={styles.balanceValueTotal}>/{balance.total}</Text>
                    </Text>
                  </View>
                  <ProgressBar
                    progress={balance.total > 0 ? balance.remaining / balance.total : 0}
                    color={color}
                  />
                </View>
              );
            })}
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>This Year</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.secondary }]}>{totals.available}</Text>
              <Text style={styles.statLabel}>Available</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{totals.used}</Text>
              <Text style={styles.statLabel}>Used</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{totals.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  viewStatusLink: {
    ...typography.caption,
    color: colors.secondary,
    fontWeight: '700',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  applyButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md + spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  applyButtonText: {
    ...typography.bodyBold,
    color: colors.surface,
    fontSize: 17,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: withAlpha(colors.secondary, 0.1),
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  successBannerText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  formTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  typeRow: {
    flexGrow: 0,
    marginBottom: spacing.xs,
  },
  typePill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    marginRight: spacing.sm,
  },
  typePillDisabled: {
    backgroundColor: colors.border,
  },
  typePillText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
  },
  typePillTextActive: {
    color: colors.surface,
  },
  typePillTextDisabled: {
    color: colors.disabled,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  dateField: {
    flex: 1,
  },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  textarea: {
    ...typography.body,
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: withAlpha(colors.error, 0.1),
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
    fontWeight: '600',
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  submitButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...typography.bodyBold,
    color: colors.surface,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  balanceList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  balanceHeaderText: {
    flex: 1,
  },
  balanceName: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  balanceSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  balanceValue: {
    ...typography.h2,
    color: colors.text,
  },
  balanceValueTotal: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statsTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
