import React, { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
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
  Button,
  Card,
  EmptyState,
  Input,
  Pressable,
  ScreenHeader,
  SectionHeader,
  StatusPill,
} from '../../../shared/components';
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

const ACCENT = moduleAccent.diary;

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
    void loadDiaryEntries();
  }, []);

  const resetForm = () => {
    setTopicsCovered('');
    setHomework('');
    setDate(todayIso());
    setError(null);
  };

  const handlePost = async () => {
    const selectedClass = CLASSES[classIndex];
    const result = await postDiaryEntry({
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
      { text: 'Delete', style: 'destructive', onPress: () => void removeDiaryEntry(entry.id) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Class Diary"
        subtitle="Post homework and notes"
        gradientColors={ACCENT.gradient}
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {!showForm && (
                <Button
                  label="New diary entry"
                  icon="plus"
                  size="lg"
                  tone={{ gradient: ACCENT.gradient }}
                  onPress={() => setShowForm(true)}
                  style={styles.newEntryButton}
                />
              )}

              {showForm && (
                <Card elevation="md" padding="lg" style={styles.formCard}>
                  <Text style={styles.formTitle}>Create new entry</Text>

                  <View style={styles.formRow}>
                    <View style={styles.formField}>
                      <Text style={styles.fieldLabel}>Class</Text>
                      <PillCycle
                        value={CLASSES[classIndex].name}
                        onPress={() => setClassIndex(i => (i + 1) % CLASSES.length)}
                      />
                    </View>
                    <View style={styles.formField}>
                      <Text style={styles.fieldLabel}>Subject</Text>
                      <PillCycle
                        value={SUBJECTS[subjectIndex]}
                        onPress={() => setSubjectIndex(i => (i + 1) % SUBJECTS.length)}
                      />
                    </View>
                  </View>

                  <Input
                    label="Date"
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                    icon="calendar"
                    containerStyle={styles.field}
                  />

                  <Input
                    label="Topics covered"
                    value={topicsCovered}
                    onChangeText={setTopicsCovered}
                    placeholder="What did you teach today?"
                    multiline
                    numberOfLines={3}
                    inputStyle={styles.textarea}
                    containerStyle={styles.field}
                  />

                  <Input
                    label="Homework"
                    value={homework}
                    onChangeText={setHomework}
                    placeholder="What should students complete?"
                    multiline
                    numberOfLines={3}
                    inputStyle={styles.textarea}
                    error={error}
                    containerStyle={styles.field}
                  />

                  <Text style={styles.fieldLabel}>Attachments</Text>
                  <View style={styles.uploadZone}>
                    <Feather name="paperclip" size={20} color={colors.textTertiary} />
                    <Text style={styles.uploadZoneText}>File upload coming soon</Text>
                    <Text style={styles.uploadZoneHint}>PDF or images, up to 5 MB</Text>
                  </View>

                  <View style={styles.formActions}>
                    <Button
                      label="Cancel"
                      variant="outline"
                      onPress={() => {
                        setShowForm(false);
                        resetForm();
                      }}
                      style={styles.formAction}
                    />
                    <Button
                      label="Post entry"
                      icon="send"
                      tone={{ gradient: ACCENT.gradient }}
                      onPress={handlePost}
                      style={styles.formAction}
                    />
                  </View>
                </Card>
              )}

              <SectionHeader
                title="Recent entries"
                caption={
                  entries.length > 0
                    ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`
                    : undefined
                }
                style={styles.sectionHeader}
              />
            </>
          }
          renderItem={({ item }) => <DiaryCard entry={item} onDelete={() => handleDelete(item)} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              icon="book-open"
              tone="info"
              title="No diary entries yet"
              message="Post your first entry to share today's topics and homework with the class."
            />
          }
          ListFooterComponent={
            <Card
              elevation="none"
              padding="md"
              backgroundColor={withAlpha(colors.info, 0.07)}
              style={styles.infoBanner}
            >
              <View style={styles.infoBannerRow}>
                <Feather name="info" size={16} color={colors.infoText} />
                <Text style={styles.infoBannerText}>
                  Entries can be edited or deleted within 24 hours of posting. After that they are
                  locked for record-keeping.
                </Text>
              </View>
            </Card>
          }
        />
      </KeyboardAvoidingView>
    </View>
  );
}

function PillCycle({ value, onPress }: { value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      activeScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${value}. Tap to change.`}
      style={styles.pillCycle}
    >
      <Text style={styles.pillCycleText} numberOfLines={1}>
        {value}
      </Text>
      <Feather name="chevron-down" size={15} color={colors.textSecondary} />
    </Pressable>
  );
}

function DiaryCard({ entry, onDelete }: { entry: DiaryEntry; onDelete: () => void }) {
  const editable = isWithinEditWindow(entry);

  return (
    <Card elevation="sm" padding="md">
      <View style={styles.cardTopRow}>
        <View style={styles.cardDateRow}>
          <Feather name="calendar" size={13} color={colors.textSecondary} />
          <Text style={styles.cardDate}>{entry.date}</Text>
        </View>
        <View style={styles.cardBadgeRow}>
          <StatusPill label={entry.className} tone="info" />
          <StatusPill label={entry.subject} tone="brand" />
        </View>
      </View>

      <Text style={styles.cardContent}>{entry.topicsCovered}</Text>

      {!!entry.homework && (
        <View style={styles.homeworkBlock}>
          <View style={styles.homeworkLabelRow}>
            <Feather name="edit-3" size={12} color={colors.warningText} />
            <Text style={styles.homeworkLabel}>HOMEWORK</Text>
          </View>
          <Text style={styles.homeworkText}>{entry.homework}</Text>
        </View>
      )}

      {entry.attachmentName && (
        <View style={styles.attachmentChip}>
          <View style={styles.attachmentIcon}>
            <Feather name="paperclip" size={15} color={ACCENT.text} />
          </View>
          <View style={styles.attachmentText}>
            <Text style={styles.attachmentName} numberOfLines={1}>
              {entry.attachmentName}
            </Text>
            <Text style={styles.attachmentType}>PDF document</Text>
          </View>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.postedText}>Posted {relativeTimeFromNow(entry.postedAt)}</Text>

        {editable ? (
          <View style={styles.cardActions}>
            <Pressable
              dimOnPress
              accessibilityRole="button"
              accessibilityLabel={`Edit entry for ${entry.subject}`}
              style={styles.cardAction}
            >
              <Feather name="edit-2" size={13} color={colors.primaryText} />
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={onDelete}
              dimOnPress
              accessibilityRole="button"
              accessibilityLabel={`Delete entry for ${entry.subject}`}
              style={styles.cardAction}
            >
              <Feather name="trash-2" size={13} color={colors.errorText} />
              <Text style={styles.deleteLink}>Delete</Text>
            </Pressable>
          </View>
        ) : (
          <StatusPill label="Locked" tone="neutral" icon="lock" />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.smd,
  },

  /* Form */
  newEntryButton: {
    marginBottom: spacing.lg,
  },
  formCard: {
    marginBottom: spacing.lg,
  },
  formTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.smd,
    marginBottom: spacing.md,
  },
  formField: {
    flex: 1,
  },
  fieldLabel: {
    ...typography.captionBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  pillCycle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 50,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.smd,
  },
  pillCycleText: {
    ...typography.caption,
    color: colors.text,
    flexShrink: 1,
  },
  field: {
    marginBottom: spacing.md,
  },
  textarea: {
    minHeight: 76,
    textAlignVertical: 'top',
    paddingTop: spacing.smd,
  },
  uploadZone: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSunken,
    marginBottom: spacing.lg,
  },
  uploadZoneText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  uploadZoneHint: {
    ...typography.micro,
    color: colors.textTertiary,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.smd,
  },
  formAction: {
    flex: 1,
  },
  sectionHeader: {
    marginBottom: spacing.smd,
  },

  /* Entry card */
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.smd,
  },
  cardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardDate: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  cardContent: {
    ...typography.caption,
    color: colors.text,
  },
  homeworkBlock: {
    marginTop: spacing.smd,
    padding: spacing.smd,
    borderRadius: borderRadius.sm,
    backgroundColor: withAlpha(colors.warning, 0.08),
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  homeworkLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  homeworkLabel: {
    ...typography.micro,
    fontWeight: '700',
    color: colors.warningText,
    letterSpacing: 0.6,
  },
  homeworkText: {
    ...typography.caption,
    color: colors.text,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.smd,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachmentIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.xs,
    backgroundColor: withAlpha(ACCENT.solid, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentText: {
    flex: 1,
  },
  attachmentName: {
    ...typography.captionBold,
    color: colors.text,
  },
  attachmentType: {
    ...typography.micro,
    color: colors.textTertiary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.smd,
    paddingTop: spacing.smd,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  postedText: {
    ...typography.micro,
    color: colors.textTertiary,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  editLink: {
    ...typography.micro,
    fontWeight: '700',
    color: colors.primaryText,
  },
  deleteLink: {
    ...typography.micro,
    fontWeight: '700',
    color: colors.errorText,
  },

  /* Footer note */
  infoBanner: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.info, 0.22),
  },
  infoBannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoBannerText: {
    ...typography.small,
    color: colors.text,
    flex: 1,
  },
});
