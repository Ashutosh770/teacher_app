import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { GradientHeader } from '../../../shared/components';
import { useAppSelector } from '../../../store';
import { loadLeaveData, LEAVE_TYPES } from '../services/leaveManagementService';
import type { LeaveRequest } from '../../../shared/types';

type Tab = 'pending' | 'approved' | 'rejected';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

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
  return start === end ? start : `${start} - ${end}`;
}

function dayCount(request: LeaveRequest): number {
  const start = new Date(request.startDate).getTime();
  const end = new Date(request.endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

const TONE: Record<Tab, { color: string; icon: keyof typeof Feather.glyphMap; label: string }> = {
  pending: { color: colors.warning, icon: 'clock', label: 'Pending' },
  approved: { color: colors.secondary, icon: 'check-circle', label: 'Approved' },
  rejected: { color: colors.error, icon: 'x-circle', label: 'Rejected' },
};

export default function LeaveStatusScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const requests = useAppSelector(s => s.leaveManagement.requests);

  useEffect(() => {
    void loadLeaveData();
  }, []);

  const filtered = useMemo(
    () => requests.filter(r => r.status === activeTab),
    [requests, activeTab]
  );

  return (
    <View style={styles.screen}>
      <GradientHeader title="Leave Status" onBack={() => navigation.goBack()}>
        <View style={styles.tabRow}>
          {TABS.map(tab => {
            const active = tab.key === activeTab;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GradientHeader>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <LeaveStatusCard request={item} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name={TONE[activeTab].icon} size={32} color={colors.disabled} />
            <Text style={styles.emptyText}>No {TONE[activeTab].label.toLowerCase()} leave requests</Text>
          </View>
        }
      />
    </View>
  );
}

function LeaveStatusCard({ request }: { request: LeaveRequest }) {
  const tone = TONE[request.status];
  return (
    <View style={[styles.card, { borderLeftColor: tone.color }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.iconChip, { backgroundColor: withAlpha(tone.color, 0.1) }]}>
            <Feather name={tone.icon} size={20} color={tone.color} />
          </View>
          <View>
            <Text style={styles.cardTitle}>{leaveTypeName(request.leaveType)}</Text>
            <View style={styles.cardMetaRow}>
              <Feather name="calendar" size={13} color={colors.textSecondary} />
              <Text style={styles.cardMeta}>{dateRangeLabel(request)}</Text>
              <Text style={styles.cardMeta}>
                • {dayCount(request)} day{dayCount(request) > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: withAlpha(tone.color, 0.1) }]}>
          {request.status === 'pending' && <View style={[styles.pulseDot, { backgroundColor: tone.color }]} />}
          <Text style={[styles.statusPillText, { color: tone.color }]}>{tone.label}</Text>
        </View>
      </View>

      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>Reason</Text>
        <Text style={styles.reasonValue}>{request.reason}</Text>
      </View>

      <Text style={styles.footerText}>Submitted on {formatDate(request.submittedAt)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.glassLight,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + spacing.xs,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    ...typography.caption,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  tabTextActive: {
    color: colors.primary,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    flex: 1,
  },
  iconChip: {
    padding: spacing.sm + spacing.xs,
    borderRadius: borderRadius.lg,
  },
  cardTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
  },
  statusPillText: {
    ...typography.caption,
    fontWeight: '700',
  },
  reasonBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm + spacing.xs,
  },
  reasonLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  reasonValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  footerText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
