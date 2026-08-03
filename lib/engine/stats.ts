/**
 * Per-day aggregation. Segments are split across local midnights so every
 * DayStat reflects exactly its own calendar day.
 */
import type { DayStat, MoveMode, Place, PointColumns, Segment } from "../types";
import { dayKey } from "../utils";
import { lowerBound } from "./clean";

export function aggregateDays(
  segments: Segment[],
  places: Place[],
  pts: PointColumns
): DayStat[] {
  const byDay = new Map<string, DayStat>();
  const homeId = places.find((p) => p.label === "home")?.id;
  const workId = places.find((p) => p.label === "work")?.id;

  const get = (key: string): DayStat => {
    let d = byDay.get(key);
    if (!d) {
      d = {
        date: key,
        distance: 0,
        travelTime: 0,
        tripCount: 0,
        visitCount: 0,
        placeIds: [],
        firstMove: null,
        lastMove: null,
        timeAtHome: 0,
        timeAtWork: 0,
        timeOutside: 0,
        maxSpeed: 0,
        modes: {},
      };
      byDay.set(key, d);
    }
    return d;
  };

  for (const seg of segments) {
    // Split the segment at local midnights.
    let cursor = seg.start;
    while (cursor < seg.end) {
      const key = dayKey(cursor);
      const d = new Date(cursor);
      const nextMidnight = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + 1
      ).getTime();
      const sliceEnd = Math.min(seg.end, nextMidnight);
      const sliceMs = sliceEnd - cursor;
      const day = get(key);

      if (seg.kind === "trip") {
        const frac = sliceMs / (seg.end - seg.start);
        day.distance += seg.distance * frac;
        day.travelTime += sliceMs;
        if (cursor === seg.start) day.tripCount++;
        if (day.firstMove === null || cursor < day.firstMove) day.firstMove = cursor;
        if (day.lastMove === null || sliceEnd > day.lastMove) day.lastMove = sliceEnd;
        if (seg.maxSpeed && seg.maxSpeed > day.maxSpeed) day.maxSpeed = seg.maxSpeed;
        const mode: MoveMode = seg.mode;
        day.modes[mode] = (day.modes[mode] ?? 0) + seg.distance * frac;
        day.timeOutside += sliceMs;
      } else {
        if (cursor === seg.start) {
          day.visitCount++;
          if (seg.placeId && !day.placeIds.includes(seg.placeId))
            day.placeIds.push(seg.placeId);
        }
        if (seg.placeId === homeId && homeId) day.timeAtHome += sliceMs;
        else {
          day.timeOutside += sliceMs;
          if (seg.placeId === workId && workId) day.timeAtWork += sliceMs;
        }
      }
      cursor = sliceEnd;
    }
  }

  // Fold in observed max speeds from raw points (covers gaps in segments).
  for (const day of byDay.values()) {
    const start = new Date(day.date + "T00:00:00").getTime();
    const end = start + 24 * 3600_000;
    const a = lowerBound(pts.t, start);
    const b = lowerBound(pts.t, end);
    for (let i = a; i < b; i++) {
      const s = pts.speed[i];
      if (!Number.isNaN(s) && s < 350 && s > day.maxSpeed) day.maxSpeed = s;
    }
  }

  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
