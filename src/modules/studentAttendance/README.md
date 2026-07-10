# Student Attendance (Batch Face Scan)

This module marks student attendance from a roster using a batch face scan
(`react-native-vision-camera` + a face-detector/embedding provider), with GPS/geo-fence
context shared from the staff attendance flow.

## ⚠️ Requires an EAS dev client — does NOT run in Expo Go

`react-native-vision-camera` and the face-detection/embedding model are **native modules**
and are not available in the Expo Go runtime. This feature will **not** work in Expo Go.

Build a custom
[EAS development build](https://docs.expo.dev/develop/development-builds/introduction/)
to run the scan flow on a device:

```bash
# one-time
npm install -g eas-cli
eas login
eas build:configure

# build a dev client
eas build --profile development --platform android   # or ios
```

Then run `npx expo start --dev-client` and open the app through the dev client.

### What still works without a device

- `npx tsc --noEmit` type-checks the whole project without native modules.
- Unit and property tests run against the **mock face-match provider** and pure helpers
  (roster/scan state, unresolved-detection cap, submission narrowing), so CI needs no
  native build.

## Native configuration & dependencies

Native config (plugins, iOS `infoPlist`, Android permissions) and the installed native
dependencies are shared with the staff attendance flow — see
[`../staffAttendance/README.md`](../staffAttendance/README.md). The real face
detection/embedding package is deferred to **task 6.4** behind the `FaceMatchProvider`
abstraction; the mock provider is used until then.
