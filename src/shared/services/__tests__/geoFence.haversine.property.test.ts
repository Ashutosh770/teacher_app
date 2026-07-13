/**
 * Property-based tests for `haversineMeters` (design Correctness Property 1).
 *
 * Property 1: Distance symmetry & identity
 *   For all coordinates a,b:
 *     - haversineMeters(a,b) === haversineMeters(b,a)   (symmetry)
 *     - haversineMeters(a,a) === 0                       (identity)
 *     - haversineMeters(a,b) >= 0                        (non-negativity)
 *
 * **Validates: Requirements 2.2**
 */
import fc from 'fast-check';
import { haversineMeters, type LatLng } from '../geoFence';

/** Generator for a valid WGS84 coordinate pair. */
const latLng = (): fc.Arbitrary<LatLng> =>
  fc.record({
    latitude: fc.double({ min: -90, max: 90, noNaN: true }),
    longitude: fc.double({ min: -180, max: 180, noNaN: true }),
  });

describe('haversineMeters — Property 1: distance symmetry & identity', () => {
  it('is symmetric: haversineMeters(a,b) === haversineMeters(b,a)', () => {
    fc.assert(
      fc.property(latLng(), latLng(), (a, b) => {
        expect(haversineMeters(a, b)).toBe(haversineMeters(b, a));
      }),
    );
  });

  it('is zero on identical points: haversineMeters(a,a) === 0', () => {
    fc.assert(
      fc.property(latLng(), (a) => {
        expect(haversineMeters(a, a)).toBe(0);
      }),
    );
  });

  it('is non-negative: haversineMeters(a,b) >= 0', () => {
    fc.assert(
      fc.property(latLng(), latLng(), (a, b) => {
        expect(haversineMeters(a, b)).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
