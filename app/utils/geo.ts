/**
 * Lightweight geo helpers for "staff within N km" matching.
 *
 * The database has no PostGIS/geo index — coordinates are plain Float columns.
 * Strategy: use `boundingBox` to build a cheap lat/lng range prefilter for the
 * Prisma `where` clause, then refine the candidates with `haversineKm` (the
 * source of truth for whether a point is actually in range).
 *
 * Note: the bounding-box approximation degrades near the poles and across the
 * antimeridian. That is irrelevant for the India service area and is not
 * handled here.
 */

export const EARTH_RADIUS_KM = 6371;

/** ~km per degree of latitude (roughly constant). */
const KM_PER_DEG_LAT = 111.045;

export interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
}

/**
 * A lat/lng rectangle that fully contains the circle of `radiusKm` around the
 * given point. Over-selects slightly; refine matches with `haversineKm`.
 */
export function boundingBox(lat: number, lng: number, radiusKm: number): BoundingBox {
    const latDelta = radiusKm / KM_PER_DEG_LAT;
    // Longitude degrees shrink toward the poles; guard against cos → 0.
    const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
    const lngDelta = radiusKm / (KM_PER_DEG_LAT * cosLat);
    return {
        minLat: lat - latDelta,
        maxLat: lat + latDelta,
        minLng: lng - lngDelta,
        maxLng: lng + lngDelta,
    };
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((aLat * Math.PI) / 180) *
            Math.cos((bLat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}
