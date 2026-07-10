# Staff Attendance (GPS + Face Scan)

This module marks staff attendance using an on-device geo-fence check (`expo-location`)
plus a face scan (`react-native-vision-camera` + a face-detector/embedding provider).

## ⚠️ Requires an EAS dev client — does NOT run in Expo Go

`react-native-vision-camera` and the face-detection/embedding model are **native modules**.
They are not part of the Expo Go runtime, so this feature will **not** work in Expo Go.

To run and test the GPS + face-scan flows on a device you must build a custom
[EAS development build](https://docs.expo.dev/develop/development-builds/introduction/):

```bash
# one-time
npm install -g eas-cli
eas login
eas build:configure

# build a dev client
eas build --profile development --platform android   # or ios
```

Then start the bundler with `npx expo start --dev-client` and open the app through the
installed dev client (not Expo Go).

### What still works without a device

- `npx tsc --noEmit` type-checks the whole project without native modules.
- Unit and property tests run against the **mock face-match provider** and pure helpers
  (geo-fence math, roster/scan state, offline queue), so CI needs no native build.

## Native configuration (see `app.json`)

- **Plugins:** `react-native-vision-camera` (camera permission text) and `expo-location`
  (location permission text).
- **iOS `infoPlist`:** `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`.
- **Android permissions:** `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.

## Installed native dependencies

| Package | Version | Purpose |
|---|---|---|
| `expo-location` | `~57.0.2` | GPS reading + Android mock-location flag |
| `react-native-vision-camera` | `^5.1.0` | Camera capture + frame processors |
| `expo-linking` | `~57.0.2` | `Linking.openSettings()` for blocked-permission deep link |

### Face model — deferred to task 6.4

The face **detection/embedding** package (e.g. a vision-camera v5-compatible
face-detector frame-processor plugin, or `react-native-fast-tflite` with a bundled
embedding model) is **intentionally not installed yet**. The exact package and a version
that resolves cleanly against `react-native-vision-camera@^5` on SDK 57 is decided when
the real `FaceMatchProvider` lands in **task 6.4**, behind the `FaceMatchProvider`
abstraction. Automated tests use the deterministic mock provider until then. This avoids
pinning an unverified/incorrect native package during setup.
