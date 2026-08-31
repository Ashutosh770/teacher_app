import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Pressable,
  ScreenHeader,
  StatTile,
  StatusPill,
} from '../../../shared/components';
import { useAppSelector } from '../../../store';
import {
  componentMax,
  EXAM_TYPES,
  gradeFor,
  loadMarksData,
  saveDraft,
  submitForReview,
  totalFor,
  updateMarkValue,
} from '../services/studentMarksService';
import type { ExamTypeCode, StudentMark } from '../../../shared/types';

const CLASSES = ['X-A', 'X-B', 'IX-A'];
const SUBJECTS = ['Mathematics', 'Science', 'English'];
const ACCENT = moduleAccent.marks;

/**
 * Grade → colour. Uses the AA-safe `*Text` steps because these render as 13px
 * badge labels; the fill steps sit near 2:1 at that size.
 */
const GRADE_TONE: Record<string, { text: string; fill: string }> = {
  A1: { text: colors.successText, fill: colors.success },
  A2: { text: colors.successText, fill: colors.success },
  B1: { text: colors.infoText, fill: colors.info },
  B2: { text: colors.infoText, fill: colors.info },
  C1: { text: colors.warningText, fill: colors.warning },
  C2: { text: colors.warningText, fill: colors.warning },
  D: { text: colors.errorText, fill: colors.error },
  E: { text: colors.errorText, fill: colors.error },
};

export default function StudentMarksScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [selectedClass, setSelectedClass] = useState(CLASSES[0]);
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
  const [selectedExam, setSelectedExam] = useState<ExamTypeCode>('PT-1');

  const assessments = useAppSelector(s => s.studentMarks.assessments);
  const marks = useAppSelector(s => s.studentMarks.marks);

  useEffect(() => {
    void loadMarksData(selectedClass, selectedSubject);
  }, [selectedClass, selectedSubject]);

  const currentExamConfig = EXAM_TYPES.find(e => e.code === selectedExam)!;
  const currentAssessment = assessments.find(
    a => a.classId === selectedClass && a.subjectId === selectedSubject && a.type === selectedExam,
  );
  const rows = useMemo(
    () => (currentAssessment ? marks.filter(m => m.assessmentId === currentAssessment.id) : []),
    [marks, currentAssessment],
  );
  const max = componentMax(selectedExam);

  const completed = rows.filter(r => totalFor(r) != null).length;
  const pending = rows.length - completed;
  const avgScore = (() => {
    const totals = rows.map(r => totalFor(r)).filter((v): v is number => v != null);
    if (totals.length === 0 || !currentAssessment) return 0;
    const avgRaw = totals.reduce((a, b) => a + b, 0) / totals.length;
    return Math.round((avgRaw / currentAssessment.maxScore) * 100);
  })();

  const isDraft = currentAssessment?.status !== 'submitted';

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Marks Entry"
        subtitle="All examination types"
        gradientColors={ACCENT.gradient}
        onBack={() => navigation.goBack()}
      >
        <View style={styles.selectorRow}>
          <PillSelect value={selectedClass} options={CLASSES} onChange={setSelectedClass} prefix="Class " />
          <PillSelect value={selectedSubject} options={SUBJECTS} onChange={setSelectedSubject} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.examTabRow}
        >
          {EXAM_TYPES.map(exam => {
            const active = exam.code === selectedExam;
            return (
              <Pressable
                key={exam.code}
                onPress={() => setSelectedExam(exam.code)}
                activeScale={0.94}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={exam.name}
                style={[styles.examTab, active && styles.examTabActive]}
              >
                <Text style={[styles.examTabText, active && styles.examTabTextActive]}>
                  {exam.code}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </ScreenHeader>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card elevation="sm" padding="md" style={styles.examInfoCard}>
            <View style={[styles.examInfoRail, { backgroundColor: currentExamConfig.color }]} />
            <View style={styles.examInfoTop}>
              <Text style={styles.examInfoName} numberOfLines={1}>
                {currentExamConfig.name}
              </Text>
              <View style={styles.maxBadge}>
                <Text style={styles.maxBadgeText}>Max {currentExamConfig.maxMarks}</Text>
              </View>
            </View>
            <View style={styles.examInfoStatusRow}>
              <Feather name="file-text" size={13} color={colors.textSecondary} />
              <Text style={styles.examInfoStatusLabel}>Status</Text>
              <StatusPill
                label={isDraft ? 'Draft' : 'Submitted'}
                tone={isDraft ? 'warning' : 'success'}
                icon={isDraft ? 'edit-3' : 'check'}
              />
            </View>
          </Card>

          <Card elevation="sm" padding="none" style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.studentCol]}>Student</Text>
              <Text style={styles.tableHeaderCell}>Thry</Text>
              <Text style={styles.tableHeaderCell}>Prac</Text>
              <Text style={styles.tableHeaderCell}>Int</Text>
              <Text style={styles.tableHeaderCell}>Grade</Text>
            </View>

            {rows.length === 0 ? (
              <EmptyState
                icon="users"
                tone="info"
                title="No students"
                message="This class and subject has no roster loaded yet."
                compact
              />
            ) : (
              rows.map((mark, index) => (
                <MarkRow
                  key={mark.id}
                  mark={mark}
                  max={max}
                  maxScore={currentAssessment!.maxScore}
                  isLast={index === rows.length - 1}
                />
              ))
            )}
          </Card>

          <Card elevation="sm" padding="md">
            <Text style={styles.statsTitle}>PROGRESS</Text>
            <View style={styles.statsRow}>
              <StatTile value={completed} label="Completed" tone={colors.successText} />
              <View style={styles.statsDivider} />
              <StatTile value={pending} label="Pending" tone={colors.warningText} />
              <View style={styles.statsDivider} />
              <StatTile value={`${avgScore}%`} label="Avg score" tone={ACCENT.text} />
            </View>
          </Card>
        </ScrollView>

        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.smd }]}>
          <Button
            label="Save draft"
            icon="save"
            variant="outline"
            onPress={() => currentAssessment && saveDraft(currentAssessment.id)}
            disabled={!currentAssessment}
            tone={{ solid: ACCENT.solid }}
            style={styles.actionButton}
          />
          <Button
            label="Submit"
            icon="check-circle"
            onPress={() => currentAssessment && submitForReview(currentAssessment.id)}
            disabled={!currentAssessment}
            tone={{ gradient: ACCENT.gradient }}
            style={styles.actionButton}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Cycles through its options on tap — there is no picker dependency in the app. */
function PillSelect({
  value,
  options,
  onChange,
  prefix = '',
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  prefix?: string;
}) {
  const nextValue = () => {
    const index = options.indexOf(value);
    onChange(options[(index + 1) % options.length]);
  };

  return (
    <Pressable
      onPress={nextValue}
      activeScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${prefix}${value}. Tap to change.`}
      style={styles.selector}
    >
      <Text style={styles.selectorText} numberOfLines={1}>
        {prefix}
        {value}
      </Text>
      <Feather name="chevron-down" size={15} color={colors.textInverse} />
    </Pressable>
  );
}

function MarkRow({
  mark,
  max,
  maxScore,
  isLast,
}: {
  mark: StudentMark;
  max: { theory: number; practical: number; internal: number };
  maxScore: number;
  isLast: boolean;
}) {
  const grade = gradeFor(mark, maxScore);
  const tone = GRADE_TONE[grade] ?? { text: colors.textSecondary, fill: colors.textSecondary };
  const isComplete = totalFor(mark) != null;

  return (
    <View style={[styles.row, !isLast && styles.rowDivider, isComplete && styles.rowComplete]}>
      <View style={styles.studentCol}>
        <Text style={styles.studentName} numberOfLines={1}>
          {mark.studentName}
        </Text>
        <Text style={styles.studentRoll}>Roll {mark.studentId.split('-').pop()}</Text>
      </View>

      <MarkInput
        value={mark.theoryMark}
        max={max.theory}
        onChangeValue={raw => updateMarkValue(mark.id, 'theoryMark', raw, max.theory)}
      />
      <MarkInput
        value={mark.practicalMark}
        max={max.practical}
        onChangeValue={raw => updateMarkValue(mark.id, 'practicalMark', raw, max.practical)}
      />
      <MarkInput
        value={mark.internalMark}
        max={max.internal}
        onChangeValue={raw => updateMarkValue(mark.id, 'internalMark', raw, max.internal)}
      />

      <View style={styles.gradeCol}>
        <View style={[styles.gradeBadge, { backgroundColor: withAlpha(tone.fill, 0.13) }]}>
          <Text style={[styles.gradeBadgeText, { color: tone.text }]}>{grade}</Text>
        </View>
      </View>
    </View>
  );
}

function MarkInput({
  value,
  max,
  onChangeValue,
}: {
  value: number | null;
  max: number;
  onChangeValue: (raw: string) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <TextInput
      style={[styles.markInput, isFocused && styles.markInputFocused, value != null && styles.markInputFilled]}
      value={value == null ? '' : String(value)}
      onChangeText={onChangeValue}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      placeholder="–"
      placeholderTextColor={colors.textTertiary}
      keyboardType="numeric"
      maxLength={String(max).length}
      selectTextOnFocus
      accessibilityLabel={`Mark out of ${max}`}
    />
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

  /* Header controls */
  selectorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.smd,
  },
  selector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.smd - 2,
  },
  selectorText: {
    ...typography.captionBold,
    color: colors.textInverse,
    flexShrink: 1,
  },
  examTabRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  examTab: {
    minWidth: 54,
    alignItems: 'center',
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  examTabActive: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
  examTabText: {
    ...typography.captionBold,
    color: withAlpha(colors.overlayLight, 0.8),
  },
  examTabTextActive: {
    color: ACCENT.text,
  },

  /* Content */
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.smd,
  },

  /* Exam info */
  examInfoCard: {
    paddingLeft: spacing.md + 4,
  },
  examInfoRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
  },
  examInfoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  examInfoName: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  maxBadge: {
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(ACCENT.solid, 0.12),
  },
  maxBadgeText: {
    ...typography.micro,
    fontWeight: '700',
    color: ACCENT.text,
  },
  examInfoStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  examInfoStatusLabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginRight: spacing.xxs,
  },

  /* Table */
  tableCard: {
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm + 2,
  },
  tableHeaderCell: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  studentCol: {
    flex: 2.2,
    textAlign: 'left',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm + 2,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  // A completed row picks up a faint tint, so scanning down the table shows
  // how much is left without reading every cell.
  rowComplete: {
    backgroundColor: withAlpha(colors.success, 0.04),
  },
  studentName: {
    ...typography.captionBold,
    color: colors.text,
  },
  studentRoll: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: spacing.xxs,
  },
  markInput: {
    flex: 1,
    ...typography.captionBold,
    color: colors.text,
    textAlign: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    borderRadius: borderRadius.sm,
    marginHorizontal: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  markInputFilled: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  markInputFocused: {
    borderColor: ACCENT.solid,
    backgroundColor: colors.surface,
  },
  gradeCol: {
    flex: 1,
    alignItems: 'center',
  },
  gradeBadge: {
    minWidth: 34,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.xs,
  },
  gradeBadgeText: {
    ...typography.micro,
    fontWeight: '700',
  },

  /* Stats */
  statsTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.smd,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },

  /* Action bar */
  actionBar: {
    flexDirection: 'row',
    gap: spacing.smd,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.smd,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
  },
});
