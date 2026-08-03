/**
 * Place clustering and home/work inference.
 *
 * Visits are greedily clustered into "places" (150 m radius). Home is the
 * place with the most overnight dwell (00:00–06:00); work is the non-home
 * place with the most weekday business-hours dwell (09:00–18:00).
 */
import type { Place, Segment, Visit } from "../types";
import { haversine, uid } from "../utils";

const PLACE_RADIUS_M = 150;

export function clusterPlaces(segments: Segment[]): Place[] {
  const places: Place[] = [];

  for (const seg of segments) {
    if (seg.kind !== "visit") continue;
    const v = seg;
    let best: Place | null = null;
    let bestD = PLACE_RADIUS_M;
    for (const p of places) {
      const d = haversine(p.lat, p.lng, v.lat, v.lng);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    const dwell = v.end - v.start;
    if (best) {
      // weighted centroid update
      const w = best.visitCount;
      best.lat = (best.lat * w + v.lat) / (w + 1);
      best.lng = (best.lng * w + v.lng) / (w + 1);
      best.visitCount++;
      best.totalDwell += dwell;
      best.firstSeen = Math.min(best.firstSeen, v.start);
      best.lastSeen = Math.max(best.lastSeen, v.end);
      if (v.name && (best.name.startsWith("Place ") || !best.name)) best.name = v.name;
      v.placeId = best.id;
    } else {
      const p: Place = {
        id: uid("p"),
        lat: v.lat,
        lng: v.lng,
        name: v.name ?? `Place ${places.length + 1}`,
        visitCount: 1,
        totalDwell: dwell,
        firstSeen: v.start,
        lastSeen: v.end,
        label: "other",
      };
      places.push(p);
      v.placeId = p.id;
    }
  }

  labelHomeAndWork(places, segments);
  return places.sort((a, b) => b.totalDwell - a.totalDwell);
}

function labelHomeAndWork(places: Place[], segments: Segment[]): void {
  const nightDwell = new Map<string, number>();
  const workDwell = new Map<string, number>();

  for (const seg of segments) {
    if (seg.kind !== "visit" || !seg.placeId) continue;
    accumulateWindowDwell(seg, 0, 6, false, nightDwell);
    accumulateWindowDwell(seg, 9, 18, true, workDwell);
  }

  let home: Place | undefined;
  let homeMs = 0;
  for (const p of places) {
    const ms = nightDwell.get(p.id) ?? 0;
    if (ms > homeMs) {
      homeMs = ms;
      home = p;
    }
  }
  if (home) {
    home.label = "home";
    if (home.name.startsWith("Place ")) home.name = "Home";
  }

  let work: Place | undefined;
  let workMs = 0;
  for (const p of places) {
    if (p === home) continue;
    const ms = workDwell.get(p.id) ?? 0;
    if (ms > workMs) {
      workMs = ms;
      work = p;
    }
  }
  // Require a meaningful amount of business-hours presence (≥ 20 h total).
  if (work && workMs > 20 * 3600_000) {
    work.label = "work";
    if (work.name.startsWith("Place ")) work.name = "Office";
  }
}

/** Sum the ms of a visit that fall inside a local-time window [h1,h2). */
function accumulateWindowDwell(
  v: Visit,
  h1: number,
  h2: number,
  weekdaysOnly: boolean,
  acc: Map<string, number>
): void {
  let cursor = v.start;
  // Cap iteration: extremely long visits still terminate quickly (day steps).
  while (cursor < v.end) {
    const d = new Date(cursor);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const winStart = dayStart + h1 * 3600_000;
    const winEnd = dayStart + h2 * 3600_000;
    const isWeekday = d.getDay() >= 1 && d.getDay() <= 5;
    if (!weekdaysOnly || isWeekday) {
      const overlap = Math.min(v.end, winEnd) - Math.max(v.start, winStart);
      if (overlap > 0) acc.set(v.placeId!, (acc.get(v.placeId!) ?? 0) + overlap);
    }
    cursor = dayStart + 24 * 3600_000;
  }
}
