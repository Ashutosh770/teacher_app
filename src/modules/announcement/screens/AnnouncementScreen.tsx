import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  borderRadius,
  colors,
  moduleAccent,
  spacing,
  typography,
  withAlpha,
} from '../../../shared/theme';
import {
  Card,
  EmptyState,
  IconChip,
  Pressable,
  ScreenHeader,
  SkeletonList,
  StatusPill,
} from '../../../shared/components';
import type { StatusPillTone } from '../../../shared/components';
import { useAppDispatch, useAppSelector } from '../../../store';
import { markAsRead, setFilter } from '../state/announcementSlice';
import { loadAnnouncements } from '../services/announcementService';
import type { Announcement } from '../../../shared/types';

const ACCENT = moduleAccent.announcements;

type Priority = Announcement['priority'];

/**
 * Priority drives icon, tint and ordering. Urgent and High are visually
 * distinct from the routine two so a notice that matters is findable in a long
 * list without reading every title.
 */
const PRIORITY: Record<Priority, { tone: StatusPillTone; color: string; icon: keyof typeof Feather.glyphMap; rank: number }> = {
  Urgent: { tone: 'error', color: colors.error, icon: 'alert-octagon', rank: 0 },
  High: { tone: 'warning', color: colors.warning, icon: 'alert-triangle', rank: 1 },
  Normal: { tone: 'info', color: colors.info, icon: 'info', rank: 2 },
  Low: { tone: 'neutral', color: colors.textSecondary, icon: 'message-square', rank: 3 },
};

const READ_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
] as const;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function AnnouncementScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { announcements, filter, isLoading, error } = useAppSelector(s => s.announcement);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAnnouncements();
    setIsRefreshing(false);
  }, []);

  const unreadCount = useMemo(
    () => announcements.filter(a => !a.isRead).length,
    [announcements],
  );

  const visible = useMemo(() => {
    return announcements
      .filter(a => {
        if (filter.readStatus === 'unread' && a.isRead) return false;
        if (filter.readStatus === 'read' && !a.isRead) return false;
        if (filter.priority && a.priority !== filter.priority) return false;
        return true;
      })
      // Urgent first, then most recent — an urgent notice from this morning
      // should outrank a routine one from a minute ago.
      .sort((a, b) => {
        const rank = PRIORITY[a.priority].rank - PRIORITY[b.priority].rank;
        if (rank !== 0) return rank;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [announcements, filter]);

  const handleOpen = useCallback(
    (announcement: Announcement) => {
      setExpandedId(current => (current === announcement.id ? null : announcement.id));
      if (!announcement.isRead) {
        dispatch(markAsRead(announcement.id));
      }
    },
    [dispatch],
  );

  const isInitialLoad = isLoading && announcements.length === 0;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Announcements"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread notice${unreadCount === 1 ? '' : 's'}`
            : 'Notices for staff and students'
        }
        gradientColors={ACCENT.gradient}
        onBack={() => navigation.goBack()}
      />

      {/* Filters sit on their own surface bar rather than inside the scroll,
          so they stay reachable while reading a long list. */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {READ_FILTERS.map(option => (
            <FilterChip
              key={option.key}
              label={option.label}
              count={option.key === 'unread' ? unreadCount : undefined}
              active={filter.readStatus === option.key}
              onPress={() => dispatch(setFilter({ readStatus: option.key }))}
            />
          ))}

          <View style={styles.filterDivider} />

          {(Object.keys(PRIORITY) as Priority[]).map(priority => (
            <FilterChip
              key={priority}
              label={priority}
              tint={PRIORITY[priority].color}
              active={filter.priority === priority}
              onPress={() =>
                dispatch(setFilter({ priority: filter.priority === priority ? null : priority }))
              }
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {error ? (
          <Card elevation="sm" padding="md" backgroundColor={colors.errorSoft} style={styles.errorCard}>
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={18} color={colors.errorText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </Card>
        ) : null}

        {isInitialLoad ? (
          <SkeletonList count={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={announcements.length === 0 ? 'bell-off' : 'filter'}
            tone="info"
            title={announcements.length === 0 ? 'No announcements' : 'Nothing matches'}
            message={
              announcements.length === 0
                ? 'Notices from your school will appear here as they are posted.'
                : 'No announcements match the filters you have applied.'
            }
            actionLabel={announcements.length === 0 ? undefined : 'Clear filters'}
            onAction={
              announcements.length === 0
                ? undefined
                : () => dispatch(setFilter({ readStatus: 'all', priority: null }))
            }
          />
        ) : (
          <View style={styles.cards}>
            {visible.map(announcement => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                expanded={expandedId === announcement.id}
                onPress={() => handleOpen(announcement)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function FilterChip({
  label,
  count,
  tint = colors.primary,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  tint?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      activeScale={0.94}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      style={[
        styles.chip,
        active && { backgroundColor: withAlpha(tint, 0.13), borderColor: withAlpha(tint, 0.45) },
      ]}
    >
      <Text style={[styles.chipText, active && { color: tint === colors.primary ? colors.primaryText : tint }]}>
        {label}
      </Text>
      {count !== undefined && count > 0 ? (
        <View style={[styles.chipCount, { backgroundColor: active ? withAlpha(tint, 0.2) : colors.border }]}>
          <Text style={styles.chipCountText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function AnnouncementCard({
  announcement,
  expanded,
  onPress,
}: {
  announcement: Announcement;
  expanded: boolean;
  onPress: () => void;
}) {
  const meta = PRIORITY[announcement.priority];
  const isUnread = !announcement.isRead;

  return (
    <Card
      elevation={isUnread ? 'sm' : 'xs'}
      padding="md"
      bordered={!isUnread}
      onPress={onPress}
      accessibilityLabel={`${announcement.priority} priority. ${announcement.title}. ${
        isUnread ? 'Unread' : 'Read'
      }`}
      accessibilityHint={expanded ? 'Collapses the notice' : 'Expands the full notice'}
      style={isUnread ? styles.cardUnread : undefined}
    >
      {/* Unread notices carry an accent rail; read ones drop it, so the list
          shows what's new without relying on font weight alone. */}
      {isUnread && <View style={[styles.unreadRail, { backgroundColor: meta.color }]} />}

      <View style={styles.cardRow}>
        <IconChip icon={meta.icon} color={meta.color} size={40} />

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, isUnread && styles.cardTitleUnread]} numberOfLines={2}>
              {announcement.title}
            </Text>
            {isUnread && <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />}
          </View>

          <Text style={styles.cardText} numberOfLines={expanded ? undefined : 2}>
            {announcement.body}
          </Text>

          <View style={styles.cardFooter}>
            <StatusPill label={announcement.priority} tone={meta.tone} />
            {announcement.targetAudience && announcement.targetAudience !== 'all' ? (
              <StatusPill label={announcement.targetAudience} tone="neutral" />
            ) : null}
            <View style={styles.footerSpacer} />
            <Text style={styles.cardWhen}>{formatWhen(announcement.createdAt)}</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Filters */
  filterBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterDivider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  chipCount: {
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  chipCountText: {
    ...typography.micro,
    fontWeight: '700',
    color: colors.text,
  },

  /* List */
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  cards: {
    gap: spacing.smd,
  },
  errorCard: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.error, 0.25),
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.errorText,
    flex: 1,
  },

  /* Card */
  cardUnread: {
    paddingLeft: spacing.md + 3,
  },
  unreadRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.smd,
  },
  cardBody: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
  cardTitleUnread: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    marginTop: 6,
  },
  cardText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.smd,
  },
  footerSpacer: {
    flex: 1,
  },
  cardWhen: {
    ...typography.micro,
    color: colors.textTertiary,
  },
});
