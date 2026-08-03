/**
 * UI-side derived analytics: everything the dashboard, analytics and report
 * views need, computed from a Dataset plus the active date-range filter.
 * Pure functions — cheap enough to memoize per filter change.
 */
import type { Dataset, DayStat, Place, Segment, Trip, Visit } from "../types";
import { dayKey } from "../utils";

export interface DateRange {
  /** inclusive YYYY-MM-DD keys; null = unbounded */
  from: string | null;
  to: string | null;
}

export function inRange(date: string, r: DateRange): boolean {
  if (r.from && date < r.from) return false;
  if (r.to && date > r.to) return false;
  return true;
}

export function filterDays(ds: Dataset, r: DateRange): DayStat[] {
  return ds.days.filter((d) => inRange(d.date, r));
}

export function filterSegments(ds: Dataset, r: DateRange): Segment[] {
  return ds.segments.filter((s) => inRange(dayKey(s.start), r) || inRange(dayKey(s.end), r));
}

export interface Totals {
  distance: number;
  travelTime: number;
  drivingTime: number;
  tripCount: number;
  visitCount: number;
  stopCount: number;
  placesVisited: number;
  activeDays: number;
  avgDailyDistance: number;
  avgWorkingHours: number; // ms average over days with work presence
  workingDays: number;
  timeAtHome: number;
  timeOutside: number;
  longestTrip: Trip | null;
  fastestTrip: Trip | null;
  maxSpeed: number;
  weekdayDistance: number;
  weekendDistance: number;
  firstFix: number;
  lastFix: number;
}

export function computeTotals(ds: Dataset, r: DateRange): Totals {
  const days = filterDays(ds, r);
  const segs = filterSegments(ds, r);
  const placeIds = new Set<string>();
  let longest: Trip | null = null;
  let fastest: Trip | null = null;
  let drivingTime = 0;
  let stopCount = 0;

  for (const s of segs) {
    if (s.kind === "trip") {
      if (!longest || s.distance > longest.distance) longest = s;
      const spd = s.avgSpeed ?? 0;
      if (spd > 0 && (!fastest || spd > (fastest.avgSpeed ?? 0))) fastest = s;
      if (s.mode === "driving") drivingTime += s.end - s.start;
    } else {
      stopCount++;
      if (s.placeId) placeIds.add(s.placeId);
    }
  }

  let distance = 0,
    travelTime = 0,
    tripCount = 0,
    visitCount = 0,
    timeAtHome = 0,
    timeOutside = 0,
    maxSpeed = 0,
    weekday = 0,
    weekend = 0,
    workDaysCount = 0,
    workMs = 0;

  for (const d of days) {
    distance += d.distance;
    travelTime += d.travelTime;
    tripCount += d.tripCount;
    visitCount += d.visitCount;
    timeAtHome += d.timeAtHome;
    timeOutside += d.timeOutside;
    if (d.maxSpeed > maxSpeed) maxSpeed = d.maxSpeed;
    const dow = new Date(d.date + "T12:00:00").getDay();
    if (dow === 0 || dow === 6) weekend += d.distance;
    else weekday += d.distance;
    if (d.timeAtWork > 30 * 60_000) {
      workDaysCount++;
      workMs += d.timeAtWork;
    }
  }

  return {
    distance,
    travelTime,
    drivingTime,
    tripCount,
    visitCount,
    stopCount,
    placesVisited: placeIds.size,
    activeDays: days.filter((d) => d.distance > 500 || d.visitCount > 0).length,
    avgDailyDistance: days.length ? distance / days.length : 0,
    avgWorkingHours: workDaysCount ? workMs / workDaysCount : 0,
    workingDays: workDaysCount,
    timeAtHome,
    timeOutside,
    longestTrip: longest,
    fastestTrip: fastest,
    maxSpeed,
    weekdayDistance: weekday,
    weekendDistance: weekend,
    firstFix: ds.stats.firstFix,
    lastFix: ds.stats.lastFix,
  };
}

/** Group day stats by month key YYYY-MM. */
export function byMonth(days: DayStat[]): Map<string, DayStat[]> {
  const m = new Map<string, DayStat[]>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    const arr = m.get(key);
    if (arr) arr.push(d);
    else m.set(key, [d]);
  }
  return m;
}

/** Visits within range, grouped per day and ordered — powers the timeline view. */
export function daySegments(ds: Dataset, date: string): Segment[] {
  return ds.segments.filter(
    (s) => dayKey(s.start) === date || dayKey(s.end) === date
  );
}

export function placeById(ds: Dataset, id?: string): Place | undefined {
  return id ? ds.places.find((p) => p.id === id) : undefined;
}

/** Top places by dwell within a range. */
export function topPlaces(ds: Dataset, r: DateRange, limit = 10): (Place & { rangeDwell: number; rangeVisits: number })[] {
  const dwell = new Map<string, { ms: number; visits: number }>();
  for (const s of filterSegments(ds, r)) {
    if (s.kind !== "visit" || !s.placeId) continue;
    const e = dwell.get(s.placeId) ?? { ms: 0, visits: 0 };
    e.ms += s.end - s.start;
    e.visits++;
    dwell.set(s.placeId, e);
  }
  return ds.places
    .filter((p) => dwell.has(p.id))
    .map((p) => ({
      ...p,
      rangeDwell: dwell.get(p.id)!.ms,
      rangeVisits: dwell.get(p.id)!.visits,
    }))
    .sort((a, b) => b.rangeDwell - a.rangeDwell)
    .slice(0, limit);
}

/** Attendance summary for the work place within a range. */
export interface Attendance {
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  lateArrivals: number;
  earlyDepartures: number;
  avgArrival: number | null; // minutes from midnight
  avgDeparture: number | null;
  avgCommuteMs: number | null;
  longestCommuteMs: number | null;
  shortestCommuteMs: number | null;
}

export function computeAttendance(
  ds: Dataset,
  r: DateRange,
  workStartMin = 9 * 60 + 30,
  workEndMin = 18 * 60
): Attendance | null {
  const work = ds.places.find((p) => p.label === "work");
  if (!work) return null;

  const days = filterDays(ds, r);
  const weekdays = days.filter((d) => {
    const dow = new Date(d.date + "T12:00:00").getDay();
    return dow >= 1 && dow <= 5;
  });

  let present = 0,
    late = 0,
    early = 0;
  const arrivals: number[] = [];
  const departures: number[] = [];
  const commutes: number[] = [];

  for (const d of weekdays) {
    const segs = daySegments(ds, d.date);
    const workVisits = segs.filter(
      (s): s is Visit => s.kind === "visit" && s.placeId === work.id
    );
    if (workVisits.length === 0) continue;
    present++;

    const arrive = new Date(workVisits[0].start);
    const arriveMin = arrive.getHours() * 60 + arrive.getMinutes();
    arrivals.push(arriveMin);
    if (arriveMin > workStartMin) late++;

    const leave = new Date(workVisits[workVisits.length - 1].end);
    const leaveMin = leave.getHours() * 60 + leave.getMinutes();
    departures.push(leaveMin);
    if (leaveMin < workEndMin) early++;

    // Commute: the trip that ends at (or just before) the first work visit.
    const commute = segs.find(
      (s): s is Trip =>
        s.kind === "trip" && Math.abs(s.end - workVisits[0].start) < 15 * 60_000
    );
    if (commute) commutes.push(commute.end - commute.start);
  }

  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  return {
    workingDays: weekdays.length,
    presentDays: present,
    leaveDays: weekdays.length - present,
    lateArrivals: late,
    earlyDepartures: early,
    avgArrival: avg(arrivals),
    avgDeparture: avg(departures),
    avgCommuteMs: avg(commutes),
    longestCommuteMs: commutes.length ? Math.max(...commutes) : null,
    shortestCommuteMs: commutes.length ? Math.min(...commutes) : null,
  };
}

/** Travel radius (max distance of any visit from home) in meters. */
export function travelRadius(ds: Dataset, r: DateRange): number {
  const home = ds.places.find((p) => p.label === "home");
  if (!home) return 0;
  let max = 0;
  for (const s of filterSegments(ds, r)) {
    if (s.kind !== "visit") continue;
    const d = haversineLocal(home.lat, home.lng, s.lat, s.lng);
    if (d > max) max = d;
  }
  return max;
}

function haversineLocal(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
