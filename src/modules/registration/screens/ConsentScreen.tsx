/**
 * Biometric consent — shown after login to any user who has not yet consented,
 * before the camera is ever opened.
 *
 * Two deliberate behaviours:
 *
 *  - The optional purpose defaults to OFF. Photo retention is a separate
 *    decision and pre-ticking it would collect consent the person never
 *    actively gave.
 *  - A draft notice is labelled as such on screen. Placeholder wording must
 *    never be presented as if it were a real consent form; the banner is what
 *    stops a test build being mistaken for a live one.
 *
 * There is no "skip" affordance. Declining is legitimate and supported, but it
 * is done by not consenting and continuing to have attendance marked manually —
 * which is an administrative path, not a button here.
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  borderRadius,
  colors,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import { Button, Card, IconChip, Pressable } from '../../../shared/components';
import { useAppDispatch } from '../../../store';
import { grantConsent, type ConsentNotice } from '../../../shared/services/registration';
import { loadRegistrationStatus, setNextStep } from '../state/registrationSlice';

interface Props {
  notice: ConsentNotice;
}

export default function ConsentScreen({ notice }: Props) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const [optional, setOptional] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const required = notice.purposes.filter(p => p.required);
  const optionalPurposes = notice.purposes.filter(p => !p.required);

  async function onAgree() {
    setSubmitting(true);
    const purposes = [
      ...required.map(p => p.key),
      ...optionalPurposes.filter(p => optional[p.key]).map(p => p.key),
    ];

    const response = await grantConsent(purposes, notice.version);
    setSubmitting(false);

    if (!response.success) {
      // A 409 here means the notice changed while this screen was open. Re-fetch
      // rather than retrying, so the person agrees to the wording now in force
      // instead of the stale text still on their screen.
      Alert.alert('Could not save consent', response.error ?? 'Please try again.');
      dispatch(loadRegistrationStatus());
      return;
    }

    dispatch(setNextStep('capture'));
    dispatch(loadRegistrationStatus());
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            // Real insets, not a fixed guess: this screen renders with
            // `headerShown: false`, so without them the draft banner sits under
            // the status bar and the agree button under the gesture/nav bar —
            // and the agree button is the one control the screen exists for.
            paddingTop: insets.top + spacing.lg,
            paddingBottom: spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {notice.isDraft && (
          <Card
            elevation="none"
            padding="md"
            backgroundColor={withAlpha(colors.warning, 0.1)}
            style={styles.draftBanner}
          >
            <View style={styles.draftRow}>
              <Feather name="alert-triangle" size={18} color={colors.warningText} />
              <Text style={styles.draftText}>
                DRAFT NOTICE — placeholder wording, not for collecting real consent.
              </Text>
            </View>
          </Card>
        )}

        <IconChip icon="shield" color={colors.primary} size={64} style={styles.heroIcon} />

        <Text style={styles.title}>{notice.title}</Text>
        <Text style={styles.body}>{notice.body}</Text>

        <View style={styles.purposes}>
          {required.length > 0 && (
            <Text style={styles.groupLabel}>REQUIRED</Text>
          )}
          {required.map(p => (
            <View key={p.key} style={[styles.purposeRow, styles.purposeRowLocked]}>
              <View style={[styles.checkbox, styles.checkboxLocked]}>
                <Feather name="check" size={14} color={colors.textInverse} />
              </View>
              <View style={styles.purposeText}>
                <Text style={styles.purposeLabel}>{p.label}</Text>
                <Text style={styles.purposeDescription}>{p.description}</Text>
              </View>
              <Feather name="lock" size={13} color={colors.textTertiary} />
            </View>
          ))}

          {optionalPurposes.length > 0 && (
            <Text style={[styles.groupLabel, styles.groupLabelSpaced]}>OPTIONAL</Text>
          )}
          {optionalPurposes.map(p => {
            const checked = Boolean(optional[p.key]);
            return (
              <Pressable
                key={p.key}
                onPress={() => setOptional(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
                activeScale={0.99}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={`${p.label}. ${p.description}`}
                style={[styles.purposeRow, checked && styles.purposeRowChecked]}
              >
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                  {checked && <Feather name="check" size={14} color={colors.textInverse} />}
                </View>
                <View style={styles.purposeText}>
                  <Text style={styles.purposeLabel}>{p.label}</Text>
                  <Text style={styles.purposeDescription}>{p.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* The agree control is pinned rather than scrolled: on a long notice it
          was previously below the fold with nothing indicating it was there. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.smd }]}>
        <Button
          label="I agree — continue"
          iconRight="arrow-right"
          size="lg"
          loading={submitting}
          disabled={submitting}
          onPress={onAgree}
        />
        <Text style={styles.footnote}>
          You can withdraw this at any time. If you do not agree, your attendance will be marked
          manually instead.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  // Horizontal padding only — vertical padding comes from the safe-area insets
  // applied inline, so it adapts to the device rather than guessing.
  content: {
    paddingHorizontal: spacing.lg,
  },

  draftBanner: {
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.4),
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  draftText: {
    ...typography.small,
    fontWeight: '700',
    color: colors.warningText,
    flex: 1,
  },

  heroIcon: {
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.smd,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },

  purposes: {
    marginBottom: spacing.lg,
  },
  groupLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  groupLabelSpaced: {
    marginTop: spacing.lg,
  },
  purposeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.smd,
    padding: spacing.smd,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  purposeRowLocked: {
    backgroundColor: colors.background,
  },
  purposeRowChecked: {
    borderColor: withAlpha(colors.primary, 0.45),
    backgroundColor: withAlpha(colors.primary, 0.05),
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.xs,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  // Required purposes are shown ticked and non-interactive: enrollment is
  // impossible without them, so an unticked state would be a dead end.
  checkboxLocked: {
    backgroundColor: colors.disabled,
    borderColor: colors.disabled,
  },
  purposeText: {
    flex: 1,
  },
  purposeLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xxs,
  },
  purposeDescription: {
    ...typography.small,
    color: colors.textSecondary,
  },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.smd,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.smd,
  },
  footnote: {
    ...typography.micro,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
