import React, { useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../../store';
import { colors, spacing, typography, borderRadius } from '../../../shared/theme';
import { GradientHeader, StatusPill } from '../../../shared/components';
import { setSelectedDay } from '../state/timeTableSlice';
import type { TimetableEntry } from '../../../shared/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  const renderPeriod = ({ item, index }: { item: { entry: TimetableEntry; startMinutes: number | null }; index: number }) => {
    const { entry } = item;
    const isCurrent = entry.id === currentEntryId;
    const isBreak = isBreakSubject(entry.subject);
    const isFree = isFreeSubject(entry.subject);
    const startTime = entry.timeSlot.split('-')[0]?.trim();

    return (
      <View
        style={[
          styles.periodCard,
          isCurrent ? styles.periodCardCurrent : isBreak ? styles.periodCardBreak : isFree ? styles.periodCardFree : null,
        ]}
      >
        <View style={styles.periodRow}>
          <View style={styles.periodTimeCol}>
            <Text style={[styles.periodNumber, isCurrent && styles.periodNumberCurrent]}>P{index + 1}</Text>
            <View style={styles.periodTimeRow}>
              <Feather name="clock" size={11} color={isCurrent ? colors.secondaryDark : colors.textSecondary} />
              <Text style={styles.periodTime}>{startTime}</Text>
            </View>
          </View>

          <View style={styles.periodInfo}>
            <Text style={[styles.periodSubject, isCurrent && styles.periodSubjectCurrent]}>{entry.subject}</Text>
            {!!entry.className && (
              <View>
                <Text style={styles.periodClass}>{entry.className}</Text>
                {!!entry.room && (
                  <View style={styles.periodRoomRow}>
                    <Feather name="map-pin" size={11} color={colors.textSecondary} />
                    <Text style={styles.periodRoom}>{entry.room}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {isCurrent && <StatusPill label="Now" tone="success" />}
          {isBreak && <StatusPill label="Break" tone="warning" />}
          {isFree && <StatusPill label="Free" tone="neutral" />}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Timetable"
        subtitle="Your weekly schedule"
        gradientColors={[colors.secondary, colors.secondaryDark]}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daySelector} contentContainerStyle={styles.daySelectorContent}>
        {DAYS.map(day => {
          const active = day === selectedDay;
          return (
            <TouchableOpacity
              key={day}
              onPress={() => dispatch(setSelectedDay(day))}
              style={[styles.dayPill, active && styles.dayPillActive]}
              accessibilityRole="button"
              accessibilityLabel={day}
            >
              <Text style={[styles.dayPillText, active && styles.dayPillTextActive]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={dayEntries}
        keyExtractor={({ entry }) => entry.id}
        renderItem={renderPeriod}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          currentEntry ? (
            <View style={styles.currentBanner}>
              <Feather name="clock" size={18} color={colors.secondaryDark} />
              <View style={styles.currentBannerText}>
                <Text style={styles.currentBannerTitle}>Currently in this period</Text>
                <Text style={styles.currentBannerSubtitle}>
                  {currentEntry.subject} - {currentEntry.className}
                </Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="calendar" size={32} color={colors.disabled} />
            <Text style={styles.emptyStateText}>No classes scheduled for {selectedDay}</Text>
          </View>
        }
        ListFooterComponent={
          dayEntries.length > 0 ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Today's Summary</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryValue}>{summary.classes}</Text>
                  <Text style={styles.summaryLabel}>Classes</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryValue}>{summary.free}</Text>
                  <Text style={styles.summaryLabel}>Free Period</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryValue}>{summary.sections}</Text>
                  <Text style={styles.summaryLabel}>Sections</Text>
                </View>
              </View>
            </View>
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
  daySelector: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexGrow: 0,
  },
  daySelectorContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    gap: spacing.sm,
  },
  dayPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  dayPillActive: {
    backgroundColor: colors.secondary,
  },
  dayPillText: {
    ...typography.caption,
    color: colors.text,
  },
  dayPillTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.lg,
  },
  currentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  currentBannerText: {
    flex: 1,
  },
  currentBannerTitle: {
    ...typography.caption,
    color: colors.text,
  },
  currentBannerSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  periodCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm + spacing.xs,
  },
  periodCardCurrent: {
    backgroundColor: 'rgba(46, 204, 113, 0.08)',
    borderColor: colors.secondary,
  },
  periodCardBreak: {
    backgroundColor: 'rgba(245, 166, 35, 0.08)',
    borderColor: 'rgba(245, 166, 35, 0.3)',
  },
  periodCardFree: {
    backgroundColor: colors.background,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  periodTimeCol: {
    minWidth: 56,
    alignItems: 'center',
  },
  periodNumber: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  periodNumberCurrent: {
    color: colors.secondaryDark,
  },
  periodTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  periodTime: {
    ...typography.small,
    color: colors.textSecondary,
  },
  periodInfo: {
    flex: 1,
    gap: 2,
  },
  periodSubject: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 2,
  },
  periodSubjectCurrent: {
    color: colors.secondaryDark,
  },
  periodClass: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  periodRoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  periodRoom: {
    ...typography.small,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyStateText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  summaryTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryValue: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 2,
  },
  summaryLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
