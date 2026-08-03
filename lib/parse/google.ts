/**
 * Parsers for every Google location export format, normalized into RawPoint /
 * SemanticVisit / SemanticTrip records.
 *
 * Formats handled:
 *  - Records.json                (raw location history, old & new key styles)
 *  - Semantic Location History   (timelineObjects: placeVisit / activitySegment)
 *  - Timeline.json (2024+ mobile export: semanticSegments / rawSignals)
 */
import type { MoveMode, RawPoint } from "../types";

export interface SemanticVisit {
  start: number;
  end: number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  confidence?: number;
}

export interface SemanticTrip {
  start: number;
  end: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distance?: number;
  mode: MoveMode;
  confidence?: number;
  waypoints?: { lat: number; lng: number; t?: number }[];
}

export interface ParsedBatch {
  points: RawPoint[];
  visits: SemanticVisit[];
  trips: SemanticTrip[];
}

export function emptyBatch(): ParsedBatch {
  return { points: [], visits: [], trips: [] };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function ts(v: unknown): number {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") {
    // "1690000000000" (timestampMs) or ISO string
    if (/^\d+$/.test(v)) return Number(v);
    const t = Date.parse(v);
    return Number.isNaN(t) ? NaN : t;
  }
  return NaN;
}

/** Parse "12.3456789°, 77.1234567°" or "geo:12.34,77.12" → [lat, lng]. */
function latLngStr(s: unknown): [number, number] | null {
  if (typeof s !== "string") return null;
  const m = s.match(/(-?\d+\.?\d*)[°]?\s*,\s*(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return [lat, lng];
}

const MODE_MAP: Record<string, MoveMode> = {
  WALKING: "walking",
  ON_FOOT: "walking",
  RUNNING: "running",
  CYCLING: "cycling",
  ON_BICYCLE: "cycling",
  IN_VEHICLE: "driving",
  IN_PASSENGER_VEHICLE: "driving",
  MOTORCYCLING: "driving",
  IN_TAXI: "driving",
  IN_BUS: "transit",
  IN_TRAIN: "transit",
  IN_SUBWAY: "transit",
  IN_TRAM: "transit",
  IN_FERRY: "transit",
  FLYING: "flying",
  STILL: "still",
  UNKNOWN_ACTIVITY_TYPE: "unknown",
};

export function normalizeMode(g: unknown): MoveMode {
  if (typeof g !== "string") return "unknown";
  return MODE_MAP[g.toUpperCase()] ?? "unknown";
}

/* ------------------------------------------------------------------ */
/* Records.json                                                        */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseRecordsItem(o: any): RawPoint | null {
  if (o == null) return null;
  const lat =
    o.latitudeE7 != null ? o.latitudeE7 / 1e7 : typeof o.latitude === "number" ? o.latitude : NaN;
  const lng =
    o.longitudeE7 != null
      ? o.longitudeE7 / 1e7
      : typeof o.longitude === "number"
        ? o.longitude
        : NaN;
  const t = ts(o.timestamp ?? o.timestampMs);
  if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(t)) return null;
  if (lat === 0 && lng === 0) return null;

  let activity: string | undefined;
  const act = o.activity?.[0]?.activity?.[0]?.type;
  if (typeof act === "string") activity = act;

  return {
    t,
    lat,
    lng,
    accuracy: typeof o.accuracy === "number" ? o.accuracy : undefined,
    altitude: typeof o.altitude === "number" ? o.altitude : undefined,
    speed: typeof o.velocity === "number" ? o.velocity : undefined,
    heading: typeof o.heading === "number" ? o.heading : undefined,
    source: typeof o.source === "string" ? o.source : undefined,
    activity,
  };
}

/* ------------------------------------------------------------------ */
/* Semantic Location History (timelineObjects)                         */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTimelineObject(o: any, out: ParsedBatch): void {
  if (o?.placeVisit) {
    const pv = o.placeVisit;
    const loc = pv.location ?? {};
    const start = ts(pv.duration?.startTimestamp ?? pv.duration?.startTimestampMs);
    const end = ts(pv.duration?.endTimestamp ?? pv.duration?.endTimestampMs);
    const lat = loc.latitudeE7 != null ? loc.latitudeE7 / 1e7 : NaN;
    const lng = loc.longitudeE7 != null ? loc.longitudeE7 / 1e7 : NaN;
    if (!Number.isNaN(start) && !Number.isNaN(end) && !Number.isNaN(lat)) {
      out.visits.push({
        start,
        end,
        lat,
        lng,
        name: loc.name,
        address: loc.address,
        confidence:
          typeof pv.visitConfidence === "number" ? pv.visitConfidence / 100 : undefined,
      });
    }
  } else if (o?.activitySegment) {
    const seg = o.activitySegment;
    const start = ts(seg.duration?.startTimestamp ?? seg.duration?.startTimestampMs);
    const end = ts(seg.duration?.endTimestamp ?? seg.duration?.endTimestampMs);
    const sl = seg.startLocation ?? {};
    const el = seg.endLocation ?? {};
    const sLat = sl.latitudeE7 != null ? sl.latitudeE7 / 1e7 : NaN;
    const sLng = sl.longitudeE7 != null ? sl.longitudeE7 / 1e7 : NaN;
    const eLat = el.latitudeE7 != null ? el.latitudeE7 / 1e7 : NaN;
    const eLng = el.longitudeE7 != null ? el.longitudeE7 / 1e7 : NaN;
    if ([start, end, sLat, sLng, eLat, eLng].some(Number.isNaN)) return;

    const waypoints: { lat: number; lng: number; t?: number }[] = [];
    const wp = seg.waypointPath?.waypoints;
    if (Array.isArray(wp)) {
      for (const w of wp) {
        if (w.latE7 != null) waypoints.push({ lat: w.latE7 / 1e7, lng: w.lngE7 / 1e7 });
      }
    }
    const raw = seg.simplifiedRawPath?.points;
    if (Array.isArray(raw)) {
      for (const p of raw) {
        if (p.latE7 != null)
          waypoints.push({
            lat: p.latE7 / 1e7,
            lng: p.lngE7 / 1e7,
            t: ts(p.timestamp ?? p.timestampMs),
          });
      }
    }

    out.trips.push({
      start,
      end,
      startLat: sLat,
      startLng: sLng,
      endLat: eLat,
      endLng: eLng,
      distance: typeof seg.distance === "number" ? seg.distance : undefined,
      mode: normalizeMode(seg.activityType),
      confidence:
        seg.confidence === "HIGH"
          ? 0.9
          : seg.confidence === "MEDIUM"
            ? 0.6
            : seg.confidence === "LOW"
              ? 0.3
              : undefined,
      waypoints: waypoints.length ? waypoints : undefined,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Timeline.json — 2024+ on-device export (semanticSegments)           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSemanticSegment(o: any, out: ParsedBatch): void {
  const start = ts(o?.startTime);
  const end = ts(o?.endTime);

  if (o?.visit) {
    const cand = o.visit.topCandidate ?? {};
    const ll = latLngStr(cand.placeLocation?.latLng ?? cand.placeLocation);
    if (ll && !Number.isNaN(start) && !Number.isNaN(end)) {
      out.visits.push({
        start,
        end,
        lat: ll[0],
        lng: ll[1],
        name: prettySemanticType(cand.semanticType),
        confidence:
          typeof o.visit.probability === "number"
            ? o.visit.probability
            : typeof cand.probability === "number"
              ? cand.probability
              : undefined,
      });
    }
    return;
  }

  if (o?.activity) {
    const a = o.activity;
    const s = latLngStr(a.start?.latLng ?? a.start);
    const e = latLngStr(a.end?.latLng ?? a.end);
    if (s && e && !Number.isNaN(start) && !Number.isNaN(end)) {
      out.trips.push({
        start,
        end,
        startLat: s[0],
        startLng: s[1],
        endLat: e[0],
        endLng: e[1],
        distance:
          typeof a.distanceMeters === "number"
            ? a.distanceMeters
            : parseFloat(a.distanceMeters) || undefined,
        mode: normalizeMode(a.topCandidate?.type),
        confidence:
          typeof a.topCandidate?.probability === "number" ? a.topCandidate.probability : undefined,
      });
    }
    return;
  }

  if (Array.isArray(o?.timelinePath)) {
    for (const p of o.timelinePath) {
      const ll = latLngStr(p.point);
      if (!ll) continue;
      let t = ts(p.time);
      if (Number.isNaN(t) && p.durationMinutesOffsetFromStartTime != null && !Number.isNaN(start)) {
        t = start + Number(p.durationMinutesOffsetFromStartTime) * 60000;
      }
      if (Number.isNaN(t)) continue;
      out.points.push({ t, lat: ll[0], lng: ll[1], source: "timelinePath" });
    }
  }
}

/** rawSignals entries from Timeline.json (position records). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseRawSignal(o: any, out: ParsedBatch): void {
  const pos = o?.position ?? o?.signal?.position;
  if (!pos) return;
  const ll = latLngStr(pos.LatLng ?? pos.latLng ?? pos.point);
  const t = ts(pos.timestamp ?? o?.signal?.timestamp ?? o?.timestamp);
  if (!ll || Number.isNaN(t)) return;
  out.points.push({
    t,
    lat: ll[0],
    lng: ll[1],
    accuracy:
      typeof pos.accuracyMeters === "number" ? pos.accuracyMeters : undefined,
    altitude: typeof pos.altitudeMeters === "number" ? pos.altitudeMeters : undefined,
    speed: typeof pos.speedMetersPerSecond === "number" ? pos.speedMetersPerSecond : undefined,
    source: typeof pos.source === "string" ? pos.source : "rawSignal",
  });
}

function prettySemanticType(t: unknown): string | undefined {
  if (typeof t !== "string") return undefined;
  const map: Record<string, string> = {
    TYPE_HOME: "Home",
    TYPE_WORK: "Work",
    TYPE_SEARCHED_ADDRESS: "Searched address",
    TYPE_ALIASED_LOCATION: "Saved place",
    UNKNOWN: "",
  };
  const v = map[t];
  return v === "" ? undefined : (v ?? t.replace(/^TYPE_/, "").replace(/_/g, " ").toLowerCase());
}
