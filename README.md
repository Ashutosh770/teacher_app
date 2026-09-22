# Teacher App

A React Native (Expo SDK 57) mobile app for school staff. It covers staff attendance with
face verification and geo-fencing, student attendance and marks, timetable, class diary,
announcements, leave management, an admin dashboard, and offline sync with a persisted
action queue.

> **This app cannot run in Expo Go.** It depends on `react-native-vision-camera` and
> `expo-dev-client`, which require a custom [development build](#3-build-and-run). Plan for
> one native build the first time you set the project up.

---

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | **22.13.0 or newer** | Required by Expo SDK 57. Check with `node -v`. |
| npm | 10+ | Ships with Node 22. |
| Git | any | — |
| **Android:** Android Studio | Latest | SDK Platform **36** (Android 16) + `ANDROID_HOME` set, `adb` on your `PATH`. |
| **Android:** JDK | **17** | Newer JDKs are not supported by React Native 0.86. |
| **iOS:** Xcode | **26.4 or newer** | macOS only. Includes CocoaPods via `pod` or `bundler`. |

Minimum devices supported: **Android 7+** and **iOS 16.4+**.

---

## 1. Clone and install

```bash
git clone <repository-url>
```

```bash
cd teacher_app
```

```bash
npm install
```

> `package-lock.json` is intentionally not committed, so use `npm install` — `npm ci` will
> fail without a lockfile.

---

## 2. Configure the backend URL

The app talks to an external REST API; no backend is included in this repository. Create a
`.env` file in the project root:

```bash
echo "EXPO_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1" > .env
```

| Variable | Default if unset | Description |
| --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `http://localhost:5000/api/v1` | Base URL of the backend API. |

Only variables prefixed with `EXPO_PUBLIC_` are inlined into the app bundle. **Restart the
Metro bundler after changing `.env`** — the value is baked in at build time, not read at
runtime.

**Running on a physical device?** `localhost` points at the phone itself, not your computer.
Use your machine's LAN IP instead:

```bash
echo "EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:5000/api/v1" > .env
```

The backend is expected to serve these routes: `/auth/login`, `/auth/logout`, `/auth/me`,
`/faces/enroll`, `/announcements`, `/leave-management`, `/staff-attendance/mark`,
`/staff-attendance/school-location`, and `/admin-dashboard/stats`.

---

## 3. Build and run

The `android/` and `ios/` folders are generated and git-ignored. The commands below run
`npx expo prebuild` automatically to create them on first use, compile the native app,
install it on your device or emulator, and start Metro.

### Android

```bash
npx expo run:android
```

### iOS (macOS only)

```bash
npx expo run:ios
```

### Subsequent runs

Once the development build is installed, you only need the bundler for JavaScript and
TypeScript changes — this is much faster:

```bash
npx expo start
```

Because `expo-dev-client` is installed, this targets your development build rather than
Expo Go. Rebuild with `run:android` / `run:ios` only when you add a native dependency or
change `app.json`.

### Cloud builds with EAS (no local Android/Xcode toolchain)

```bash
npm install -g eas-cli
```

```bash
eas build --platform android --profile development
```

```bash
eas build --platform ios --profile development
```

Install the resulting build on your device, then run `npx expo start` to connect to it.

### Web (limited)

```bash
npm run web
```

Useful for quick UI work only — the camera, face verification, and location features do not
work on web.

---

## 4. Tests and checks

Run the Jest suite:

```bash
npm test
```

Watch mode during development:

```bash
npm run test:watch
```

Type-check the project:

```bash
npx tsc --noEmit
```

Verify your dependencies match the SDK 57 requirements:

```bash
npx expo-doctor
```

---

## Available scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Metro bundler (targets the development build). |
| `npm run android` | Build, install, and run the Android app. |
| `npm run ios` | Build, install, and run the iOS app. |
| `npm run web` | Run in the browser via React Native Web. |
| `npm test` | Run the Jest test suite once. |
| `npm run test:watch` | Run Jest in watch mode. |

---

## Troubleshooting

**Stale bundle or unexpected module errors** — clear the Metro cache:

```bash
npx expo start --clear
```

**Native build is broken, or you changed `app.json` / config plugins** — regenerate the
native projects from scratch:

```bash
npx expo prebuild --clean
```

**Android build fails on the JDK** — confirm you are on JDK 17:

```bash
java -version
```

**`adb` not found / device not detected** — make sure `ANDROID_HOME` is set and
`platform-tools` is on your `PATH`, then confirm the device is visible:

```bash
adb devices
```

**iOS pods out of date** after a dependency change:

```bash
npx pod-install
```

**Camera or location prompts never appear** — these permissions are declared via config
plugins in `app.json`, so they only exist in a fresh native build. Run
`npx expo prebuild --clean` followed by `npx expo run:android` or `npx expo run:ios`.

---

## Project structure

```
App.tsx                  Root component: Redux provider + navigation, hydrates offline queue
index.ts                 Expo entry point
app.json                 Expo config: permissions, config plugins, icons
src/
  modules/               Feature modules, each with screens/, services/, state/
    adminDashboard/  announcement/  attendance/  auth/  classDiary/  home/
    leaveManagement/ offlineSync/   profile/     staffAttendance/
    studentAttendance/ studentMarks/ timeTable/
  navigation/            AppNavigator
  shared/                components, config, hooks, services (api, faceMatch, geoFence), theme, types
  store/                 Redux Toolkit store
__tests__/               Test suites
__mocks__/               Jest manual mocks for native/Expo modules
```

---

## Reference

- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
- [Development builds](https://docs.expo.dev/develop/development-builds/create-a-build/)
- [Set up your environment](https://docs.expo.dev/get-started/set-up-your-environment/)
