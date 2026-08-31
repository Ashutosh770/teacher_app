import React, { forwardRef, useCallback, useState } from 'react';
import {
  BlurEvent,
  FocusEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, HIT_SLOP, MIN_TOUCH_TARGET, spacing, typography } from '../theme';

/**
 * Text field with label, focus ring, error and optional affordances.
 *
 * Two concrete defects this fixes across the app:
 *  - No screen previously set `placeholderTextColor`, so placeholders rendered
 *    near-black on Android and light grey on iOS for the same field.
 *  - No field had a focus state at all — the border stayed `colors.border`
 *    whether or not the input had the caret.
 */
export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: string;
  /** Message shown under the field. Renders in the error tone when `error` is set. */
  hint?: string;
  error?: string | null;
  /** Leading Feather icon. */
  icon?: keyof typeof Feather.glyphMap;
  /** Trailing affordance — e.g. a clear or reveal button. */
  trailing?: React.ReactNode;
  /** Renders a built-in show/hide toggle and manages `secureTextEntry`. */
  secureToggle?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  /** Extra style on the `TextInput` itself — mainly for `multiline` heights. */
  inputStyle?: StyleProp<TextStyle>;
}

const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    hint,
    error,
    icon,
    trailing,
    secureToggle = false,
    containerStyle,
    inputStyle,
    editable = true,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const handleFocus = useCallback(
    (event: FocusEvent) => {
      setIsFocused(true);
      onFocus?.(event);
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (event: BlurEvent) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  const tone = error ? colors.error : colors.primary;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View
        style={[
          styles.field,
          !editable && styles.fieldDisabled,
          isFocused && { borderColor: tone, backgroundColor: colors.surface },
          // The focus ring is a wide, low-opacity outline rather than a colour
          // swap, so it reads at a glance without shifting the field's weight.
          isFocused && { shadowColor: tone, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
          !!error && { borderColor: colors.error },
        ]}
      >
        {icon ? (
          <Feather
            name={icon}
            size={18}
            color={isFocused ? tone : colors.textTertiary}
            style={styles.leadingIcon}
          />
        ) : null}

        <TextInput
          ref={ref}
          style={[styles.input, inputStyle]}
          placeholderTextColor={colors.textTertiary}
          editable={editable}
          secureTextEntry={secureToggle ? !isRevealed : rest.secureTextEntry}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          {...rest}
        />

        {secureToggle ? (
          <TouchableOpacity
            onPress={() => setIsRevealed(v => !v)}
            hitSlop={HIT_SLOP}
            style={styles.trailing}
            accessibilityRole="button"
            accessibilityLabel={isRevealed ? 'Hide password' : 'Show password'}
          >
            <Feather name={isRevealed ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          trailing ?? null
        )}
      </View>

      {error ? (
        <View style={styles.messageRow}>
          <Feather name="alert-circle" size={13} color={colors.errorText} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export default Input;

const styles = StyleSheet.create({
  label: {
    ...typography.captionBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 6,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  fieldDisabled: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  leadingIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.smd,
    // RN adds an unremovable baseline offset on Android without this.
    textAlignVertical: 'center',
  },
  trailing: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs + 2,
  },
  errorText: {
    ...typography.small,
    color: colors.errorText,
    flex: 1,
  },
  hint: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xs + 2,
  },
});
