import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level crash guard. Without this, an uncaught error during render
 * anywhere in the tree unmounts the whole app with no on-screen trace — just
 * a blank screen — since React 18+ removes the tree on an unhandled render
 * error when no boundary is present. Logs to console too, so the error shows
 * up in the Metro terminal even when a remote debugger suppresses the
 * on-device red box.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          {!!this.state.error.stack && <Text style={styles.stack}>{this.state.error.stack}</Text>}
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.h2,
    color: colors.errorText,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.md,
  },
  stack: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
});
