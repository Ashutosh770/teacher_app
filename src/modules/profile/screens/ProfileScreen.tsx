import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { borderRadius, colors, spacing, typography, withAlpha } from '../../../shared/theme';
import { StatusPill } from '../../../shared/components';
import { useAppDispatch, useAppSelector } from '../../../store';
import { logout } from '../../auth/state/authSlice';
import { STAFF_ATTENDANCE_MODULE_KEY } from '../../../navigation/AppNavigator';

const PROFILE_BLUE = '#2563EB';
const PROFILE_BLUE_DARK = '#1D4ED8';

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

  const handleLogout = () => {
    Alert.alert('Log out?', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[PROFILE_BLUE, PROFILE_BLUE_DARK]} style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Text style={styles.headerSubtitle}>Account settings and information</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <LinearGradient colors={[PROFILE_BLUE, colors.purple]} style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(user?.name ?? '?')}</Text>
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileMeta}>@{user?.username}</Text>
              <StatusPill
                label={user?.role === 'admin' ? 'Admin' : 'Teacher'}
                tone={user?.role === 'admin' ? 'info' : 'success'}
                style={styles.roleBadge}
              />
            </View>
          </View>
        </View>

        {canStaffAttendance && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Device & Security</Text>
            <View style={styles.listCard}>
              <TouchableOpacity
                style={styles.listRow}
                onPress={() => (navigation as any).navigate('StaffAttendance', { screen: 'FaceEnrollment' })}
                accessibilityRole="button"
              >
                <View style={styles.listRowLeft}>
                  <Feather name="shield" size={20} color={colors.textSecondary} />
                  <View>
                    <Text style={styles.listRowTitle}>Face Enrollment</Text>
                    <Text
                      style={[
                        styles.listRowSubtitle,
                        { color: enrollment.hasRecord ? colors.success : colors.warning },
                      ]}
                    >
                      {enrollment.hasRecord ? 'Active' : 'Not enrolled'}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={20} color={colors.disabled} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Info</Text>
          <View style={styles.listCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>App Version</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={[styles.infoRow, styles.infoRowLast]}>
              <Text style={styles.infoLabel}>Last Sync</Text>
              <Text style={styles.infoValue}>{formatSyncTime(lastSync)}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} accessibilityRole="button">
          <Feather name="log-out" size={18} color={colors.error} />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>Teacher App</Text>
      </ScrollView>
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
  headerTitle: {
    ...typography.h2,
    color: colors.surface,
  },
  headerSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.xs,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
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
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h2,
    color: colors.surface,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  profileMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  roleBadge: {
    alignSelf: 'flex-start',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  listRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  listRowTitle: {
    ...typography.body,
    color: colors.text,
    marginBottom: 2,
  },
  listRowSubtitle: {
    ...typography.small,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.error, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(colors.error, 0.3),
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  logoutButtonText: {
    ...typography.bodyBold,
    color: colors.error,
  },
  footerText: {
    ...typography.small,
    color: colors.disabled,
    textAlign: 'center',
  },
});
