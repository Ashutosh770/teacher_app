/**
 * Unit tests for `getReading` in `shared/services/geoFence.ts` (task 5.2).
 *
 * `getReading` wraps `expo-location`'s `getCurrentPositionAsync` and the
 * `react-native` `Platform`, mapping a `LocationObject` into a
 * platform-normalized `GPSReading` and rejecting with a typed `TimeoutError`
 * when no fix arrives in time. Both native modules are mocked so the function
 * runs under the Node (jest-expo) test environment.
 *
 * `mockDetectionSupported` is derived from `Platform.OS` at module load, so each
 * platform scenario re-mocks `react-native` and re-`require`s the module via a
 * `jest.resetModules()` + `jest.doMock` helper (a fresh, injectable fake
 * `getCurrentPositionAsync` per load acts as the "fake location source").
 *
 * Covers:
 *  - successful reading field mapping,
 *  - mock-flag propagation across Android (detection supported) and iOS
 *    (detection unsupported → always not-mock),
 *  - unknown accuracy (`null`) mapped to `Infinity`, and
 *  - timeout rejection with a `TimeoutError`.
 *
 * Validates: Requirements 2.1, 2.3, 2.6
 */

type PlatformOS = 'android' | 'ios' | 'web';

interface LoadedModule {
  getReading: (timeoutMs: number) => Promise<import('../geoFence').GPSReading>;
  TimeoutError: typeof import('../geoFence').TimeoutError;
}

/**
 * (Re)loads `geoFence` with `Platform.OS` and an injected fake
 * `getCurrentPositionAsync`. Resetting the module registry forces the
 * module-load-time `MOCK_DETECTION_SUPPORTED` constant to be recomputed for the
 * requested platform.
 */
function loadGeoFence(
  os: PlatformOS,
  getCurrentPositionAsync: jest.Mock,
): LoadedModule {
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: os } }));
  jest.doMock('expo-location', () => ({
    getCurrentPositionAsync,
    Accuracy: { High: 4 },
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../geoFence') as LoadedModule;
}

/** Builds an `expo-location` `LocationObject`-shaped resolution. */
function makeLocation(overrides?: {
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  timestamp?: number;
  mocked?: boolean;
}) {
  return {
    coords: {
      latitude: overrides?.latitude ?? 12.9716,
      longitude: overrides?.longitude ?? 77.5946,
      accuracy: overrides?.accuracy === undefined ? 8 : overrides.accuracy,
      altitude: null,
      heading: null,
      speed: null,
      altitudeAccuracy: null,
    },
    timestamp: overrides?.timestamp ?? 1_700_000_000_000,
    mocked: overrides?.mocked,
  };
}

afterEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('geoFence.getReading — successful reading mapping', () => {
  it('maps coords/timestamp from the location source into a GPSReading', async () => {
    const source = jest.fn().mockResolvedValue(
      makeLocation({
        latitude: 40.7128,
        longitude: -74.006,
        accuracy: 12.5,
        timestamp: 1_699_999_999_000,
        mocked: false,
      }),
    );
    const { getReading } = loadGeoFence('android', source);

    const reading = await getReading(5000);

    expect(reading.latitude).toBe(40.7128);
    expect(reading.longitude).toBe(-74.006);
    expect(reading.accuracy).toBe(12.5);
    expect(reading.timestamp).toBe(1_699_999_999_000);
    // The source is asked for a fix exactly once.
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('maps a null accuracy to Infinity (treated as unreliable)', async () => {
    const source = jest.fn().mockResolvedValue(
      makeLocation({ accuracy: null }),
    );
    const { getReading } = loadGeoFence('android', source);

    const reading = await getReading(5000);

    expect(reading.accuracy).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('geoFence.getReading — mock-flag propagation', () => {
  it('Android: propagates location.mocked=true as isMock with detection supported', async () => {
    const source = jest.fn().mockResolvedValue(makeLocation({ mocked: true }));
    const { getReading } = loadGeoFence('android', source);

    const reading = await getReading(5000);

    expect(reading.mockDetectionSupported).toBe(true);
    expect(reading.isMock).toBe(true);
  });

  it('Android: location.mocked=false yields isMock=false with detection supported', async () => {
    const source = jest.fn().mockResolvedValue(makeLocation({ mocked: false }));
    const { getReading } = loadGeoFence('android', source);

    const reading = await getReading(5000);

    expect(reading.mockDetectionSupported).toBe(true);
    expect(reading.isMock).toBe(false);
  });

  it('iOS: detection unsupported and isMock=false even when location.mocked=true', async () => {
    const source = jest.fn().mockResolvedValue(makeLocation({ mocked: true }));
    const { getReading } = loadGeoFence('ios', source);

    const reading = await getReading(5000);

    expect(reading.mockDetectionSupported).toBe(false);
    expect(reading.isMock).toBe(false);
  });
});

describe('geoFence.getReading — timeout rejection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects with a TimeoutError when no fix arrives within timeoutMs', async () => {
    // A location source that never settles forces the internal timeout to win.
    const source = jest.fn().mockReturnValue(new Promise(() => {}));
    const { getReading, TimeoutError } = loadGeoFence('android', source);

    const promise = getReading(5000);
    // Attach rejection expectations up front so the rejection is always handled
    // when the fake timer fires (avoids an unhandled-rejection race).
    const assertion = Promise.all([
      expect(promise).rejects.toBeInstanceOf(TimeoutError),
      expect(promise).rejects.toMatchObject({ name: 'TimeoutError' }),
    ]);

    // Drive the internal setTimeout and flush the resulting rejection.
    await jest.advanceTimersByTimeAsync(5000);

    await assertion;
  });

  it('does not reject before timeoutMs elapses', async () => {
    const source = jest.fn().mockReturnValue(new Promise(() => {}));
    const { getReading } = loadGeoFence('android', source);

    const promise = getReading(5000);
    let settled = false;
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await jest.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);

    // Let it reject afterwards so there is no unhandled rejection.
    await jest.advanceTimersByTimeAsync(1);
    await expect(promise).rejects.toBeInstanceOf(Error);
  });
});
