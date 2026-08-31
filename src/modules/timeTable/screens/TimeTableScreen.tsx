import React, { useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../../store';
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
  Pressable,
  ScreenHeader,
  StatTile,
  StatusPill,
} from '../../../shared/components';
import { setSelectedDay } from '../state/timeTableSlice';
import type { TimetableEntry } from '../../../shared/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ACCENT = moduleAccent.timetable;

function parseStartMinutes(timeSlot: string): number | null {
  const start = timeSlot.split('-')[0]?.trim();
  if (!start) return null;
  const match = start.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  // Timetables are authored in 12-hour school-day notation (8:00 through
  // 1:15) without am/pm; treat any hour before 8 as PM to keep periods sorted
  // through the afternoon.
  const normalizedHours = hours < 8 ? hours + 12 : hours;
  return normalizedHours * 60 + minutes;
}

function isBreakSubject(subject: string): boolean {
  return subject.trim().toLowerCase() === 'break';
}

function isFreeSubject(subject: string): boolean {
  return subject.trim().toLowerCase().includes('free');
}

function currentMinutesOfDay(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export default function TimeTableScreen() {
  const dispatch = useAppDispatch();
  const entries = useAppSelector(state => state.timeTable.entries);
  const selectedDay = useAppSelector(state => state.timeTable.selectedDay);

  const dayEntries = useMemo(() => {
    return entries
      .filter(entry => entry.day === selectedDay)
      .map(entry => ({ entry, startMinutes: parseStartMinutes(entry.timeSlot) }))
      .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
  }, [entries, selectedDay]);

  const currentEntryId = useMemo(() => {
    const nowMinutes = currentMinutesOfDay();
    const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === selectedDay;
    if (!isToday) return null;
    const current = dayEntries.find(({ entry, startMinutes }) => {
      if (startMinutes == null || isBreakSubject(entry.subject) || isFreeSubject(entry.subject)) return false;
      const endMinutes = startMinutes + 45;
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    });
    return current?.entry.id ?? null;
  }, [dayEntries, selectedDay]);

  const currentEntry = dayEntries.find(({ entry }) => entry.id === currentEntryId)?.entry;

  const summary = useMemo(() => {
    const classes = dayEntries.filter(({ entry }) => !isBreakSubject(entry.subject) && !isFreeSubject(entry.subject));
    const free = dayEntries.filter(({ entry }) => isFreeSubject(entry.subject));
    const sections = new Set(classes.map(({ entry }) => entry.className).filter(Boolean));
    return { classes: classes.length, free: free.length, sections: sections.size };
  }, [dayEntries]);

  const renderPeriod = ({
    item,
    index,
  }: {
    item: { entry: TimetableEntry; startMinutes: number | null };
    index: number;
  }) => {
    const { entry } = item;
    const isCurrent = entry.id === currentEntryId;
    const isBreak = isBreakSubject(entry.subject);
    const isFree = isFreeSubject(entry.subject);
    const startTime = entry.timeSlot.split('-')[0]?.trim();

    // Each period state gets its own fill, rail colour and pill, so the list
    // is scannable by shape rather than only by reading the badge text.
    const rail = isCurrent
      ? colors.success
      : isBreak
        ? colors.warning
        : isFree
          ? colors.textTertiary
          : colors.primary;

    return (
      <Card
        elevation={isCurrent ? 'md' : 'xs'}
        padding="none"
        bordered={!isCurrent}
        backgroundColor={
          isCurrent ? withAlpha(colors.success, 0.06) : isFree ? colors.surfaceSunken : colors.surface
        }
        style={[styles.periodCard, isCurrent && { borderWidth: 1.5, borderColor: withAlpha(colors.success, 0.4) }]}
      >
        <View style={styles.periodRow}>
          <View style={[styles.periodRail, { backgroundColor: rail }]} />

          <View style={styles.periodTimeCol}>
            <Text style={[styles.periodNumber, isCurrent && { color: colors.successText }]}>
              P{index + 1}
            </Text>
            <Text style={styles.periodTime}>{startTime}</Text>
          </View>

          <View style={styles.periodInfo}>
            <Text style={[styles.periodSubject, isCurrent && { color: colors.successText }]} numberOfLines={1}>
              {entry.subject}
            </Text>
            {!!entry.className && (
              <View style={styles.periodMetaRow}>
                <Text style={styles.periodClass} numberOfLines={1}>
                  {entry.className}
                </Text>
                {!!entry.room && (
                  <>
                    <View style={styles.metaDot} />
                    <Feather name="map-pin" size={11} color={colors.textSecondary} />
                    <Text style={styles.periodRoom} numberOfLines={1}>
                      {entry.room}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>

          {isCurrent && <StatusPill label="Now" tone="success" icon="radio" />}
          {isBreak && <StatusPill label="Break" tone="warning" icon="coffee" />}
          {isFree && <StatusPill label="Free" tone="neutral" />}
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Timetable"
        subtitle="Your weekly schedule"
        gradientColors={ACCENT.gradient}
      />

      <View style={styles.daySelector}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daySelectorContent}
        >
          {DAYS.map(day => {
            const active = day === selectedDay;
            return (
              <Pressable
                key={day}
                onPress={() => dispatch(setSelectedDay(day))}
                activeScale={0.94}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={day}
                style={[styles.dayPill, active && styles.dayPillActive]}
              >
                <Text style={[styles.dayPillText, active && styles.dayPillTextActive]}>
                  {day.slice(0, 3)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={dayEntries}
        keyExtractor={({ entry }) => entry.id}
        renderItem={renderPeriod}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          currentEntry ? (
            <Card
              elevation="sm"
              padding="md"
              backgroundColor={withAlpha(colors.success, 0.09)}
              style={styles.currentBanner}
            >
              <View style={styles.currentBannerRow}>
                <View style={styles.pulseWrap}>
                  <View style={styles.pulseOuter} />
                  <View style={styles.pulseInner} />
                </View>
                <View style={styles.currentBannerText}>
                  <Text style={styles.currentBannerTitle}>In session now</Text>
                  <Text style={styles.currentBannerSubtitle} numberOfLines={1}>
                    {currentEntry.subject} · {currentEntry.className}
                  </Text>
                </View>
              </View>
            </Card>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar"
            title="No classes scheduled"
            message={`You have nothing on the timetable for ${selectedDay}.`}
            tone="success"
          />
        }
        ListFooterComponent={
          dayEntries.length > 0 ? (
            <Card elevation="sm" padding="md" style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{selectedDay} at a glance</Text>
              <View style={styles.summaryRow}>
                <StatTile value={summary.classes} label="Classes" icon="book" tone={ACCENT.text} />
                <View style={styles.summaryDivider} />
                <StatTile value={summary.free} label="Free periods" icon="coffee" tone={colors.warningText} />
                <View style={styles.summaryDivider} />
                <StatTile value={summary.sections} label="Sections" icon="users" tone={colors.infoText} />
              </View>
            </Card>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Day selector */
  daySelector: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  daySelectorContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd,
    gap: spacing.sm,
  },
  dayPill: {
    minWidth: 58,
    alignItems: 'center',
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayPillActive: {
    backgroundColor: withAlpha(ACCENT.solid, 0.12),
    borderColor: withAlpha(ACCENT.solid, 0.4),
  },
  dayPillText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  dayPillTextActive: {
    color: ACCENT.text,
  },

  /* List */
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  /* Current-period banner */
  currentBanner: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.success, 0.28),
  },
  currentBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
  },
  pulseWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseOuter: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.success, 0.2),
  },
  pulseInner: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success,
  },
  currentBannerText: {
    flex: 1,
  },
  currentBannerTitle: {
    ...typography.captionBold,
    color: colors.successText,
  },
  currentBannerSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },

  /* Period card */
  periodCard: {
    marginBottom: spacing.smd,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    paddingRight: spacing.md,
    paddingVertical: spacing.smd,
  },
  periodRail: {
    width: 4,
    alignSelf: 'stretch',
    borderTopRightRadius: borderRadius.xs,
    borderBottomRightRadius: borderRadius.xs,
    minHeight: 44,
  },
  periodTimeCol: {
    minWidth: 46,
    alignItems: 'center',
  },
  periodNumber: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  periodTime: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: spacing.xxs,
  },
  periodInfo: {
    flex: 1,
  },
  periodSubject: {
    ...typography.bodyBold,
    color: colors.text,
  },
  periodMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  periodClass: {
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
  periodRoom: {
    ...typography.small,
    color: colors.textSecondary,
    flexShrink: 1,
  },

  /* Summary */
  summaryCard: {
    marginTop: spacing.sm,
  },
  summaryTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.smd,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
});
