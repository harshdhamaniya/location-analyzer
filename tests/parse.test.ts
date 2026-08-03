import { describe, expect, it } from "vitest";
import { StreamingArrayParser } from "../lib/parse/stream";
import {
  emptyBatch,
  parseRecordsItem,
  parseSemanticSegment,
  parseTimelineObject,
} from "../lib/parse/google";
import { detectFormat, parseCsv, parseGpx } from "../lib/parse/formats";

describe("StreamingArrayParser", () => {
  it("extracts elements of a matched top-level array across chunk splits", () => {
    const items: unknown[] = [];
    const p = new StreamingArrayParser(new Set(["locations"]), (i) => items.push(i));
    const json = JSON.stringify({
      locations: [
        { a: 1, nested: { x: [1, 2] } },
        { b: "with \"quotes\" and {braces}" },
        { c: 3 },
      ],
      other: [{ ignored: true }],
    });
    // feed one character at a time — worst-case chunking
    for (const ch of json) p.push(ch);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ a: 1, nested: { x: [1, 2] } });
    expect(items[1]).toEqual({ b: 'with "quotes" and {braces}' });
  });

  it("handles multiple captured keys in one document", () => {
    const byKey: Record<string, number> = {};
    const p = new StreamingArrayParser(new Set(["semanticSegments", "rawSignals"]), (_i, k) => {
      byKey[k] = (byKey[k] ?? 0) + 1;
    });
    p.push(
      JSON.stringify({
        semanticSegments: [{ s: 1 }, { s: 2 }],
        rawSignals: [{ r: 1 }],
      })
    );
    expect(byKey).toEqual({ semanticSegments: 2, rawSignals: 1 });
  });
});

describe("parseRecordsItem", () => {
  it("parses modern E7 + ISO timestamp records", () => {
    const p = parseRecordsItem({
      latitudeE7: 129352000,
      longitudeE7: 776245000,
      accuracy: 12,
      timestamp: "2024-03-01T09:15:00.000Z",
      velocity: 5,
      altitude: 900,
    });
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(12.9352);
    expect(p!.lng).toBeCloseTo(77.6245);
    expect(p!.t).toBe(Date.parse("2024-03-01T09:15:00.000Z"));
    expect(p!.speed).toBe(5);
  });

  it("parses legacy timestampMs records and rejects null island", () => {
    const p = parseRecordsItem({
      latitudeE7: 10000000,
      longitudeE7: 20000000,
      timestampMs: "1500000000000",
    });
    expect(p!.t).toBe(1500000000000);
    expect(
      parseRecordsItem({ latitudeE7: 0, longitudeE7: 0, timestampMs: "1500000000000" })
    ).toBeNull();
  });
});

describe("parseTimelineObject (semantic)", () => {
  it("parses placeVisit and activitySegment", () => {
    const out = emptyBatch();
    parseTimelineObject(
      {
        placeVisit: {
          location: { latitudeE7: 129352000, longitudeE7: 776245000, name: "Home" },
          duration: { startTimestamp: "2024-03-01T20:00:00Z", endTimestamp: "2024-03-02T06:00:00Z" },
          visitConfidence: 87,
        },
      },
      out
    );
    parseTimelineObject(
      {
        activitySegment: {
          startLocation: { latitudeE7: 129352000, longitudeE7: 776245000 },
          endLocation: { latitudeE7: 129784000, longitudeE7: 776408000 },
          duration: { startTimestamp: "2024-03-01T09:00:00Z", endTimestamp: "2024-03-01T09:40:00Z" },
          distance: 7200,
          activityType: "IN_PASSENGER_VEHICLE",
          confidence: "HIGH",
        },
      },
      out
    );
    expect(out.visits).toHaveLength(1);
    expect(out.visits[0].name).toBe("Home");
    expect(out.trips).toHaveLength(1);
    expect(out.trips[0].mode).toBe("driving");
    expect(out.trips[0].distance).toBe(7200);
  });
});

describe("parseSemanticSegment (2024+ Timeline.json)", () => {
  it("parses visit, activity and timelinePath variants", () => {
    const out = emptyBatch();
    parseSemanticSegment(
      {
        startTime: "2024-05-01T10:00:00.000Z",
        endTime: "2024-05-01T11:00:00.000Z",
        visit: {
          probability: 0.9,
          topCandidate: {
            placeLocation: { latLng: "12.9784°, 77.6408°" },
            semanticType: "TYPE_WORK",
          },
        },
      },
      out
    );
    parseSemanticSegment(
      {
        startTime: "2024-05-01T09:00:00.000Z",
        endTime: "2024-05-01T09:30:00.000Z",
        activity: {
          start: { latLng: "12.93°, 77.62°" },
          end: { latLng: "12.97°, 77.64°" },
          distanceMeters: 6800,
          topCandidate: { type: "IN_VEHICLE", probability: 0.8 },
        },
      },
      out
    );
    parseSemanticSegment(
      {
        startTime: "2024-05-01T08:00:00.000Z",
        endTime: "2024-05-01T08:10:00.000Z",
        timelinePath: [
          { point: "12.93°, 77.62°", durationMinutesOffsetFromStartTime: "0" },
          { point: "12.94°, 77.63°", durationMinutesOffsetFromStartTime: "5" },
        ],
      },
      out
    );
    expect(out.visits).toHaveLength(1);
    expect(out.visits[0].name).toBe("Work");
    expect(out.trips).toHaveLength(1);
    expect(out.trips[0].distance).toBe(6800);
    expect(out.points).toHaveLength(2);
    expect(out.points[1].t - out.points[0].t).toBe(5 * 60000);
  });
});

describe("other formats", () => {
  it("parses GPX track points", () => {
    const out = emptyBatch();
    parseGpx(
      `<gpx><trk><trkseg>
        <trkpt lat="12.9" lon="77.6"><ele>910</ele><time>2024-01-01T10:00:00Z</time></trkpt>
        <trkpt lat="12.91" lon="77.61"><time>2024-01-01T10:01:00Z</time></trkpt>
      </trkseg></trk></gpx>`,
      out
    );
    expect(out.points).toHaveLength(2);
    expect(out.points[0].altitude).toBe(910);
  });

  it("parses CSV with flexible headers", () => {
    const out = emptyBatch();
    parseCsv(
      `Latitude,Longitude,Timestamp,Speed\n12.9,77.6,2024-01-01T10:00:00Z,4.2\n12.91,77.61,1704103260000,`,
      out
    );
    expect(out.points).toHaveLength(2);
    expect(out.points[0].speed).toBeCloseTo(4.2);
    expect(out.points[1].t).toBe(1704103260000);
  });

  it("detects formats from name and content head", () => {
    expect(detectFormat("Records.json", '{"locations": [')).toBe("records");
    expect(detectFormat("2024_MARCH.json", '{"timelineObjects": [')).toBe("semantic");
    expect(detectFormat("Timeline.json", '{"semanticSegments": [')).toBe("mobile-timeline");
    expect(detectFormat("takeout.zip", "PK")).toBe("zip");
    expect(detectFormat("track.gpx", "<?xml")).toBe("gpx");
  });
});
