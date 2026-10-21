// Distances and walking estimates. Pure; no I/O.

export type LatLon = { latitude: number; longitude: number };

/** A location to search around, e.g. a Cost Rental home. */
export type Anchor = LatLon & { key: string; label: string };

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle ("straight line") distance in metres. */
export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Streets aren't straight: assume the walk is 30% longer than the straight line. */
export const WALK_DETOUR = 1.3;
export const WALK_KMH = 5;

/** Walking time estimate in whole minutes, rounded up (at least 1). Always label it an estimate. */
export function walkMinutes(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    throw new Error("distance must be a non-negative number");
  }
  const minutes = ((distanceM * WALK_DETOUR) / 1000 / WALK_KMH) * 60;
  return Math.max(1, Math.ceil(minutes - 1e-9));
}

/** "0.4 km": kilometres with one decimal place. */
export function formatKm(distanceM: number): string {
  return `${(Math.round(distanceM / 100) / 10).toFixed(1)} km`;
}

/** Round to 3 decimal places (~110 m north–south, ~70 m east–west in Ireland). */
export function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function isValidLatLon(point: LatLon): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

/** The island of Ireland, with a margin. Lookups outside it are refused. */
export function isInIreland(point: LatLon): boolean {
  return (
    isValidLatLon(point) &&
    point.latitude >= 51.2 &&
    point.latitude <= 55.6 &&
    point.longitude >= -11 &&
    point.longitude <= -5.3
  );
}

/** A latitude/longitude box that contains every point within `radiusM` of `center`. */
export function boundingBox(
  center: LatLon,
  radiusM: number,
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const cos = Math.max(0.01, Math.cos(toRad(center.latitude)));
  const dLon = dLat / cos;
  return {
    minLat: center.latitude - dLat,
    maxLat: center.latitude + dLat,
    minLon: center.longitude - dLon,
    maxLon: center.longitude + dLon,
  };
}

/** Stable key for an ad-hoc location (e.g. an address typed on /places). */
export function locationKey(point: LatLon): string {
  return `geo:${roundCoord(point.latitude).toFixed(3)},${roundCoord(point.longitude).toFixed(3)}`;
}
