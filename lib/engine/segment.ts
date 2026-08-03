/**
 * Segmentation: turn cleaned GPS points into visits (stops) and trips, then
 * merge with Google's own semantic segments where available. Semantic data
 * wins on overlap; inference fills the gaps.
 */
import type { MoveMode, PointColumns, Segment, Trip } from "../types";
import { haversine, uid } from "../utils";
import type { SemanticTrip, SemanticVisit } from "../parse/google";
import { lowerBound } from "./clean";

const STOP_RADIUS_M = 160;
const STOP_MIN_MS = 7 * 60_000;
const VISIT_MERGE_GAP_MS = 5 * 60_000;

/** Infer visits and trips purely from the point stream. */
export function inferSegments(pts: PointColumns): Segment[] {
  const n = pts.t.length;
  if (n === 0) return [];
  const segments: Segment[] = [];

  let i = 0;
  let tripStartIdx = 0;

  while (i < n) {
    // Try to grow a stop cluster anchored at i.
    let cLat = pts.lat[i];
    let cLng = pts.lng[i];
    let count = 1;
    let j = i + 1;
    while (j < n) {
      const d = haversine(cLat, cLng, pts.lat[j], pts.lng[j]);
      if (d > STOP_RADIUS_M) break;
      // rolling centroid
      count++;
      cLat += (pts.lat[j] - cLat) / count;
      cLng += (pts.lng[j] - cLng) / count;
      j++;
    }
    const dwell = pts.t[j - 1] - pts.t[i];

    if (dwell >= STOP_MIN_MS) {
      // Close out the trip that led here.
      if (tripStartIdx < i) {
        const trip = buildTrip(pts, tripStartIdx, i);
        if (trip) segments.push(trip);
      }
      segments.push({
        kind: "visit",
        id: uid("v"),
        start: pts.t[i],
        end: pts.t[j - 1],
        lat: cLat,
        lng: cLng,
        inferred: true,
      });
      tripStartIdx = j - 1;
      i = j;
    } else {
      i++;
    }
  }
  // trailing movement
  if (tripStartIdx < n - 1) {
    const trip = buildTrip(pts, tripStartIdx, n - 1);
    if (trip) segments.push(trip);
  }

  return mergeAdjacentVisits(segments);
}

function buildTrip(pts: PointColumns, a: number, b: number): Trip | null {
  if (b <= a) return null;
  let dist = 0;
  let maxSpeed = 0;
  for (let k = a + 1; k <= b; k++) {
    dist += haversine(pts.lat[k - 1], pts.lng[k - 1], pts.lat[k], pts.lng[k]);
    const s = pts.speed[k];
    if (!Number.isNaN(s) && s > maxSpeed) maxSpeed = s;
  }
  const dur = pts.t[b] - pts.t[a];
  if (dist < 250 || dur <= 0) return null; // ignore micro-movements
  const avg = dist / (dur / 1000);
  return {
    kind: "trip",
    id: uid("t"),
    start: pts.t[a],
    end: pts.t[b],
    startLat: pts.lat[a],
    startLng: pts.lng[a],
    endLat: pts.lat[b],
    endLng: pts.lng[b],
    distance: dist,
    mode: modeFromSpeed(avg, maxSpeed),
    ptRange: [a, b + 1],
    maxSpeed,
    avgSpeed: avg,
    inferred: true,
  };
}

export function modeFromSpeed(avg: number, max: number): MoveMode {
  if (avg < 1.9) return "walking";
  if (avg < 6.5) return "cycling";
  if (avg < 38 && max < 60) return "driving";
  if (avg < 90) return "transit";
  return "flying";
}

function mergeAdjacentVisits(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (
      s.kind === "visit" &&
      last?.kind === "visit" &&
      s.start - last.end < VISIT_MERGE_GAP_MS &&
      haversine(last.lat, last.lng, s.lat, s.lng) < STOP_RADIUS_M
    ) {
      last.end = s.end;
    } else {
      out.push(s);
    }
  }
  return out;
}

/** Merge semantic (Google-provided) segments with inferred ones. */
export function mergeSegments(
  inferred: Segment[],
  visits: SemanticVisit[],
  trips: SemanticTrip[],
  pts: PointColumns
): Segment[] {
  const semantic: Segment[] = [];

  for (const v of visits) {
    if (v.end <= v.start) continue;
    semantic.push({
      kind: "visit",
      id: uid("v"),
      start: v.start,
      end: v.end,
      lat: v.lat,
      lng: v.lng,
      name: v.name,
      address: v.address,
      confidence: v.confidence,
      inferred: false,
    });
  }

  for (const tr of trips) {
    if (tr.end <= tr.start) continue;
    const a = lowerBound(pts.t, tr.start);
    const b = lowerBound(pts.t, tr.end);
    let maxSpeed = 0;
    for (let k = a; k < b; k++) {
      const s = pts.speed[k];
      if (!Number.isNaN(s) && s > maxSpeed) maxSpeed = s;
    }
    const dur = (tr.end - tr.start) / 1000;
    const dist =
      tr.distance ?? haversine(tr.startLat, tr.startLng, tr.endLat, tr.endLng) * 1.3;
    semantic.push({
      kind: "trip",
      id: uid("t"),
      start: tr.start,
      end: tr.end,
      startLat: tr.startLat,
      startLng: tr.startLng,
      endLat: tr.endLat,
      endLng: tr.endLng,
      distance: dist,
      mode: tr.mode === "unknown" ? modeFromSpeed(dist / Math.max(dur, 1), maxSpeed) : tr.mode,
      confidence: tr.confidence,
      ptRange: b > a ? [a, b] : undefined,
      maxSpeed: maxSpeed || undefined,
      avgSpeed: dur > 0 ? dist / dur : undefined,
      inferred: false,
    });
  }

  semantic.sort((x, y) => x.start - y.start);
  if (semantic.length === 0) return inferred;

  // Keep inferred segments only where semantic data has no coverage.
  const result: Segment[] = [...semantic];
  for (const seg of inferred) {
    const overlap = coveredMs(seg.start, seg.end, semantic);
    const len = seg.end - seg.start;
    if (len > 0 && overlap / len < 0.35) result.push(seg);
  }
  result.sort((x, y) => x.start - y.start);
  return result;
}

/** Total ms of [start,end] covered by any of the sorted segments. */
function coveredMs(start: number, end: number, sorted: Segment[]): number {
  let covered = 0;
  for (const s of sorted) {
    if (s.end <= start) continue;
    if (s.start >= end) break;
    covered += Math.min(end, s.end) - Math.max(start, s.start);
  }
  return covered;
}
