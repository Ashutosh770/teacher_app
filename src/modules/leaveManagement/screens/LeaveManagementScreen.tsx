import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import {
  borderRadius,
  colors,
  gradients,
  moduleAccent,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Pressable,
  ProgressBar,
  ScreenHeader,
  SectionHeader,
  StatTile,
} from '../../../shared/components';
import { useAppSelector } from '../../../store';
import { LEAVE_TYPES, loadLeaveData, submitLeaveRequest } from '../services/leaveManagementService';

const ACCENT = moduleAccent.leave;

/** Each leave type keeps a distinct accent so the balance list is scannable. */
const TYPE_TONE: Record<string, { solid: string; text: string; stops: [string, string] }> = {
  CL: { solid: colors.info, text: colors.infoText, stops: gradients.info },
  EL: { solid: colors.warning, text: colors.warningText, stops: gradients.warning },
  SL: { solid: colors.success, text: colors.successText, stops: gradients.success },
  ML: { solid: colors.purple, text: moduleAccent.marks.text, stops: gradients.violet },
};

function toneFor(code: string) {
  return TYPE_TONE[code] ?? { solid: colors.primary, text: colors.primaryText, stops: gradients.brandFlat };
}

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
    void loadLeaveData();
  }, []);

  const selectedBalance = balances.find(b => b.type === leaveType);

  const handleSubmit = async () => {
    const result = await submitLeaveRequest({ leaveType, startDate, endDate, reason });
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

  const totals = useMemo(
    () =>
      balances.reduce(
        (acc, b) => ({
          available: acc.available + b.remaining,
          used: acc.used + b.used,
          total: acc.total + b.total,
        }),
        { available: 0, used: 0, total: 0 },
      ),
    [balances],
  );

  const activeBalances = balances.filter(b => b.total > 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Leave"
        subtitle="Apply and manage your leaves"
        gradientColors={ACCENT.gradient}
        right={
          <Pressable
            onPress={() => (navigation as any).navigate('LeaveStatus')}
            dimOnPress
            accessibilityRole="button"
            accessibilityLabel="View leave status"
            style={styles.statusLink}
          >
            <Text style={styles.statusLinkText}>View status</Text>
            <Feather name="chevron-right" size={16} color={colors.textInverse} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!showForm && (
            <Button
              label="Apply for leave"
              icon="plus"
              size="lg"
              tone={{ gradient: ACCENT.gradient }}
              onPress={() => {
                setShowForm(true);
                setSubmitted(false);
              }}
              style={styles.applyButton}
            />
          )}

          {submitted && !showForm && (
            <Card
              elevation="sm"
              padding="md"
              backgroundColor={colors.successSoft}
              style={styles.successBanner}
            >
              <View style={styles.bannerRow}>
                <Feather name="check-circle" size={18} color={colors.successText} />
                <Text style={styles.successBannerText}>
                  Application submitted. Check View status for updates.
                </Text>
              </View>
            </Card>
          )}

          {showForm && (
            <Card elevation="md" padding="lg" style={styles.formCard}>
              <Text style={styles.formTitle}>New leave application</Text>

              <Text style={styles.fieldLabel}>Leave type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.typeRow}
              >
                {LEAVE_TYPES.map(type => {
                  const balance = balances.find(b => b.type === type.code);
                  const disabled = balance?.total === 0;
                  const active = leaveType === type.code;
                  const tone = toneFor(type.code);

                  return (
                    <Pressable
                      key={type.code}
                      disabled={disabled}
                      onPress={() => setLeaveType(type.code)}
                      activeScale={0.95}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled }}
                      accessibilityLabel={`${type.name}${
                        balance ? `, ${balance.remaining} of ${balance.total} remaining` : ''
                      }`}
                      style={[
                        styles.typePill,
                        active && {
                          backgroundColor: withAlpha(tone.solid, 0.14),
                          borderColor: withAlpha(tone.solid, 0.5),
                        },
                        disabled && styles.typePillDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typePillCode,
                          active && { color: tone.text },
                          disabled && styles.typePillTextDisabled,
                        ]}
                      >
                        {type.code}
                      </Text>
                      {balance && balance.total > 0 ? (
                        <Text
                          style={[
                            styles.typePillCount,
                            active && { color: tone.text },
                            disabled && styles.typePillTextDisabled,
                          ]}
                        >
                          {balance.remaining}/{balance.total}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>

              {selectedBalance && selectedBalance.remaining > 0 ? (
                <Text style={styles.helperText}>
                  {selectedBalance.remaining} of {selectedBalance.total} days remaining
                </Text>
              ) : (
                <Text style={styles.helperText}>No balance remaining for this type.</Text>
              )}

              <View style={styles.dateRow}>
                <Input
                  label="From"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  icon="calendar"
                  keyboardType="numbers-and-punctuation"
                  containerStyle={styles.dateField}
                />
                <Input
                  label="To"
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  icon="calendar"
                  keyboardType="numbers-and-punctuation"
                  containerStyle={styles.dateField}
                />
              </View>

              <Input
                label="Reason"
                value={reason}
                onChangeText={setReason}
                placeholder="Why are you applying?"
                multiline
                numberOfLines={4}
                inputStyle={styles.textarea}
                containerStyle={styles.reasonField}
              />

              {formError && (
                <Card
                  elevation="none"
                  padding="sm"
                  backgroundColor={colors.errorSoft}
                  style={styles.errorBanner}
                >
                  <View style={styles.bannerRow}>
                    <Feather name="alert-circle" size={16} color={colors.errorText} />
                    <Text style={styles.errorBannerText}>{formError}</Text>
                  </View>
                </Card>
              )}

              <View style={styles.formActions}>
                <Button
                  label="Cancel"
                  variant="outline"
                  onPress={() => setShowForm(false)}
                  style={styles.formAction}
                />
                <Button
                  label="Submit"
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  tone={{ gradient: ACCENT.gradient }}
                  style={styles.formAction}
                />
              </View>
            </Card>
          )}

          <View style={styles.section}>
            <SectionHeader title="Leave balance" actionColor={ACCENT.text} />

            {activeBalances.length === 0 ? (
              <Card elevation="sm" padding="none">
                <EmptyState
                  icon="calendar"
                  tone="warning"
                  title="No leave allocated"
                  message="Your leave balances haven't been set up yet. Contact your administrator."
                  compact
                />
              </Card>
            ) : (
              <View style={styles.balanceList}>
                {activeBalances.map(balance => {
                  const tone = toneFor(balance.type);
                  const typeName = LEAVE_TYPES.find(t => t.code === balance.type)?.name ?? balance.type;
                  const fraction = balance.total > 0 ? balance.remaining / balance.total : 0;

                  return (
                    <Card key={balance.type} elevation="sm" padding="md">
                      <View style={styles.balanceHeader}>
                        <View style={[styles.balanceBadge, { backgroundColor: withAlpha(tone.solid, 0.12) }]}>
                          <Text style={[styles.balanceBadgeText, { color: tone.text }]}>
                            {balance.type}
                          </Text>
                        </View>

                        <View style={styles.balanceHeaderText}>
                          <Text style={styles.balanceName} numberOfLines={1}>
                            {typeName}
                          </Text>
                          <Text style={styles.balanceSub}>
                            {balance.used} used · {balance.remaining} available
                          </Text>
                        </View>

                        <Text style={[styles.balanceValue, { color: tone.text }]}>
                          {balance.remaining}
                          <Text style={styles.balanceValueTotal}>/{balance.total}</Text>
                        </Text>
                      </View>

                      <ProgressBar
                        progress={fraction}
                        colors={tone.stops}
                        height={7}
                        label={`${typeName} remaining`}
                      />
                    </Card>
                  );
                })}
              </View>
            )}
          </View>

          <Card elevation="sm" padding="md">
            <Text style={styles.statsTitle}>THIS YEAR</Text>
            <View style={styles.statsRow}>
              <StatTile value={totals.available} label="Available" tone={colors.successText} />
              <View style={styles.statsDivider} />
              <StatTile value={totals.used} label="Used" tone={colors.warningText} />
              <View style={styles.statsDivider} />
              <StatTile value={totals.total} label="Total" tone={colors.text} />
            </View>
          </Card>
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
  statusLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  statusLinkText: {
    ...typography.captionBold,
    color: colors.textInverse,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  applyButton: {
    marginBottom: spacing.lg,
  },

  /* Banners */
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  successBanner: {
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.success, 0.25),
  },
  successBannerText: {
    ...typography.caption,
    color: colors.successText,
    flex: 1,
  },
  errorBanner: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.error, 0.25),
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.errorText,
    flex: 1,
  },

  /* Form */
  formCard: {
    marginBottom: spacing.lg,
  },
  formTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...typography.captionBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  typeRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  typePill: {
    minWidth: 64,
    alignItems: 'center',
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typePillDisabled: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  typePillCode: {
    ...typography.captionBold,
    color: colors.text,
  },
  typePillCount: {
    ...typography.micro,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  typePillTextDisabled: {
    color: colors.disabledText,
  },
  helperText: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.smd,
  },
  dateField: {
    flex: 1,
    marginBottom: spacing.md,
  },
  reasonField: {
    marginBottom: spacing.md,
  },
  textarea: {
    minHeight: 92,
    textAlignVertical: 'top',
    paddingTop: spacing.smd,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.smd,
  },
  formAction: {
    flex: 1,
  },

  /* Balances */
  section: {
    marginBottom: spacing.lg,
  },
  balanceList: {
    gap: spacing.smd,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    marginBottom: spacing.smd,
  },
  balanceBadge: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceBadgeText: {
    ...typography.captionBold,
  },
  balanceHeaderText: {
    flex: 1,
  },
  balanceName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  balanceSub: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  balanceValue: {
    ...typography.h3,
  },
  balanceValueTotal: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* Totals */
  statsTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.smd,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
});
