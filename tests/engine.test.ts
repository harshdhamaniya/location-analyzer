import { describe, expect, it } from "vitest";
import { cleanPoints } from "../lib/engine/clean";
import { inferSegments, mergeSegments, modeFromSpeed } from "../lib/engine/segment";
import { clusterPlaces } from "../lib/engine/places";
import { aggregateDays } from "../lib/engine/stats";
import type { RawPoint } from "../lib/types";

const T0 = Date.parse("2024-03-04T00:00:00Z"); // a Monday

/** Build a synthetic day: home dwell → drive → office dwell. */
function syntheticDay(): RawPoint[] {
  const pts: RawPoint[] = [];
  const home = { lat: 12.9352, lng: 77.6245 };
  const office = { lat: 12.9784, lng: 77.6408 };
  // home 08:00–09:00, fix / 5 min
  for (let m = 0; m <= 60; m += 5)
    pts.push({ t: T0 + (480 + m) * 60000, lat: home.lat, lng: home.lng, accuracy: 15 });
  // drive 09:00–09:30, fix / min
  for (let m = 1; m <= 30; m++) {
    const f = m / 30;
    pts.push({
      t: T0 + (540 + m) * 60000,
      lat: home.lat + (office.lat - home.lat) * f,
      lng: home.lng + (office.lng - home.lng) * f,
      accuracy: 20,
    });
  }
  // office 09:30–12:00, fix / 5 min
  for (let m = 35; m <= 180; m += 5)
    pts.push({ t: T0 + (540 + m) * 60000, lat: office.lat, lng: office.lng, accuracy: 15 });
  return pts;
}

describe("cleanPoints", () => {
  it("drops GPS jumps but keeps genuine movement", () => {
    const pts = syntheticDay();
    // inject an absurd jump: 500 km away for a single fix
    pts.push({ t: T0 + 545 * 60000 + 30000, lat: 17.4, lng: 78.4, accuracy: 20 });
    pts.sort((a, b) => a.t - b.t);
    const { columns, anomalies } = cleanPoints(pts);
    // the outlier is gone
    let maxLat = 0;
    for (const v of columns.lat) maxLat = Math.max(maxLat, v);
    expect(maxLat).toBeLessThan(13.5);
    expect(anomalies.some((a) => a.type === "gps-jump")).toBe(true);
  });

  it("thins stationary bursts", () => {
    const burst: RawPoint[] = [];
    for (let s = 0; s < 600; s += 2)
      burst.push({ t: T0 + s * 1000, lat: 12.9352, lng: 77.6245, accuracy: 10 });
    const { kept } = cleanPoints(burst);
    expect(kept).toBeLessThan(60);
    expect(kept).toBeGreaterThan(5);
  });
});

describe("segmentation", () => {
  it("detects home stop, trip and office stop", () => {
    const { columns } = cleanPoints(syntheticDay());
    const segments = inferSegments(columns);
    const visits = segments.filter((s) => s.kind === "visit");
    const trips = segments.filter((s) => s.kind === "trip");
    expect(visits.length).toBe(2);
    expect(trips.length).toBe(1);
    if (trips[0].kind === "trip") {
      expect(trips[0].distance).toBeGreaterThan(3000);
      expect(trips[0].distance).toBeLessThan(12000);
    }
  });

  it("prefers semantic segments over inferred on overlap", () => {
    const { columns } = cleanPoints(syntheticDay());
    const inferred = inferSegments(columns);
    const merged = mergeSegments(
      inferred,
      [
        {
          start: T0 + 480 * 60000,
          end: T0 + 540 * 60000,
          lat: 12.9352,
          lng: 77.6245,
          name: "Home",
        },
      ],
      [],
      columns
    );
    const namedHome = merged.filter((s) => s.kind === "visit" && s.name === "Home");
    expect(namedHome).toHaveLength(1);
    // overlapping inferred home visit was suppressed
    const homeVisits = merged.filter(
      (s) => s.kind === "visit" && Math.abs(s.lat - 12.9352) < 0.002
    );
    expect(homeVisits).toHaveLength(1);
  });

  it("maps speeds to plausible modes", () => {
    expect(modeFromSpeed(1.2, 2)).toBe("walking");
    expect(modeFromSpeed(4, 8)).toBe("cycling");
    expect(modeFromSpeed(12, 25)).toBe("driving");
    expect(modeFromSpeed(150, 240)).toBe("flying");
  });
});

describe("places & day aggregation", () => {
  it("clusters two visits to the same spot into one place and aggregates a day", () => {
    const { columns } = cleanPoints(syntheticDay());
    const segments = inferSegments(columns);
    const places = clusterPlaces(segments);
    expect(places).toHaveLength(2);

    const days = aggregateDays(segments, places, columns);
    expect(days).toHaveLength(1);
    expect(days[0].tripCount).toBe(1);
    expect(days[0].visitCount).toBe(2);
    expect(days[0].distance).toBeGreaterThan(3000);
    expect(days[0].travelTime).toBeGreaterThan(20 * 60000);
  });
});
