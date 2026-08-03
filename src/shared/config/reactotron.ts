import { Platform } from 'react-native';

/**
 * Reactotron wiring — Redux action/state timeline + API request/response log,
 * dev-only, native platforms only. Never runs in production builds, under
 * Jest, or on web (guards below); the whole module is a no-op import when
 * disabled so it's safe to import unconditionally from `store/index.ts`.
 *
 * Uses `require()` rather than a static `import` for the Reactotron packages
 * themselves — `import` statements are hoisted and always execute regardless
 * of any runtime conditional, and `reactotron-react-native`'s networking
 * plugin references the global `XMLHttpRequest`, which doesn't exist in the
 * Jest/Node test environment and throws at import time. A conditional
 * `require()` genuinely skips loading the module when the guard is false.
 *
 * The web exclusion isn't just belt-and-suspenders: `reactotron-react-native`
 * touches native-only APIs with no web shim, which fail silently at import
 * time (before React ever renders) — the exact same class of boot-time
 * blank-screen bug `react-native-vision-camera` caused when it was eagerly
 * imported (see `AppNavigator.tsx`). Reactotron isn't meant for web targets
 * anyway, so this is the correct guard, not a workaround.
 *
 * Reactotron's default host-detection works for the Android emulator and iOS
 * simulator, but a physical device needs your machine's LAN IP explicitly —
 * same requirement as `EXPO_PUBLIC_API_BASE_URL` (see `app/.env`). Override
 * via `EXPO_PUBLIC_REACTOTRON_HOST` when running on a physical device.
 */
const isTest = process.env.NODE_ENV === 'test';

export const reactotron =
  __DEV__ && !isTest && Platform.OS !== 'web'
    ? (() => {
        const Reactotron = require('reactotron-react-native').default;
        const { reactotronRedux } = require('reactotron-redux');
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const reactotronHost = process.env.EXPO_PUBLIC_REACTOTRON_HOST;
        return Reactotron.setAsyncStorageHandler(AsyncStorage)
          .configure({ name: 'Teacher App', ...(reactotronHost ? { host: reactotronHost } : {}) })
          // `networking: false` is load-bearing, not a preference.
          //
          // The networking plugin monkey-patches XMLHttpRequest to log every
          // request. It handles JSON bodies fine, but corrupts multipart
          // FormData carrying a `file://` URI — the upload fails at the
          // transport layer and surfaces to the app as a bare "Network error".
          //
          // That broke every photo upload (face enrollment and attendance
          // verification) while leaving ordinary JSON calls working, which made
          // it look like a server or tunnel problem: the same multipart request
          // sent with curl from the same device succeeded.
          //
          // The Redux action/state timeline — the actually useful part — is
          // unaffected and still enabled below.
          .useReactNative({ networking: false })
          .use(reactotronRedux())
          .connect();
      })()
    : null;
