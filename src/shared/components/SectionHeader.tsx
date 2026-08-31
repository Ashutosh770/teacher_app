import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Pressable from './Pressable';
import { colors, HIT_SLOP, spacing, typography } from '../theme';

/**
 * Section title with an optional trailing action.
 *
 * The "View All" link previously used `colors.secondary` (#2ECC71) at 2.1:1 on
 * white. The action here defaults to `colors.primaryText`, which is measured at
 * 6.3:1, and callers pass a module accent's `.text` step rather than its fill.
 */
export interface SectionHeaderProps {
  title: string;
  /** Small muted line under the title. */
  caption?: string;
  /** Uppercase eyebrow above the title — use for grouped settings lists. */
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Colour for the action label. Must be a `*Text` token, not a fill. */
  actionColor?: string;
  style?: StyleProp<ViewStyle>;
}

export default function SectionHeader({
  title,
  caption,
  eyebrow,
  actionLabel,
  onAction,
  actionColor = colors.primaryText,
  style,
}: SectionHeaderProps): React.ReactElement {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.textCol}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          dimOnPress
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.action}
        >
          <Text style={[styles.actionLabel, { color: actionColor }]}>{actionLabel}</Text>
          <Feather name="chevron-right" size={16} color={actionColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.smd,
    gap: spacing.md,
  },
  textCol: {
    flex: 1,
  },
  eyebrow: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  caption: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
  },
  actionLabel: {
    ...typography.captionBold,
  },
});
