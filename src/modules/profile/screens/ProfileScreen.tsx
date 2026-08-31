import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Button, Card, Pressable, ScreenHeader, SectionHeader, StatusPill } from '../../../shared/components';
import { useAppDispatch, useAppSelector } from '../../../store';
import { logout } from '../../auth/state/authSlice';
import { STAFF_ATTENDANCE_MODULE_KEY } from '../../../navigation/AppNavigator';

/** Height of the profile card's overhang below the header gradient. */
const CARD_OVERLAP = 56;

function initials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(s => s.auth.user);
  const canStaffAttendance = (user?.allowedModules ?? []).includes(STAFF_ATTENDANCE_MODULE_KEY);
  const enrollment = useAppSelector(s => s.staffAttendance.enrollment);
  const lastSync = useAppSelector(s => s.offlineSync.lastSyncTimestamp);
  const isAdmin = user?.role === 'admin';

  const handleLogout = () => {
    Alert.alert('Log out?', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Profile"
          subtitle="Account settings and information"
          gradientColors={moduleAccent.profile.gradient}
          overlap={CARD_OVERLAP}
        />

        <View style={styles.body}>
          <Card elevation="md" padding="lg" style={styles.profileCard}>
            <View style={styles.profileRow}>
              <LinearGradient
                colors={gradients.brandFlat}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{initials(user?.name ?? '?')}</Text>
              </LinearGradient>

              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {user?.name}
                </Text>
                <Text style={styles.profileMeta} numberOfLines={1}>
                  {user?.email}
                </Text>
                <StatusPill
                  label={isAdmin ? 'Admin' : 'Teacher'}
                  tone={isAdmin ? 'info' : 'brand'}
                  icon={isAdmin ? 'shield' : 'user'}
                  style={styles.roleBadge}
                />
              </View>
            </View>
          </Card>

          {canStaffAttendance && (
            <View style={styles.section}>
              <SectionHeader eyebrow="Device & security" title="Enrollment" />
              <Card elevation="sm" padding="none">
                <SettingsRow
                  icon="user-check"
                  iconTint={enrollment.hasRecord ? colors.success : colors.warning}
                  title="Face Enrollment"
                  subtitle={enrollment.hasRecord ? 'Active on this device' : 'Not enrolled yet'}
                  subtitleTone={enrollment.hasRecord ? colors.successText : colors.warningText}
                  onPress={() =>
                    (navigation as any).navigate('StaffAttendance', { screen: 'FaceEnrollment' })
                  }
                />
              </Card>
            </View>
          )}

          {isAdmin && (
            <View style={styles.section}>
              <SectionHeader eyebrow="Administration" title="School" />
              <Card elevation="sm" padding="none">
                <SettingsRow
                  icon="bar-chart-2"
                  iconTint={moduleAccent.admin.solid}
                  title="Admin Dashboard"
                  subtitle="Attendance overview and pending approvals"
                  onPress={() => (navigation as any).navigate('AdminDashboard')}
                />
                <View style={styles.divider} />
                <SettingsRow
                  icon="bell"
                  iconTint={moduleAccent.announcements.solid}
                  title="Announcements"
                  subtitle="Notices for staff and students"
                  onPress={() => (navigation as any).navigate('Announcements')}
                />
              </Card>
            </View>
          )}

          <View style={styles.section}>
            <SectionHeader eyebrow="App info" title="About" />
            <Card elevation="sm" padding="none">
              <InfoRow label="App version" value="1.0.0" />
              <View style={styles.divider} />
              <InfoRow label="Last sync" value={formatSyncTime(lastSync)} />
              <View style={styles.divider} />
              <InfoRow label="Signed in as" value={user?.username ?? '—'} />
            </Card>
          </View>

          <Button
            label="Log out"
            icon="log-out"
            variant="danger"
            onPress={handleLogout}
            style={styles.logout}
          />

          <Text style={styles.footerText}>Teacher App · v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingsRow({
  icon,
  iconTint,
  title,
  subtitle,
  subtitleTone,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  iconTint: string;
  title: string;
  subtitle: string;
  subtitleTone?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      dimOnPress
      activeScale={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={styles.row}
    >
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(iconTint, 0.12) }]}>
        <Feather name={icon} size={18} color={iconTint} />
      </View>

      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={[styles.rowSubtitle, !!subtitleTone && { color: subtitleTone }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <Feather name="chevron-right" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  profileCard: {
    marginBottom: spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h2,
    color: colors.textInverse,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...typography.h3,
    color: colors.text,
  },
  profileMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
    marginBottom: spacing.sm,
  },
  roleBadge: {
    alignSelf: 'flex-start',
  },
  section: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd + 2,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  rowSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 38 + spacing.smd,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd + 2,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.captionBold,
    color: colors.text,
    flexShrink: 1,
  },
  logout: {
    marginBottom: spacing.md,
  },
  footerText: {
    ...typography.small,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
