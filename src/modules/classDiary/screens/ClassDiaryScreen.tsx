import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { StatusPill } from '../../../shared/components';
import { useAppSelector } from '../../../store';
import {
  isWithinEditWindow,
  loadDiaryEntries,
  postDiaryEntry,
  relativeTimeFromNow,
  removeDiaryEntry,
} from '../services/classDiaryService';
import type { DiaryEntry } from '../../../shared/types';

const CLASSES = [
  { id: 'X-A', name: 'Class X-A' },
  { id: 'X-B', name: 'Class X-B' },
  { id: 'IX-A', name: 'Class IX-A' },
];
const SUBJECTS = ['Mathematics', 'Algebra', 'Geometry'];

const INDIGO = '#4F46E5';
const INDIGO_DARK = '#4338CA';
const PURPLE = colors.purple;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ClassDiaryScreen() {
  const navigation = useNavigation();
  const entries = useAppSelector(s => s.classDiary.entries);
  const [showForm, setShowForm] = useState(false);
  const [classIndex, setClassIndex] = useState(0);
  const [subjectIndex, setSubjectIndex] = useState(0);
  const [date, setDate] = useState(todayIso());
  const [topicsCovered, setTopicsCovered] = useState('');
  const [homework, setHomework] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDiaryEntries();
  }, []);

  const resetForm = () => {
    setTopicsCovered('');
    setHomework('');
    setDate(todayIso());
    setError(null);
  };

  const handlePost = () => {
    const selectedClass = CLASSES[classIndex];
    const result = postDiaryEntry({
      classId: selectedClass.id,
      className: selectedClass.name,
      subject: SUBJECTS[subjectIndex],
      date,
      topicsCovered,
      homework,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    resetForm();
    setShowForm(false);
  };

  const handleDelete = (entry: DiaryEntry) => {
    Alert.alert('Delete entry?', 'This diary entry will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeDiaryEntry(entry.id) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[INDIGO, INDIGO_DARK]} style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={colors.surface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Class Diary</Text>
        <Text style={styles.headerSubtitle}>Post homework and notes</Text>
      </LinearGradient>

      <FlatList
        data={entries}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <TouchableOpacity
              style={styles.newEntryButton}
              onPress={() => setShowForm(v => !v)}
              accessibilityRole="button"
            >
              <Feather name="plus" size={18} color={colors.surface} />
              <Text style={styles.newEntryButtonText}>New Diary Entry</Text>
            </TouchableOpacity>

            {showForm && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Create New Entry</Text>

                <View style={styles.formRow}>
                  <View style={styles.formField}>
                    <Text style={styles.label}>Class</Text>
                    <PillCycle
                      value={CLASSES[classIndex].name}
                      onPress={() => setClassIndex(i => (i + 1) % CLASSES.length)}
                    />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.label}>Subject</Text>
                    <PillCycle
                      value={SUBJECTS[subjectIndex]}
                      onPress={() => setSubjectIndex(i => (i + 1) % SUBJECTS.length)}
                    />
                  </View>
                </View>

                <Text style={styles.label}>Date</Text>
                <TextInput
                  style={styles.input}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={styles.label}>Topics Covered</Text>
                <TextInput
                  style={styles.textarea}
                  value={topicsCovered}
                  onChangeText={setTopicsCovered}
                  placeholder="Enter class notes / topics covered..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />

                <Text style={styles.label}>Homework</Text>
                <TextInput
                  style={styles.textarea}
                  value={homework}
                  onChangeText={setHomework}
                  placeholder="Enter homework..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />

                <Text style={styles.label}>Attachments</Text>
                <View style={styles.uploadZone}>
                  <Feather name="paperclip" size={22} color={colors.disabled} />
                  <Text style={styles.uploadZoneText}>File upload coming soon</Text>
                  <Text style={styles.uploadZoneHint}>PDF, Images up to 5MB</Text>
                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <View style={styles.formActions}>
                  <TouchableOpacity style={styles.postButton} onPress={handlePost} accessibilityRole="button">
                    <Text style={styles.postButtonText}>Post Entry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={styles.sectionTitle}>Recent Entries</Text>
          </>
        }
        renderItem={({ item }) => <DiaryCard entry={item} onDelete={() => handleDelete(item)} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="book-open" size={32} color={colors.disabled} />
            <Text style={styles.emptyText}>No diary entries yet</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              <Text style={styles.infoBannerBold}>Note: </Text>
              Entries can be edited or deleted within 24 hours of posting. After that, they are
              locked for record-keeping.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function PillCycle({ value, onPress }: { value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pillCycle} onPress={onPress} accessibilityRole="button">
      <Text style={styles.pillCycleText} numberOfLines={1}>
        {value}
      </Text>
      <Feather name="chevron-down" size={16} color={colors.text} />
    </TouchableOpacity>
  );
}

function DiaryCard({ entry, onDelete }: { entry: DiaryEntry; onDelete: () => void }) {
  const editable = isWithinEditWindow(entry);
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardDateRow}>
          <Feather name="calendar" size={14} color={colors.textSecondary} />
          <Text style={styles.cardDate}>{entry.date}</Text>
        </View>
        <View style={styles.cardBadgeRow}>
          <StatusPill label={entry.className} tone="info" />
          <View style={[styles.subjectPill, { backgroundColor: withAlpha(PURPLE, 0.12) }]}>
            <Text style={[styles.subjectPillText, { color: PURPLE }]}>{entry.subject}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.cardContent}>{entry.topicsCovered}</Text>
      {!!entry.homework && <Text style={styles.cardHomework}>Homework: {entry.homework}</Text>}

      {entry.attachmentName && (
        <View style={styles.attachmentChip}>
          <View style={styles.attachmentIcon}>
            <Feather name="paperclip" size={16} color={INDIGO} />
          </View>
          <View>
            <Text style={styles.attachmentName}>{entry.attachmentName}</Text>
            <Text style={styles.attachmentType}>PDF Document</Text>
          </View>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.postedText}>Posted {relativeTimeFromNow(entry.postedAt)}</Text>
        {editable ? (
          <View style={styles.cardActions}>
            <TouchableOpacity accessibilityRole="button">
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
            <Text style={styles.actionDot}>•</Text>
            <TouchableOpacity onPress={onDelete} accessibilityRole="button">
              <Text style={styles.deleteLink}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.lockedRow}>
            <Feather name="lock" size={12} color={colors.textSecondary} />
            <Text style={styles.lockedText}>Locked</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.surface,
  },
  headerSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xs,
  },
  content: {
    padding: spacing.lg,
  },
  newEntryButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INDIGO,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  newEntryButtonText: {
    ...typography.bodyBold,
    color: colors.surface,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  formTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  formField: {
    flex: 1,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  pillCycle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  pillCycleText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    flexShrink: 1,
  },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
  },
  textarea: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  uploadZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  uploadZoneText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  uploadZoneHint: {
    ...typography.small,
    color: colors.disabled,
    marginTop: 2,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.md,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  postButton: {
    flex: 1,
    backgroundColor: INDIGO,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  postButtonText: {
    ...typography.bodyBold,
    color: colors.surface,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm + spacing.xs,
  },
  cardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardDate: {
    ...typography.small,
    color: colors.textSecondary,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  subjectPill: {
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  subjectPillText: {
    ...typography.small,
    fontWeight: '700',
  },
  cardContent: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  cardHomework: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
  },
  attachmentIcon: {
    backgroundColor: withAlpha(INDIGO, 0.12),
    padding: spacing.xs + 2,
    borderRadius: borderRadius.sm,
  },
  attachmentName: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  attachmentType: {
    ...typography.small,
    color: colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm + spacing.xs,
  },
  postedText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editLink: {
    ...typography.small,
    color: INDIGO,
    fontWeight: '700',
  },
  actionDot: {
    ...typography.small,
    color: colors.disabled,
  },
  deleteLink: {
    ...typography.small,
    color: colors.error,
    fontWeight: '700',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lockedText: {
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
  infoBanner: {
    marginTop: spacing.md,
    backgroundColor: withAlpha(colors.blue, 0.08),
    borderLeftWidth: 4,
    borderLeftColor: colors.blue,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  infoBannerText: {
    ...typography.caption,
    color: colors.text,
  },
  infoBannerBold: {
    fontWeight: '700',
  },
});
