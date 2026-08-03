/**
 * Point-cleaning pipeline: sort, de-duplicate, thin bursts, drop GPS jumps and
 * physically impossible movement, and surface data-quality anomalies.
 */
import type { Anomaly, PointColumns, RawPoint } from "../types";
import { haversine, uid } from "../utils";

export interface CleanResult {
  columns: PointColumns;
  kept: number;
  dropped: number;
  anomalies: Anomaly[];
}

const MAX_ACCURACY_M = 250; // fixes worse than this are noise
const MAX_SPEED_MS = 350; // ~1260 km/h — faster than any airliner cruise
const DUP_DIST_M = 8;
const DUP_TIME_MS = 12_000;
const KEEP_EVERY_MS = 60_000; // always keep a fix each minute to preserve dwell
const GAP_ANOMALY_MS = 6 * 3600_000;

export function cleanPoints(points: RawPoint[]): CleanResult {
  const anomalies: Anomaly[] = [];
  points.sort((a, b) => a.t - b.t);

  const n = points.length;
  const keep = new Uint8Array(n);
  let kept = 0;

  let lastKeptIdx = -1;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (p.accuracy != null && p.accuracy > MAX_ACCURACY_M) continue;
    if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) continue;

    if (lastKeptIdx >= 0) {
      const q = points[lastKeptIdx];
      const dt = p.t - q.t;
      if (dt <= 0) continue; // exact duplicate timestamp (or clock skew)

      const d = haversine(q.lat, q.lng, p.lat, p.lng);

      // Impossible-speed spike: needs extreme speed to reach this point AND the
      // next kept-candidate returns near the previous track → GPS jump.
      const v = d / (dt / 1000);
      if (v > MAX_SPEED_MS) {
        // check whether the jump is a lone outlier
        const next = findNextValid(points, i + 1);
        if (next !== -1) {
          const r = points[next];
          const dBack = haversine(q.lat, q.lng, r.lat, r.lng);
          const vBack = dBack / ((r.t - q.t) / 1000);
          if (vBack < MAX_SPEED_MS) {
            anomalies.push({
              id: uid("an"),
              t: p.t,
              type: "gps-jump",
              detail: `Point ${Math.round(d / 1000)} km away implies ${Math.round(
                v * 3.6
              )} km/h — dropped as GPS jump`,
              lat: p.lat,
              lng: p.lng,
              severity: "warn",
            });
            continue; // drop the outlier
          }
        }
        // Sustained extreme speed — keep the data but flag it.
        anomalies.push({
          id: uid("an"),
          t: p.t,
          type: "impossible-speed",
          detail: `Sustained ${Math.round(v * 3.6)} km/h over ${Math.round(d / 1000)} km`,
          lat: p.lat,
          lng: p.lng,
          severity: "high",
        });
      }

      // Burst thinning: nearly-stationary rapid fixes add nothing.
      if (dt < DUP_TIME_MS && d < DUP_DIST_M && p.t - points[lastKeptIdx].t < KEEP_EVERY_MS) {
        continue;
      }

      if (dt > GAP_ANOMALY_MS) {
        anomalies.push({
          id: uid("an"),
          t: q.t,
          type: "data-gap",
          detail: `No location data for ${(dt / 3600_000).toFixed(1)} h`,
          lat: q.lat,
          lng: q.lng,
          severity: "info",
        });
      }
    }

    keep[i] = 1;
    kept++;
    lastKeptIdx = i;
  }

  const columns: PointColumns = {
    t: new Float64Array(kept),
    lat: new Float64Array(kept),
    lng: new Float64Array(kept),
    speed: new Float32Array(kept),
    accuracy: new Float32Array(kept),
    altitude: new Float32Array(kept),
  };

  let j = 0;
  let prev: RawPoint | null = null;
  let prevT = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const p = points[i];
    columns.t[j] = p.t;
    columns.lat[j] = p.lat;
    columns.lng[j] = p.lng;
    // Derive speed from movement when the device didn't report one.
    let spd = p.speed;
    if (spd == null && prev) {
      const dt = (p.t - prevT) / 1000;
      if (dt > 0 && dt < 600) spd = haversine(prev.lat, prev.lng, p.lat, p.lng) / dt;
    }
    columns.speed[j] = spd ?? NaN;
    columns.accuracy[j] = p.accuracy ?? NaN;
    columns.altitude[j] = p.altitude ?? NaN;
    prev = p;
    prevT = p.t;
    j++;
  }

  return { columns, kept, dropped: n - kept, anomalies };
}

function findNextValid(points: RawPoint[], from: number): number {
  for (let i = from; i < Math.min(points.length, from + 5); i++) {
    const p = points[i];
    if (p.accuracy == null || p.accuracy <= MAX_ACCURACY_M) return i;
  }
  return -1;
}

/** Binary search: first index with t >= target. */
export function lowerBound(t: Float64Array, target: number): number {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
