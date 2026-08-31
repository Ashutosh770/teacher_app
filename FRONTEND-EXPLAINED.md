# Mobile Frontend — Explained

React Native app for KVS teachers. Built with Expo SDK 57 (managed workflow), TypeScript in `strict` mode.

Read [`../HANDOVER.md`](../HANDOVER.md) first for the system-wide picture.

---

## 1. Quick facts

| Thing | Value |
| --- | --- |
| Framework | Expo ~57.0.4, React Native 0.86.0, React 19.2.3 |
| Language | TypeScript ~6.0.3, `strict` (extends `expo/tsconfig.base`) |
| State | Redux Toolkit + react-redux, one slice per module |
| Navigation | React Navigation — native-stack (root) + bottom-tabs (main) |
| Camera | `react-native-vision-camera` 4.7.3 + `react-native-vision-camera-face-detector` |
| On-device ML | `react-native-fast-tflite` (MobileFaceNet) |
| Storage | `expo-secure-store` (tokens) + `@react-native-async-storage/async-storage` (cache) |
| Tests | Jest + `jest-expo` + `fast-check` (property tests) |
| Android minSdk | 26 (Android 8.0) — forced by the face detector's ML Kit dependency |
| Package id | `com.anonymous.app` |

**This app will not run in Expo Go.** It needs an EAS dev client because vision-camera and TFLite are native modules.

---

## 2. Commands

```bash
npm install
```

```bash
npm run android
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npx tsc --noEmit
```

`npm run dev` and `npm run android` both run `scripts/dev-network.js` first.

### What `dev-network.js` does

A physical Android device can reach the backend two ways, and each fails differently:

- `http://localhost:5000` + `adb reverse` — works over USB, immune to IP changes, but the tunnel dies on unplug, device reboot, or an adb server restart.
- `http://<LAN IP>:5000` — survives unplugging, but the address is DHCP-assigned and changes silently. Hostname resolution is not an option; this Android device resolves neither mDNS nor NetBIOS on the dev network.

So the script does both. It writes the current LAN address into `.env` and establishes the USB tunnel as a fallback.

```bash
node scripts/dev-network.js --print
```

```bash
node scripts/dev-network.js --usb
```

It filters out Hyper-V/WSL virtual adapters by name — those hold ordinary-looking `172.x` addresses that no device can route to.

**Never hand-edit `EXPO_PUBLIC_API_BASE_URL` in `app/.env`.** The script overwrites it on every dev start.

---

## 3. Folder structure

```
app/
├── App.tsx                  root: splash hold, providers, sync hydration
├── index.ts                 registerRootComponent
├── app.json                 Expo config: permissions, plugins, splash
├── scripts/
│   ├── dev-network.js       LAN IP detection + adb reverse tunnel
│   ├── adb-reverse.js       standalone tunnel helper
│   └── rasterize-logo.js    regenerates assets/kvs-logo.png from the SVG
├── patches/                 patch-package output (runs on postinstall)
├── assets/models/           mobilefacenet.tflite, blazeface.tflite (PLACEHOLDERS)
└── src/
    ├── store/index.ts       Redux store, typed hooks, queue persistence subscriber
    ├── navigation/
    │   ├── AppNavigator.tsx root stack + bottom tabs, auth/role gating
    │   └── TabBar.tsx       custom tab bar
    ├── modules/<name>/      one folder per feature
    │   ├── screens/
    │   ├── components/
    │   ├── services/        async logic — dispatches plain slice actions
    │   ├── state/           Redux slice
    │   └── index.ts         public surface of the module
    └── shared/
        ├── components/      UI primitives (Button, Card, Input, ...)
        ├── services/        api, faceCapture, faceMatch, geoFence, liveness, storage, ...
        ├── config/          attendanceConfig, reactotron
        ├── hooks/           useNetworkStatus, useSyncStatus
        ├── theme/           colors, spacing, typography, shadows, motion
        └── types/           shared TypeScript types
```

### Module convention

Every feature is a folder under `src/modules/`. The pattern is consistent:

- `screens/` — React components.
- `state/<name>Slice.ts` — a Redux Toolkit slice. Reducers are **pure**; they apply transitions, they do not decide them.
- `services/<name>Service.ts` — async orchestration. Calls the API, then dispatches plain slice actions.
- `index.ts` — what the rest of the app may import.

Async logic lives in `services/`, **not** in `createAsyncThunk`. The reference implementation is `offlineSync/services/syncService.ts`. `authSlice` imports `createAsyncThunk`, but thunks are not the general pattern here.

Modules: `adminDashboard`, `announcement`, `attendance`, `auth`, `classDiary`, `home`, `leaveManagement`, `offlineSync`, `profile`, `registration`, `staffAttendance`, `studentAttendance`, `studentMarks`, `timeTable`.

---

## 4. App startup sequence

`App.tsx`:

1. At **module scope** (before first render), calls `SplashScreen.preventAutoHideAsync()`. Without this the native splash hides as soon as the root view attaches — a beat before first paint — leaving a flash of blank background.
2. Wraps everything in `ErrorBoundary` → `SafeAreaProvider` → Redux `Provider` → `AppNavigator`.
3. On mount, hides the native splash and calls `hydrateSyncQueue()` to restore queued offline actions from the last session.

`SafeAreaProvider` must wrap the navigator. Screens use `headerShown: false` and sit under the status bar, so React Navigation's built-in compat provider is not enough.

`AppNavigator`:

1. Shows `BrandSplash` while `restoreSession()` resolves. The native splash and `BrandSplash` are visually identical, so the handover is invisible — the emblem just starts animating.
2. Calls `useOfflineSyncProcessor()` once, inside the Provider, to drive the sync queue.
3. If authenticated, renders `RegistrationGate` → `MainTabs`. If not, renders `LoginScreen`.

The splash owns its own exit timing (`isSplashVisible` is tracked separately from `isBootstrapping`) so it always plays its fade, even when session restore resolves instantly.

---

## 5. Navigation map

**Bottom tabs (5):** Home, Attendance, Leave, Timetable, Profile.

Everything else is a pushed screen on the root stack, reached from Home's quick-action cards: Student Attendance, Student Marks, Class Diary, Announcements, Admin Dashboard.

```
Root Stack
├── (unauthenticated) Login
└── (authenticated)
    ├── Main → RegistrationGate → MainTabs
    │   ├── Home
    │   ├── Attendance → StaffAttendanceNavigator
    │   │   ├── AttendanceTabScreen   (staff / student mode switcher)
    │   │   └── FaceEnrollment
    │   ├── Leave → LeaveManagementNavigator
    │   │   ├── LeaveManagementHome
    │   │   └── LeaveStatus
    │   ├── Timetable
    │   └── Profile
    ├── StudentAttendance          (gated by allowedModules)
    ├── StudentFaceEnrollment
    ├── StudentMarks
    ├── ClassDiary
    ├── Announcements
    └── AdminDashboard             (admin only)
```

### Two gating mechanisms

1. **Role** — `user.role === 'admin'` controls the Admin Dashboard route.
2. **`allowedModules`** — a string array on the user. `'staffAttendance'` and `'studentAttendance'` control the Attendance tab's visibility and the per-screen `PermissionGate`. The keys match the folder names under `src/modules/` and the store slice keys.

### Lazy loading matters here

The attendance routes use `getComponent={() => require(...)}` rather than `component`. That keeps the `react-native-vision-camera` import chain out of app boot.

Loaded eagerly, that chain runs before the Login screen mounts. On any platform vision-camera does not support — web, or a native module not ready when the JS bundle first executes — the result is a blank screen with no catchable render error.

---

## 6. State management

`src/store/index.ts` wires 11 slices: `auth`, `staffAttendance`, `studentAttendance`, `leaveManagement`, `timeTable`, `studentMarks`, `classDiary`, `announcement`, `adminDashboard`, `offlineSync`, `registration`.

Two things happen there beyond the usual:

**Reactotron enhancer** — streams every action and state diff to the desktop app. `reactotron` is `null` outside `__DEV__`, so it is a no-op in production builds.

**Queue persistence subscriber** — `store.subscribe()` writes the offline sync queue to storage on every mutation. `persistQueue` guards against redundant writes with a reference comparison, so this is cheap for unrelated state changes.

Always use the typed hooks:

```ts
import { useAppDispatch, useAppSelector } from '../store';
```

Never import `useDispatch` / `useSelector` from `react-redux` directly.

---

## 7. The API client

`src/shared/services/api.ts` exports a singleton `apiService`.

It wraps `fetch` and returns a normalized `ApiResponse<T>` — `{ success, data?, error?, status? }` — rather than throwing.

### Methods

| Method | Use |
| --- | --- |
| `get` / `post` / `put` / `patch` / `delete` | JSON requests |
| `postForm` | multipart photo uploads |

### Three details that are load-bearing

**1. `status` is reported separately from `success`.**
Callers need to tell "the server rejected this" (a 404 meaning *no such record*) from "the request never arrived". Without it, every failure looks the same. It also decides whether a failure is worth queueing for offline retry — queueing a 4xx would retry forever against a request the server will always refuse.

**2. `unwrapEnvelope` detects by key, not with `??`.**
`body.data ?? body` looks equivalent but breaks on a legitimate `null` payload. `{"success":true,"data":null}` means "no record", and `??` returns the whole envelope, which callers read as a real result. That bug made a cleared attendance record still report "already marked" on every launch.

**3. `postForm` deliberately does not set `Content-Type`.**
The networking layer derives it from the `FormData` and appends the multipart boundary. Setting it by hand omits the boundary, and the server parses zero fields.

`postForm` uses `XMLHttpRequest` (not `fetch`) with a **120-second timeout**. Enrollment runs one face inference per pose on the server, on CPU. Timing out early is worse than waiting: the server still completes and stores the result while the app reports failure.

On transport failure, `error` is set to exactly the string `'Network error'`. Callers compare against that string to decide whether to queue for retry. The real cause goes in the additive `detail` field.

---

## 8. The face pipeline on the device

Four files, each with a distinct job:

| File | Job |
| --- | --- |
| `faceCapture.ts` | Wraps vision-camera. Start/stop preview, capture one frame. |
| `liveness.ts` | Pure. Folds ML Kit per-frame metrics into a liveness verdict. |
| `faceMatch/` | Provider abstraction — `real` (native) vs `mock` (deterministic). |
| `mobileFaceNet.ts` | On-device TFLite inference for offline matching. |

### `faceCapture.ts`

Captures at **1280×720**, not full sensor resolution.

Full resolution produces ~2.2 MB JPEGs, which took 12–14 seconds each to upload over Wi-Fi in testing. Long enough for a transient drop or Wi-Fi power saving to kill the transfer mid-flight, surfacing as an unhelpful "network unreachable".

720p is far more than the recognition needs. The server aligns and crops each face to 112×112 before embedding it, so a full-resolution capture is discarded detail that costs upload time and reliability.

Two typed errors let callers branch cleanly:

- `CameraInitError` — no usable camera. Offer the manual fallback.
- `CaptureTimeoutError` — no usable frame inside the 10-second window.

The service is free of React coupling. The mounted `<Camera>` binds its ref via `attachCamera`.

### `liveness.ts`

Three checks: face detected, pose OK, blink detected.

**Only the blink resists a spoof.** A printed photo satisfies "face detected" and "pose OK" trivially.

So a blink requires a genuine transition — eyes open, then closed. Merely observing closed eyes is not enough; a photo of someone with their eyes shut would otherwise pass.

`blinkDetected` is sticky once earned. It attests that a live person was present during this attempt; eyes reopening should not retract it.

Thresholds (`LIVENESS_THRESHOLDS`): eye closed below 0.25, eye open above 0.7 (the gap avoids flapping on noise), max yaw and pitch 25°. The pose tolerance is generous on purpose — a check strict enough to be annoying gets worked around by holding the tablet at an angle that satisfies it, rather than by looking at the camera.

This module is pure and frame-agnostic. The frame processor supplies metrics; this decides what they mean. That makes the rules unit-testable without a camera.

### `faceMatch/` — the provider abstraction

```
faceMatch/
├── index.ts          selects provider from attendanceConfig.faceMatchMode
├── types.ts          FaceMatchProvider contract
├── realProvider.ts   native ML Kit / TFLite path
├── mockProvider.ts   deterministic, for tests
└── mobileFaceNet.ts  TFLite inference
```

The contract is three methods: `matchOne` (staff 1:1), `matchRoster` (student 1:N), `deriveEnrollment`.

`realProvider.extractEmbedding` throws `ProviderUnavailableError` off-device (Expo Go, Jest, web). Callers catch that and fall back to manual entry rather than treating it as a match failure.

`cosineSimilarity` and `similarityToScore` are exported and pure — cosine in [-1, 1] maps linearly to a 0–100 confidence.

> **Important:** this whole layer is now secondary. Online attendance sends the photo to the server, which decides the match. The on-device provider exists for the offline path and for tests.

### `mobileFaceNet.ts`

Runs the bundled `.tflite` on device for offline matching.

It **must mirror** `face-recognition-service/app/models/mobile_embedding.py` exactly: same crop, same 112×112 input, same `(x - 127.5) / 128.0` normalisation, same L2 step.

The server generates the templates this matches against. Any divergence puts the two in different vector spaces and produces scores that look plausible and mean nothing. **If you change one, change the other.**

Everything here fails soft. `loadMobileModel()` returns `false` and logs rather than throwing — offline matching is an enhancement; online verification is the real path.

---

## 9. Face enrollment on the device

`src/shared/services/incrementalEnrollment.ts`.

### The five poses

```ts
ENROLLMENT_POSES = [
  { key: 'centre',   instruction: 'Look straight at the camera' },
  { key: 'left',     instruction: 'Turn your head slightly to the left' },
  { key: 'right',    instruction: 'Turn your head slightly to the right' },
  { key: 'up',       instruction: 'Tilt your chin up slightly' },
  { key: 'centre-2', instruction: 'Look straight ahead once more' },
]
```

Angles are deliberately **modest** — "slightly", not profiles. Verification captures someone square to a tablet, so a hard-profile template would never be the closest match to a real query. It would only add a way to match the wrong person.

Two frontal captures bracket the sequence, because that is the pose nearly every verification presents.

### Why per-pose, not batch

The old batch flow captured every pose on a timer and uploaded them together: ~12 MB and one face inference per pose in a single request. No chance to review a shot, no way to redo just the bad one, and a failure anywhere lost the whole session.

Now each pose is its own small round trip: capture → review → keep or retake → upload. The server stages it and only promotes the set on commit.

Re-uploading the same `poseIndex` overwrites the staged row. **The retake is not a special case.**

Minimum 3 poses to commit — enforced server-side. A reference built from one or two captures is usable enough to pass an immediate check and weak enough to degrade matching for that person indefinitely.

---

## 10. Geo-fence

`src/shared/services/geoFence.ts`.

Splits into pure math and device access, so the math is property-testable without native modules.

- `haversineMeters(a, b)` — great-circle distance. Symmetric, zero on identical points, never negative. Uses the IUGG mean Earth radius, and clamps before `asin` to guard floating-point overshoot.
- `evaluate(reading, school)` — pure. Returns exactly one of four statuses.
- `getReading(timeoutMs)` — wraps `expo-location`. Rejects with a typed `TimeoutError`.

### The four statuses

| Status | Meaning |
| --- | --- |
| `verified` | Inside the fence, accuracy acceptable, not mocked |
| `out_of_fence` | Too far from the school point |
| `unreliable_accuracy` | GPS fix worse than 30 m |
| `mock_detected` | Android mock-provider flag set |

`isMock` is only meaningful on Android. On iOS, detection is unsupported, so the reading is treated as not mocked and evaluation falls back to accuracy plus fence checks.

**The client's verdict is guidance only.** The backend recomputes distance server-side from the raw coordinates. A device that could assert its own verdict could mark attendance from anywhere.

---

## 11. Offline sync

Three pieces:

| File | Job |
| --- | --- |
| `offlineSync/state/offlineSyncSlice.ts` | Queue state, connectivity flag |
| `offlineSync/services/syncService.ts` | Queue/drain/retry logic |
| `offlineSync/services/queuePersistence.ts` | AsyncStorage snapshot |
| `offlineSync/hooks/useOfflineSyncProcessor.ts` | The driver, mounted once in `AppNavigator` |

### How it runs

1. A `NetInfo` listener mirrors connectivity into the slice. On reconnect it kicks off `processSyncQueue()` immediately.
2. A **5-second safety-net poll** runs while online with a non-empty queue. This guarantees a queued record clears within 5 seconds even if a reconnect event was missed.
3. The interval is torn down once the queue drains. `processSyncQueue` early-returns when already syncing, so it never tight-loops.

### Retry budget

| Module group | Max attempts | On exhaustion |
| --- | --- | --- |
| `staffAttendance`, `studentAttendance`, `faceEnrollment` | 5 | Retained as `failed` |
| Everything else | 3 | Default policy |

An explicit `maxAttempts` on the item always wins.

Queue capacity is 500 records. The queue is persisted on every mutation and rehydrated at app launch, so it survives restarts and reboots.

**Face enrollment is online-only.** The queue holds JSON, not raw photos. The backend's `faceEnrollment` sync handler returns a non-transient 400, so the client marks it failed rather than retrying forever.

---

## 12. Tunable constants

Everything tunable lives in `src/shared/config/attendanceConfig.ts`. One source of truth for both attendance flows and enrollment.

```ts
geoFence: {
  defaultRadiusMeters: 100,   minRadiusMeters: 10,   maxRadiusMeters: 500,
  readingTimeoutMs: 15000,    overallTimeoutMs: 30000,
  maxAccuracyMeters: 30,      maxAccuracyRetries: 3,
}
face: {
  staffThreshold: 80,          // 1:1, on a 0-100 scale
  studentThreshold: 75,        // 1:N
  captureWindowMs: 10000,
  matchTimeoutMs: 5000,        // on-device match
  scanMatchTimeoutMs: 15000,   // server round trip per frame
  maxStaffAttempts: 3,
  minEnrollmentImages: 5,
  scanFramesPerSecond: 2,
  consecutiveTimeoutLimit: 3,
  unresolvedCap: 50,
}
faceMatchMode: 'mock'
offline: { maxQueuedRecords: 500, maxSyncAttempts: 5 }
```

`scanMatchTimeoutMs` is 15 s, not 5 s, because it is a different operation from an on-device match. It uploads a photo and waits for detection plus a 1:N search. At 5 s every frame on a school network timed out, and three consecutive timeouts pause the scan — so the scan looked broken when it was only being cut off early.

`resolveGeoFenceRadius()` clamps a configured radius into `[10, 500]` and falls back to 100 when unset.

---

## 13. Shared UI components

`src/shared/components/index.ts` is the single import point. Screens compose from here rather than hand-rolling `TouchableOpacity` plus a local `StyleSheet` — that pattern produced eleven different card shadows and three different button heights before the redesign.

| Group | Components |
| --- | --- |
| Foundations | `Pressable` |
| Layout | `Card`, `GlassCard`, `ScreenHeader`, `SectionHeader` |
| Controls | `Button`, `Input` |
| Display | `StatusPill`, `ProgressBar`, `IconChip`, `StatTile`, `SyncStatusBadge` |
| States | `EmptyState`, `Skeleton` (+ `SkeletonCard`, `SkeletonList`), `BrandSplash` |
| Guards | `PermissionGate`, `ErrorBoundary` |

Design tokens come from `src/shared/theme`: `colors`, `gradients`, `moduleAccent`, `spacing`, `typography`, `borderRadius`, `shadows`, `motion`, plus `HIT_SLOP`, `MIN_TOUCH_TARGET` (44) and a `withAlpha(hex, opacity)` helper.

Use the tokens. Do not hardcode colours or spacing.

---

## 14. Storage

Two wrappers in `src/shared/services/storage.ts`. Always go through them — never import the storage libraries directly in module code.

| Wrapper | Backed by | Use for |
| --- | --- | --- |
| `secureStorage` | `expo-secure-store` | Tokens, credentials |
| `appStorage` | AsyncStorage | Cached data, sync queue, offline face templates |

---

## 15. Permissions and native config

Declared in `app.json`:

- **Android:** `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
- **iOS:** `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`

`minSdkVersion` is raised to **26** via `expo-build-properties`. `react-native-vision-camera-face-detector` declares minSdk 26 for ML Kit, and the manifest merger refuses to build against the Expo default of 24.

It was raised rather than forced with `tools:overrideLibrary`, which would build but risk calling APIs that do not exist at runtime. minSdk 26 is Android 8.0, and the attendance tablets are institution-provisioned, so nothing in the fleet is below it.

Splash config: `backgroundColor` is indigo-900 (`#312E81`) and the image is the KVS emblem at 180 dp. `BrandSplash` then draws exactly the same thing at the same size, so the JS handover is invisible. 180 dp rather than a token icon size because the emblem carries Devanagari text that is unreadable below roughly 160 dp.

`assets/kvs-logo.png` is regenerated from the SVG by `scripts/rasterize-logo.js`.

---

## 16. Testing

```bash
npm test
```

Jest with the `jest-expo` preset. `jest.setup.ts` runs after the environment is set up. `__mocks__/expo-secure-store.ts` provides a fake secure store.

The interesting tests are **property-based**, using `fast-check`. They cover the invariants that are easy to break and hard to spot:

| Test | Invariant |
| --- | --- |
| `offlineSync/.../queueDurability.property.test.ts` | Queued items survive persistence round trips |
| `staffAttendance/.../staffAttempt.property.test.ts` | Face attempt counting never exceeds the cap |
| `studentAttendance/.../scanCounter.property.test.ts` | Scan counters stay consistent |
| `studentAttendance/.../statusPrecedence.property.test.ts` | Manual overrides beat face results correctly |
| `studentAttendance/.../unresolvedFifo.property.test.ts` | Unresolved detections evict oldest-first at the cap |
| `shared/.../geoFence.haversine.property.test.ts` | Distance is symmetric, non-negative, zero on identity |
| `shared/.../geoFence.evaluate.property.test.ts` | Exactly one status per evaluation |

There is also `api.envelope.test.ts`, which locks in the `null`-payload behaviour described in section 7.

---

## 17. Gotchas specific to this app

**`faceMatchMode` is `'mock'`.** On-device matching returns deterministic fake results. Online attendance is unaffected — it goes to the server.

**Both `.tflite` files are placeholders.** 48 bytes and 44 bytes. Offline face matching cannot work until real weights land.

**Around 54 files are uncommitted.** A whole UI redesign. See gotcha 8.2 in the root handover doc. Commit it.

**Expo SDK 57 changed APIs.** `AGENTS.md` in this folder says it plainly: read the versioned docs at `https://docs.expo.dev/versions/v57.0.0/` before relying on remembered Expo APIs.

**`patch-package` runs on `postinstall`.** There is one patch: `@react-native+dev-middleware+0.86.0.patch`. If you upgrade React Native, that patch may need regenerating.

**The `venv/` folder in `app/` is not used by the app.** It is left over from tooling experiments.

**Reactotron on a physical device needs an explicit host.** Auto-detection works for the emulator and simulator only. Set `EXPO_PUBLIC_REACTOTRON_HOST` to your machine's LAN IP.
