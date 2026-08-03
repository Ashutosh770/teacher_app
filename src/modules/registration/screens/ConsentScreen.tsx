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
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, spacing, withAlpha } from '../../../shared/theme';
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          // Real insets, not a fixed guess: this screen renders with
          // `headerShown: false`, so without them the draft banner sits under
          // the status bar and the agree button under the gesture/nav bar —
          // and the agree button is the one control the screen exists for.
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      {notice.isDraft && (
        <View style={styles.draftBanner}>
          <Text style={styles.draftText}>
            DRAFT NOTICE — placeholder wording, not for collecting real consent.
          </Text>
        </View>
      )}

      <Text style={styles.title}>{notice.title}</Text>
      <Text style={styles.body}>{notice.body}</Text>

      <View style={styles.purposes}>
        {required.map(p => (
          <View key={p.key} style={styles.purposeRow}>
            <View style={[styles.checkbox, styles.checkboxLocked]}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <View style={styles.purposeText}>
              <Text style={styles.purposeLabel}>{p.label}</Text>
              <Text style={styles.purposeDescription}>{p.description}</Text>
            </View>
          </View>
        ))}

        {optionalPurposes.map(p => (
          <Pressable
            key={p.key}
            style={styles.purposeRow}
            onPress={() => setOptional(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: Boolean(optional[p.key]) }}
          >
            <View style={[styles.checkbox, optional[p.key] && styles.checkboxOn]}>
              {optional[p.key] && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <View style={styles.purposeText}>
              <Text style={styles.purposeLabel}>{p.label}</Text>
              <Text style={styles.purposeDescription}>{p.description}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.agree, submitting && styles.agreeDisabled]}
        onPress={onAgree}
        disabled={submitting}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.agreeText}>I agree — continue</Text>
        )}
      </Pressable>

      <Text style={styles.footnote}>
        You can withdraw this at any time. If you do not agree, your attendance will be
        marked manually instead.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  // Horizontal padding only — vertical padding comes from the safe-area insets
  // applied inline, so it adapts to the device rather than guessing.
  content: { paddingHorizontal: spacing.lg },
  draftBanner: {
    backgroundColor: withAlpha(colors.warning, 0.15),
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  draftText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: spacing.md, color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginBottom: spacing.xl },
  purposes: { marginBottom: spacing.xl },
  purposeRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Required purposes are shown ticked and non-interactive: enrollment is
  // impossible without them, so an unticked state would be a dead end.
  checkboxLocked: { backgroundColor: colors.disabled, borderColor: colors.disabled },
  checkMark: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  purposeText: { flex: 1 },
  purposeLabel: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
  purposeDescription: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  agree: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  agreeDisabled: { opacity: 0.6 },
  agreeText: { color: colors.surface, fontSize: 16, fontWeight: '600' },
  footnote: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 17,
  },
});
