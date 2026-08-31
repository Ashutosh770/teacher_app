import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { store } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import { hydrateSyncQueue } from './src/modules/offlineSync';
import { ErrorBoundary } from './src/shared/components';

/**
 * Hold the NATIVE splash up until React has actually rendered a frame.
 *
 * Without this the native splash hides as soon as the root view is attached,
 * which is a beat before the first paint — leaving a flash of blank background
 * between the native splash and `BrandSplash`. Called at module scope so it
 * runs before the first render, not after it.
 *
 * The promise is deliberately swallowed: if the module is unavailable (it is on
 * web) or the splash has already gone, that is not worth failing app start over.
 */
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  useEffect(() => {
    // The native splash and `BrandSplash` are visually identical, so handing
    // over on first paint is seamless — the mark simply starts animating.
    void SplashScreen.hideAsync().catch(() => {});

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
