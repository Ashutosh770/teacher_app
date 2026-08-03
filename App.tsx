import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import { hydrateSyncQueue } from './src/modules/offlineSync';
import { ErrorBoundary } from './src/shared/components';

export default function App() {
  useEffect(() => {
    // Restore any queued offline actions persisted before the last shutdown
    // so they are not lost across restarts/reboots (Req 15.1).
    void hydrateSyncQueue();
  }, []);

  return (
    // SafeAreaProvider must wrap the navigator for `useSafeAreaInsets` to report
    // real values. Screens rendered with `headerShown: false` sit under the
    // status bar and the bottom navigation/gesture bar otherwise — React
    // Navigation's built-in compat provider only covers its own chrome, which
    // these screens don't use.
    <ErrorBoundary>
      <SafeAreaProvider>
        <Provider store={store}>
          <AppNavigator />
        </Provider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
