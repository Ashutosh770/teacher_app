import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
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
  Card,
  EmptyState,
  ProgressBar,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonList,
  StatTile,
  StatusPill,
} from '../../../shared/components';
import { useAppSelector } from '../../../store';
import { LEAVE_TYPES } from '../../leaveManagement/services/leaveManagementService';
import { loadDashboardStats } from '../services/adminDashboardService';
import type { LeaveRequest } from '../../../shared/types';

const ACCENT = moduleAccent.admin;
const CARD_OVERLAP = 64;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function formatRange(start: string, end: string): string {
  const from = formatDate(start);
  const to = formatDate(end);
  return from === to ? from : `${from} – ${to}`;
}

function dayCount(start: string, end: string): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function leaveTypeName(code: string): string {
  return LEAVE_TYPES.find(t => t.code === code)?.name ?? code;
}

/**
 * Attendance percentages are the headline number here, so they get a coloured
 * band rather than a bare figure: below 75% is the threshold most schools treat
 * as actionable, 75–90% is watch-list, above that is fine.
 */
function attendanceTone(percent: number): { text: string; stops: [string, string]; tone: 'success' | 'warning' | 'error' } {
  if (percent >= 90) return { text: colors.successText, stops: gradients.success, tone: 'success' };
  if (percent >= 75) return { text: colors.warningText, stops: gradients.warning, tone: 'warning' };
  return { text: colors.errorText, stops: gradients.danger, tone: 'error' };
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation();
  const { stats, pendingLeaves, lastUpdated, isLoading, error } = useAppSelector(s => s.adminDashboard);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void loadDashboardStats();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadDashboardStats();
    setIsRefreshing(false);
  }, []);

  // Only the very first load gets skeletons; a pull-to-refresh keeps the
  // existing numbers on screen so the page doesn't blink back to placeholders.
  const isInitialLoad = isLoading && !stats;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        <ScreenHeader
          title="Admin Dashboard"
          subtitle={
            lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'School operations overview'
          }
          gradientColors={ACCENT.gradient}
          onBack={() => navigation.goBack()}
          overlap={CARD_OVERLAP}
        />

        <View style={styles.body}>
          {error ? (
            <Card
              elevation="sm"
              padding="md"
              backgroundColor={colors.errorSoft}
              style={styles.errorCard}
            >
              <View style={styles.errorRow}>
                <Feather name="alert-circle" size={18} color={colors.errorText} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </Card>
          ) : null}

          {/* Attendance — the two numbers an administrator opens this for. */}
          <Card elevation="md" padding="lg" style={styles.attendanceCard}>
            <Text style={styles.cardEyebrow}>TODAY&apos;S ATTENDANCE</Text>

            {isInitialLoad ? (
              <View style={styles.skeletonStack}>
                <Skeleton width="70%" height={26} />
                <Skeleton width="100%" height={8} />
                <Skeleton width="70%" height={26} />
                <Skeleton width="100%" height={8} />
              </View>
            ) : (
              <>
                <AttendanceBar
                  label="Staff"
                  icon="briefcase"
                  percent={stats?.staffAttendancePercent ?? 0}
                />
                <AttendanceBar
                  label="Students"
                  icon="users"
                  percent={stats?.studentAttendancePercent ?? 0}
                  style={styles.attendanceBarSpaced}
                />
              </>
            )}
          </Card>

          <View style={styles.tileRow}>
            <Card elevation="sm" padding="md" style={styles.tileCard}>
              {isInitialLoad ? (
                <Skeleton width="60%" height={30} />
              ) : (
                <StatTile
                  value={stats?.pendingLeaveCount ?? 0}
                  label="Pending leave"
                  icon="clock"
                  tone={colors.warningText}
                  align="left"
                />
              )}
            </Card>

            <Card
              elevation="sm"
              padding="md"
              onPress={() => (navigation as any).navigate('Announcements')}
              accessibilityLabel="Announcements"
              style={styles.tileCard}
            >
              {isInitialLoad ? (
                <Skeleton width="60%" height={30} />
              ) : (
                <StatTile
                  value={stats?.announcementCount ?? 0}
                  label="Announcements"
                  icon="bell"
                  tone={colors.infoText}
                  align="left"
                />
              )}
            </Card>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title="Pending approvals"
              caption={
                pendingLeaves.length > 0
                  ? `${pendingLeaves.length} request${pendingLeaves.length === 1 ? '' : 's'} awaiting review`
                  : undefined
              }
            />

            {isInitialLoad ? (
              <SkeletonList count={3} />
            ) : pendingLeaves.length === 0 ? (
              <Card elevation="sm" padding="none">
                <EmptyState
                  icon="check-circle"
                  tone="success"
                  title="Nothing to approve"
                  message="Every leave request has been reviewed."
                  compact
                />
              </Card>
            ) : (
              <View style={styles.requestList}>
                {pendingLeaves.map(request => (
                  <PendingLeaveRow key={request.id} request={request} />
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function AttendanceBar({
  label,
  icon,
  percent,
  style,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  percent: number;
  style?: object;
}) {
  const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const { text, stops, tone } = attendanceTone(safe);

  return (
    <View style={style}>
      <View style={styles.attendanceHeader}>
        <View style={styles.attendanceLabel}>
          <Feather name={icon} size={15} color={colors.textSecondary} />
          <Text style={styles.attendanceLabelText}>{label}</Text>
        </View>
        <View style={styles.attendanceValueRow}>
          <Text style={[styles.attendanceValue, { color: text }]}>{Math.round(safe)}%</Text>
          <StatusPill
            label={tone === 'success' ? 'On track' : tone === 'warning' ? 'Watch' : 'Low'}
            tone={tone}
          />
        </View>
      </View>
      <ProgressBar progress={safe / 100} colors={stops} height={9} label={`${label} attendance`} />
    </View>
  );
}

function PendingLeaveRow({ request }: { request: LeaveRequest }) {
  const days = dayCount(request.startDate, request.endDate);

  return (
    <Card elevation="xs" padding="md" bordered>
      <View style={styles.requestRow}>
        <View style={styles.requestDays}>
          <Text style={styles.requestDaysValue}>{days}</Text>
          <Text style={styles.requestDaysLabel}>{days === 1 ? 'day' : 'days'}</Text>
        </View>

        <View style={styles.requestInfo}>
          <Text style={styles.requestType} numberOfLines={1}>
            {leaveTypeName(request.leaveType)}
          </Text>
          <Text style={styles.requestDates}>{formatRange(request.startDate, request.endDate)}</Text>
          {!!request.reason && (
            <Text style={styles.requestReason} numberOfLines={2}>
              {request.reason}
            </Text>
          )}
        </View>

        <StatusPill label="Pending" tone="warning" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing.xl,
  },
  body: {
    paddingHorizontal: spacing.lg,
    marginTop: -CARD_OVERLAP,
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

  /* Attendance card */
  attendanceCard: {
    marginBottom: spacing.smd,
  },
  cardEyebrow: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  skeletonStack: {
    gap: spacing.smd,
  },
  attendanceBarSpaced: {
    marginTop: spacing.lg,
  },
  attendanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  attendanceLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  attendanceLabelText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  attendanceValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  attendanceValue: {
    ...typography.h3,
  },

  /* Tiles */
  tileRow: {
    flexDirection: 'row',
    gap: spacing.smd,
    marginBottom: spacing.lg,
  },
  tileCard: {
    flexGrow: 1,
    flexBasis: '47%',
    maxWidth: '48.5%',
  },

  /* Pending approvals */
  section: {
    marginBottom: spacing.lg,
  },
  requestList: {
    gap: spacing.smd,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
  },
  requestDays: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: withAlpha(colors.warning, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestDaysValue: {
    ...typography.h3,
    color: colors.warningText,
  },
  requestDaysLabel: {
    ...typography.micro,
    color: colors.warningText,
  },
  requestInfo: {
    flex: 1,
  },
  requestType: {
    ...typography.bodyBold,
    color: colors.text,
  },
  requestDates: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  requestReason: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
});
