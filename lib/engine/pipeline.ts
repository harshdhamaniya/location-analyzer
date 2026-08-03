/**
 * End-to-end processing pipeline: ParsedBatch → Dataset.
 * Runs inside the ingest worker.
 */
import type { Anomaly, Dataset, IngestProgress, Segment } from "../types";
import { uid } from "../utils";
import type { ParsedBatch } from "../parse/google";
import { cleanPoints } from "./clean";
import { inferSegments, mergeSegments } from "./segment";
import { clusterPlaces } from "./places";
import { aggregateDays } from "./stats";

export function buildDataset(
  batch: ParsedBatch,
  name: string,
  sourceFiles: string[],
  progress: (p: IngestProgress) => void
): Dataset {
  progress({ phase: "cleaning", pointCount: batch.points.length });
  const { columns, kept, dropped, anomalies } = cleanPoints(batch.points);
  batch.points.length = 0; // release raw memory early

  progress({ phase: "segmenting", pointCount: kept });
  const inferred = inferSegments(columns);
  const segments = mergeSegments(inferred, batch.visits, batch.trips, columns);

  progress({ phase: "aggregating", segmentCount: segments.length });
  const places = clusterPlaces(segments);
  const days = aggregateDays(segments, places, columns);
  anomalies.push(...behavioralAnomalies(segments));
  anomalies.sort((a, b) => a.t - b.t);

  const firstFix = columns.t.length ? columns.t[0] : (segments[0]?.start ?? 0);
  const lastFix = columns.t.length
    ? columns.t[columns.t.length - 1]
    : (segments[segments.length - 1]?.end ?? 0);

  return {
    id: uid("ds"),
    name,
    importedAt: Date.now(),
    sourceFiles,
    points: columns,
    segments,
    places,
    days,
    anomalies,
    stats: { totalPoints: kept, droppedPoints: dropped, firstFix, lastFix },
  };
}

/** Behavioral flags: night travel and statistically unusual trips. */
function behavioralAnomalies(segments: Segment[]): Anomaly[] {
  const out: Anomaly[] = [];
  const trips = segments.filter((s) => s.kind === "trip");
  if (trips.length === 0) return out;

  const dists = trips.map((t) => t.distance).sort((a, b) => a - b);
  const p95 = dists[Math.floor(dists.length * 0.95)] ?? Infinity;
  const median = dists[Math.floor(dists.length / 2)] ?? 0;

  for (const t of trips) {
    const h = new Date(t.start).getHours();
    if ((h >= 23 || h < 4) && t.distance > 3000) {
      out.push({
        id: uid("an"),
        t: t.start,
        type: "night-travel",
        detail: `${(t.distance / 1000).toFixed(1)} km trip started at ${new Date(
          t.start
        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        lat: t.startLat,
        lng: t.startLng,
        severity: "info",
      });
    }
    if (t.distance > p95 && t.distance > median * 8 && t.distance > 30_000) {
      out.push({
        id: uid("an"),
        t: t.start,
        type: "unusual-trip",
        detail: `Unusually long trip: ${(t.distance / 1000).toFixed(0)} km (typical trip is ${(
          median / 1000
        ).toFixed(1)} km)`,
        lat: t.startLat,
        lng: t.startLng,
        severity: "warn",
      });
    }
  }
  return out;
}
