import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, moduleAccent, spacing, typography, withAlpha } from '../../../shared/theme';
import { Card, EmptyState, IconChip, Pressable, ScreenHeader, StatusPill } from '../../../shared/components';
import type { StatusPillTone } from '../../../shared/components';
import { useAppSelector } from '../../../store';
import { loadLeaveData, LEAVE_TYPES } from '../services/leaveManagementService';
import type { LeaveRequest } from '../../../shared/types';

type Tab = 'pending' | 'approved' | 'rejected';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const TONE: Record<
  Tab,
  { color: string; text: string; tone: StatusPillTone; icon: keyof typeof Feather.glyphMap; label: string }
> = {
  pending: { color: colors.warning, text: colors.warningText, tone: 'warning', icon: 'clock', label: 'Pending' },
  approved: { color: colors.success, text: colors.successText, tone: 'success', icon: 'check-circle', label: 'Approved' },
  rejected: { color: colors.error, text: colors.errorText, tone: 'error', icon: 'x-circle', label: 'Rejected' },
};

function leaveTypeName(code: string): string {
  return LEAVE_TYPES.find(t => t.code === code)?.name ?? code;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateRangeLabel(request: LeaveRequest): string {
  const start = formatDate(request.startDate);
  const end = formatDate(request.endDate);
  return start === end ? start : `${start} – ${end}`;
}

function dayCount(request: LeaveRequest): number {
  const start = new Date(request.startDate).getTime();
  const end = new Date(request.endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export default function LeaveStatusScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const requests = useAppSelector(s => s.leaveManagement.requests);

  useEffect(() => {
    void loadLeaveData();
  }, []);

  // Counts live on the tabs themselves — previously you had to open each tab to
  // learn whether it held anything.
  const counts = useMemo(
    () =>
      requests.reduce<Record<Tab, number>>(
        (acc, r) => {
          if (r.status in acc) acc[r.status as Tab] += 1;
          return acc;
        },
        { pending: 0, approved: 0, rejected: 0 },
      ),
    [requests],
  );

  const filtered = useMemo(
    () => requests.filter(r => r.status === activeTab),
    [requests, activeTab],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Leave Status"
        subtitle="Track your applications"
        gradientColors={moduleAccent.leave.gradient}
        onBack={() => navigation.goBack()}
      >
        <View style={styles.tabRow}>
          {TABS.map(tab => {
            const active = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                activeScale={0.97}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${tab.label}, ${counts[tab.key]}`}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
                {counts[tab.key] > 0 ? (
                  <View style={[styles.tabCount, active && styles.tabCountActive]}>
                    <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                      {counts[tab.key]}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScreenHeader>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <LeaveStatusCard request={item} />}
        ListEmptyComponent={
          <EmptyState
            icon={TONE[activeTab].icon}
            tone={activeTab === 'pending' ? 'warning' : activeTab === 'approved' ? 'success' : 'error'}
            title={`No ${TONE[activeTab].label.toLowerCase()} requests`}
            message={
              activeTab === 'pending'
                ? 'Applications awaiting a decision will show up here.'
                : `Nothing has been ${TONE[activeTab].label.toLowerCase()} yet.`
            }
          />
        }
      />
    </View>
  );
}

function LeaveStatusCard({ request }: { request: LeaveRequest }) {
  const tone = TONE[request.status];
  const days = dayCount(request);

  return (
    <Card elevation="sm" padding="md" style={styles.card}>
      <View style={[styles.cardRail, { backgroundColor: tone.color }]} />

      <View style={styles.cardHeader}>
        <IconChip icon={tone.icon} color={tone.color} size={42} />

        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {leaveTypeName(request.leaveType)}
          </Text>
          <View style={styles.cardMetaRow}>
            <Feather name="calendar" size={12} color={colors.textSecondary} />
            <Text style={styles.cardMeta} numberOfLines={1}>
              {dateRangeLabel(request)}
            </Text>
            <View style={styles.metaDot} />
            <Text style={styles.cardMeta}>
              {days} day{days > 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        <StatusPill label={tone.label} tone={tone.tone} />
      </View>

      {!!request.reason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>REASON</Text>
          <Text style={styles.reasonValue}>{request.reason}</Text>
        </View>
      )}

      <Text style={styles.footerText}>Submitted {formatDate(request.submittedAt)}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Tabs */
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    ...typography.captionBold,
    color: withAlpha(colors.overlayLight, 0.75),
  },
  tabTextActive: {
    color: colors.primaryText,
  },
  tabCount: {
    minWidth: 18,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    alignItems: 'center',
  },
  tabCountActive: {
    backgroundColor: withAlpha(colors.primary, 0.14),
  },
  tabCountText: {
    ...typography.micro,
    fontWeight: '700',
    color: colors.textInverse,
  },
  tabCountTextActive: {
    color: colors.primaryText,
  },

  /* List */
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.smd,
  },
  card: {
    paddingLeft: spacing.md + 4,
  },
  cardRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    marginBottom: spacing.smd,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  cardMeta: {
    ...typography.small,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.textTertiary,
  },
  reasonBox: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: borderRadius.sm,
    padding: spacing.smd,
    marginBottom: spacing.sm,
  },
  reasonLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  reasonValue: {
    ...typography.caption,
    color: colors.text,
  },
  footerText: {
    ...typography.micro,
    color: colors.textTertiary,
  },
});
