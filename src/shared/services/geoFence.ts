/**
 * Geo-fence service: pure distance math plus a total geo-fence evaluation.
 *
 * `haversineMeters` and `evaluate` are pure and PBT-friendly (no device access),
 * so they can be property-tested without native modules. GPS acquisition
 * (`getReading`) is declared on the interface but implemented separately in a
 * later task (5.1) where `expo-location` is wrapped.
 *
 * Requirements: 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { SchoolLocation } from '../types';
import { attendanceConfig, resolveGeoFenceRadius } from '../config/attendanceConfig';

/** A simple latitude/longitude coordinate pair (degrees). */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** A single device location sample. */
export interface GPSReading {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  isMock: boolean;
  mockDetectionSupported: boolean;
  timestamp: number;
}

/** Exactly one of these is reported per geo-fence evaluation. */
export type GeoFenceStatus =
  | 'verified'
  | 'out_of_fence'
  | 'unreliable_accuracy'
  | 'mock_detected';

/** The outcome of evaluating a GPS reading against a school location. */
export interface GeoFenceResult {
  status: GeoFenceStatus;
  distanceMeters: number;
  accuracyMeters: number;
  radiusMeters: number;
}

export interface GeoFenceService {
  /** Rejects with a typed TimeoutError if no reading within timeoutMs. */
  getReading(timeoutMs: number): Promise<GPSReading>;
  evaluate(reading: GPSReading, school: SchoolLocation): GeoFenceResult;
}

const EARTH_RADIUS_METERS = 6371008.8; // mean Earth radius (IUGG)

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in meters between two coordinates using the haversine
 * formula. Symmetric, zero on identical points, and always non-negative.
 *
 * Requirements: 2.2
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;

  // Clamp to [0,1] to guard against floating-point overshoot before asin.
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Determines whether a reading indicates a mock/simulated location.
 *
 * `isMock` is only meaningful when the platform can detect mock providers
 * (Android). When detection is unsupported (iOS), the reading is treated as
 * not mocked so evaluation falls back to accuracy + geo-fence checks.
 */
function isMockDetected(reading: GPSReading): boolean {
  return reading.mockDetectionSupported && reading.isMock;
}

/**
 * Evaluates a GPS reading against the configured school location, returning a
 * total result with exactly one status.
 *
 * The effective radius is resolved (and clamped to [10,500]) via
 * `resolveGeoFenceRadius`; the accuracy tolerance comes from
 * `attendanceConfig.geoFence.maxAccuracyMeters`.
 *
 * Status is `verified` iff (not mock) AND (accuracy <= tolerance) AND
 * (distance <= radius). For a non-verified reading a single deterministic
 * status is chosen by precedence:
 *   mock_detected > unreliable_accuracy > out_of_fence.
 *
 * Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 3.1
 */
export function evaluate(
  reading: GPSReading,
  school: SchoolLocation,
): GeoFenceResult {
  const radiusMeters = resolveGeoFenceRadius(school.radiusMeters);
  const tolerance = attendanceConfig.geoFence.maxAccuracyMeters;

  const distanceMeters = haversineMeters(reading, school);
  const accuracyMeters = reading.accuracy;

  const mocked = isMockDetected(reading);
  const accuracyReliable = accuracyMeters <= tolerance;
  const withinFence = distanceMeters <= radiusMeters;

  let status: GeoFenceStatus;
  if (!mocked && accuracyReliable && withinFence) {
    status = 'verified';
  } else if (mocked) {
    status = 'mock_detected';
  } else if (!accuracyReliable) {
    status = 'unreliable_accuracy';
  } else {
    status = 'out_of_fence';
  }

  return { status, distanceMeters, accuracyMeters, radiusMeters };
}

/**
 * Thrown by {@link getReading} when a GPS fix is not obtained within the
 * caller-provided `timeoutMs`. The `name` discriminant lets module services
 * branch on the failure kind without string-matching the message.
 *
 * Requirements: 1.6, 2.3, 17.1
 */
export class TimeoutError extends Error {
  readonly name = 'TimeoutError';

  constructor(message = 'GPS reading timed out') {
    super(message);
    // Restore the prototype chain for instanceof checks under transpiled targets.
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Mock-location detection is only available on Android via the `mocked` flag on
 * the location object. iOS provides no equivalent, so detection is reported as
 * unsupported and evaluation falls back to accuracy + geo-fence checks.
 *
 * Requirements: 2.6
 */
const MOCK_DETECTION_SUPPORTED = Platform.OS !== 'ios';

/**
 * Acquires a single GPS reading, mapping `expo-location`'s `LocationObject`
 * into a platform-normalized {@link GPSReading}.
 *
 * Rejects with a {@link TimeoutError} if no fix arrives within `timeoutMs`.
 * When the device reports an unknown accuracy (`null`, possible on Web) the
 * accuracy is treated as unreliable (`Infinity`) so downstream evaluation
 * cannot mistake it for a precise fix.
 *
 * On iOS `mockDetectionSupported` is `false` and `isMock` is always `false`.
 * On Android `isMock` is taken from the location object's `mocked` flag.
 *
 * Requirements: 1.5, 1.6, 2.1, 2.3, 2.6, 17.1
 */
export async function getReading(timeoutMs: number): Promise<GPSReading> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`GPS reading timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const location = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }),
      timeout,
    ]);

    const { coords } = location;
    const isMock = MOCK_DETECTION_SUPPORTED ? location.mocked === true : false;

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? Number.POSITIVE_INFINITY,
      isMock,
      mockDetectionSupported: MOCK_DETECTION_SUPPORTED,
      timestamp: location.timestamp,
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Concrete {@link GeoFenceService} wiring the device-backed `getReading` to the
 * pure `evaluate` function.
 */
export const geoFenceService: GeoFenceService = {
  getReading,
  evaluate,
};
