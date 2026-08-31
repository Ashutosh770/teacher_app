import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppSelector } from '../../store';
import EmptyState from './EmptyState';
import { colors } from '../theme';

/**
 * PermissionGate — access-gating wrapper for module screens (Req 16.3/16.4).
 *
 * Reads the signed-in user's `allowedModules` from the auth slice and renders
 * an explicit "not authorized" view when `moduleKey` is absent, instead of the
 * gated screen body. This covers direct-navigation attempts (e.g. deep links or
 * programmatic navigation) that bypass the tab-level visibility gating in
 * `AppNavigator`, so an unauthorized user can never see the module content even
 * if they reach the route.
 *
 * When the module key is present the children are rendered unchanged, so the
 * gate is a transparent pass-through for authorized users.
 */
export interface PermissionGateProps {
  /** The `allowedModules` key required to view the children (e.g. 'staffAttendance'). */
  moduleKey: string;
  /** Human-readable module name used in the unauthorized message (optional). */
  moduleLabel?: string;
  children: React.ReactNode;
}

export default function PermissionGate({
  moduleKey,
  moduleLabel,
  children,
}: PermissionGateProps) {
  const allowedModules = useAppSelector(
    (state) => state.auth.user?.allowedModules ?? [],
  );
  const isAllowed = allowedModules.includes(moduleKey);

  if (!isAllowed) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="lock"
          tone="warning"
          title="Access restricted"
          message={
            moduleLabel
              ? `You don't have access to ${moduleLabel}. Contact your administrator if you believe this is a mistake.`
              : "You don't have access to this feature. Contact your administrator if you believe this is a mistake."
          }
        />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
