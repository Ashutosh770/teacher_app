# Native module mocks

Jest manual mocks for native/Expo modules that have no implementation in the
Node test environment. Mocks placed here that match a `node_modules` package
name are applied automatically to every test (no `jest.mock(...)` call needed).

Add a new file named after the module you need to stub (for example
`expo-location.ts`, `react-native-vision-camera.ts`) as later tasks introduce
those dependencies. Keep mocks small and behavior-focused (in-memory, deterministic)
so tests exercise real logic rather than the native layer.
