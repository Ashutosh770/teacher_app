/**
 * Property-based tests for `evaluate` in `shared/services/geoFence.ts` (task 3.3).
 *
 * Validates design Correctness Property 2 (Geo-fence totality & clamping):
 * for any `GPSReading` and `SchoolLocation`, `evaluate`
 *   - returns exactly one valid `GeoFenceStatus`,
 *   - reports an effective radius clamped to `[10, 500]`, and
 *   - reports `verified` iff (not effective-mock) AND (accuracy <= tolerance)
 *     AND (distance <= radius).
 *
 * `evaluate` and `haversineMeters` are pure (no native/device access), so they
 * are property-tested directly. `geoFence.ts` transitively imports `react-native`
 * (`Platform`) and `expo-location` at module load for the device-backed
 * `getReading`; those native modules are mocked minimally so the pure helpers
 * under test can be imported in the Node test environment.
 *
 * Validates: Requirements 2.4, 2.5, 2.6, 2.7, 2.8, 3.1
 * Property: 2
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('expo-location', () => ({
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));

import fc from 'fast-check';
import type { SchoolLocation } from '../../types';
import {
  evaluate,
  haversineMeters,
  type GPSReading,
  type GeoFenceStatus,
} from '../geoFence';
import { attendanceConfig } from '../../config/attendanceConfig';

const VALID_STATUSES: readonly GeoFenceStatus[] = [
  'verified',
  'out_of_fence',
  'unreliable_accuracy',
  'mock_detected',
];

const { maxAccuracyMeters, minRadiusMeters, maxRadiusMeters, defaultRadiusMeters } =
  attendanceConfig.geoFence;

/** Finite latitude in the valid WGS84 range. */
const latitude = fc.double({ min: -90, max: 90, noNaN: true });
/** Finite longitude in the valid WGS84 range. */
const longitude = fc.double({ min: -180, max: 180, noNaN: true });

/**
 * Random GPS reading. Accuracy spans below/at/above the tolerance boundary
 * (including 0 and large values); both mock flags are exercised freely so the
 * "detection unsupported" fallback (isMock ignored) is covered.
 */
const gpsReadingArb: fc.Arbitrary<GPSReading> = fc.record({
  latitude,
  longitude,
  accuracy: fc.double({ min: 0, max: 1000, noNaN: true }),
  isMock: fc.boolean(),
  mockDetectionSupported: fc.boolean(),
  timestamp: fc.integer({ min: 0 }),
});

/**
 * Random school location. `radiusMeters` intentionally includes out-of-range
 * (negative, below 10, above 500), boundary, and non-finite/undefined-ish
 * values so the clamping + default fallback in `resolveGeoFenceRadius` is
 * exercised. Cast where we deliberately supply values outside the declared type.
 */
const schoolLocationArb: fc.Arbitrary<SchoolLocation> = fc.record({
  latitude,
  longitude,
  radiusMeters: fc.oneof(
    fc.double({ min: -1000, max: 2000, noNaN: true }),
    fc.constantFrom(minRadiusMeters, maxRadiusMeters, 0, -50, 5, 750),
    // undefined-ish inputs: exercise the default-radius fallback path
    fc.constant(undefined as unknown as number),
    fc.constant(null as unknown as number),
    fc.constant(NaN),
  ),
}) as fc.Arbitrary<SchoolLocation>;

describe('geoFence.evaluate — Property 2: totality & clamping', () => {
  it('always returns exactly one valid GeoFenceStatus', () => {
    fc.assert(
      fc.property(gpsReadingArb, schoolLocationArb, (reading, school) => {
        const result = evaluate(reading, school);
        expect(VALID_STATUSES).toContain(result.status);
      }),
    );
  });

  it('always reports an effective radius within [10, 500]', () => {
    fc.assert(
      fc.property(gpsReadingArb, schoolLocationArb, (reading, school) => {
        const result = evaluate(reading, school);
        expect(result.radiusMeters).toBeGreaterThanOrEqual(minRadiusMeters);
        expect(result.radiusMeters).toBeLessThanOrEqual(maxRadiusMeters);
      }),
    );
  });

  it('resolves the default radius when the configured radius is undefined-ish', () => {
    fc.assert(
      fc.property(
        gpsReadingArb,
        latitude,
        longitude,
        fc.constantFrom(
          undefined as unknown as number,
          null as unknown as number,
          NaN,
        ),
        (reading, lat, lng, badRadius) => {
          const school = {
            latitude: lat,
            longitude: lng,
            radiusMeters: badRadius,
          } as SchoolLocation;
          expect(evaluate(reading, school).radiusMeters).toBe(defaultRadiusMeters);
        },
      ),
    );
  });

  it('reports verified IFF not-effective-mock AND accuracy<=tolerance AND distance<=radius', () => {
    fc.assert(
      fc.property(gpsReadingArb, schoolLocationArb, (reading, school) => {
        const result = evaluate(reading, school);

        // Mock only counts when the platform can actually detect it.
        const effectiveMock = reading.mockDetectionSupported && reading.isMock;
        const accuracyOk = reading.accuracy <= maxAccuracyMeters;
        // Recompute distance independently via the exported haversine helper
        // against the same clamped radius the result reports.
        const distance = haversineMeters(reading, school);
        const withinFence = distance <= result.radiusMeters;

        const expectedVerified = !effectiveMock && accuracyOk && withinFence;

        expect(result.status === 'verified').toBe(expectedVerified);
      }),
    );
  });

  it('never reports mock_detected when mock detection is unsupported', () => {
    fc.assert(
      fc.property(
        gpsReadingArb,
        schoolLocationArb,
        (reading, school) => {
          const unsupported: GPSReading = {
            ...reading,
            mockDetectionSupported: false,
          };
          expect(evaluate(unsupported, school).status).not.toBe('mock_detected');
        },
      ),
    );
  });

  it('reports the same distance that haversineMeters computes', () => {
    fc.assert(
      fc.property(gpsReadingArb, schoolLocationArb, (reading, school) => {
        const result = evaluate(reading, school);
        expect(result.distanceMeters).toBe(haversineMeters(reading, school));
      }),
    );
  });
});
