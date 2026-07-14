import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { GlassCard, StatusPill } from '../../../shared/components';
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

const GRADE_TONE: Record<string, string> = {
  A1: colors.secondary,
  A2: colors.blue,
  B1: colors.blue,
  B2: colors.accent,
  C1: colors.accent,
  C2: colors.accent,
  D: colors.error,
  E: colors.error,
};

export default function StudentMarksScreen() {
  const navigation = useNavigation();
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
    a => a.classId === selectedClass && a.subjectId === selectedSubject && a.type === selectedExam
  );
  const rows = useMemo(
    () => (currentAssessment ? marks.filter(m => m.assessmentId === currentAssessment.id) : []),
    [marks, currentAssessment]
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
      <View style={styles.header}>
        <LinearGradient colors={[colors.primary, colors.primaryLight, colors.primary]} style={StyleSheet.absoluteFill} />
        <View style={styles.headerOrb} />

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={colors.surface} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Enhanced Marks Entry</Text>
        <Text style={styles.headerSubtitle}>All Examination Types</Text>

        <View style={styles.dropdownRow}>
          <PillSelect value={selectedClass} options={CLASSES} onChange={setSelectedClass} prefix="Class " />
          <PillSelect value={selectedSubject} options={SUBJECTS} onChange={setSelectedSubject} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examTabRow}>
          {EXAM_TYPES.map(exam => {
            const active = exam.code === selectedExam;
            return (
              <TouchableOpacity
                key={exam.code}
                onPress={() => setSelectedExam(exam.code)}
                style={[styles.examTab, active && styles.examTabActive]}
              >
                <Text style={[styles.examTabText, active && styles.examTabTextActive]}>{exam.code}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <GlassCard style={[styles.examInfoCard, { borderLeftColor: currentExamConfig.color }]}>
          <View style={styles.examInfoTop}>
            <Text style={styles.examInfoName}>{currentExamConfig.name}</Text>
            <View style={[styles.maxBadge, { backgroundColor: withAlpha(colors.purple, 0.1) }]}>
              <Text style={[styles.maxBadgeText, { color: colors.purple }]}>Max: {currentExamConfig.maxMarks}</Text>
            </View>
          </View>
          <View style={styles.examInfoStatusRow}>
            <Feather name="file-text" size={14} color={colors.textSecondary} />
            <Text style={styles.examInfoStatusLabel}>Status:</Text>
            <StatusPill label={isDraft ? 'Draft' : 'Submitted'} tone={isDraft ? 'warning' : 'success'} />
          </View>
        </GlassCard>

        <GlassCard style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.studentCol]}>Student</Text>
            <Text style={styles.tableHeaderCell}>Theory</Text>
            <Text style={styles.tableHeaderCell}>Practical</Text>
            <Text style={styles.tableHeaderCell}>Internal</Text>
            <Text style={styles.tableHeaderCell}>Grade</Text>
          </View>

          {rows.length === 0 ? (
            <Text style={styles.emptyText}>No students in this roster yet.</Text>
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
        </GlassCard>

        <GlassCard style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.secondary }]}>{completed}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{avgScore}%</Text>
              <Text style={styles.statLabel}>Avg Score</Text>
            </View>
          </View>
        </GlassCard>
      </ScrollView>

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.saveDraftButton}
          onPress={() => currentAssessment && saveDraft(currentAssessment.id)}
          disabled={!currentAssessment}
        >
          <Feather name="save" size={18} color={colors.primary} />
          <Text style={styles.saveDraftButtonText}>Save Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.submitButton}
          onPress={() => currentAssessment && submitForReview(currentAssessment.id)}
          disabled={!currentAssessment}
        >
          <Feather name="check-circle" size={18} color={colors.surface} />
          <Text style={styles.submitButtonText}>Submit for Review</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
    <TouchableOpacity style={styles.dropdown} onPress={nextValue} accessibilityRole="button">
      <Text style={styles.dropdownText} numberOfLines={1}>
        {prefix}
        {value}
      </Text>
      <Feather name="chevron-down" size={16} color={colors.surface} />
    </TouchableOpacity>
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
  const gradeColor = GRADE_TONE[grade] ?? colors.disabled;

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.studentCol}>
        <Text style={styles.studentName} numberOfLines={1}>
          {mark.studentName}
        </Text>
        <Text style={styles.studentRoll}>Roll: {mark.studentId.split('-').pop()}</Text>
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
        <View style={[styles.gradeBadge, { backgroundColor: withAlpha(gradeColor, 0.1) }]}>
          <Text style={[styles.gradeBadgeText, { color: gradeColor }]}>{grade}</Text>
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
  return (
    <TextInput
      style={styles.markInput}
      value={value == null ? '' : String(value)}
      onChangeText={onChangeValue}
      placeholder="-"
      placeholderTextColor={colors.disabled}
      keyboardType="numeric"
      maxLength={String(max).length}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    overflow: 'hidden',
  },
  headerOrb: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: borderRadius.full,
    backgroundColor: withAlpha(colors.purple, 0.08),
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h1,
    fontSize: 24,
    color: colors.surface,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.md,
  },
  dropdownRow: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
  },
  dropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  dropdownText: {
    ...typography.caption,
    color: colors.surface,
    fontWeight: '600',
  },
  examTabRow: {
    gap: spacing.sm,
  },
  examTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  examTabActive: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
  examTabText: {
    ...typography.caption,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  examTabTextActive: {
    color: colors.primary,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  examInfoCard: {
    borderLeftWidth: 4,
    marginBottom: spacing.md,
  },
  examInfoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  examInfoName: {
    ...typography.h3,
    color: colors.text,
  },
  maxBadge: {
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  maxBadgeText: {
    ...typography.small,
    fontWeight: '700',
  },
  examInfoStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  examInfoStatusLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  tableCard: {
    padding: 0,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  tableHeaderCell: {
    ...typography.small,
    color: colors.surface,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  studentCol: {
    flex: 2,
    textAlign: 'left',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  studentName: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
  },
  studentRoll: {
    ...typography.small,
    color: colors.textSecondary,
  },
  markInput: {
    flex: 1,
    ...typography.caption,
    color: colors.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  gradeCol: {
    flex: 1,
    alignItems: 'center',
  },
  gradeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  gradeBadgeText: {
    ...typography.small,
    fontWeight: '700',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.xl,
  },
  statsCard: {
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  statLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveDraftButton: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
  },
  saveDraftButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
  },
  submitButtonText: {
    ...typography.bodyBold,
    color: colors.surface,
  },
});
