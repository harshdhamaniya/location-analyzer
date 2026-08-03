/**
 * Core data model for the Location Analyzer.
 *
 * All timestamps are Unix epoch milliseconds (UTC). All distances are meters,
 * durations are milliseconds, speeds are meters/second unless suffixed otherwise.
 */

/** A single raw GPS fix after parsing (before/after cleaning). */
export interface RawPoint {
  t: number; // epoch ms
  lat: number;
  lng: number;
  accuracy?: number; // meters
  altitude?: number; // meters
  speed?: number; // m/s (reported by device, may be absent)
  heading?: number; // degrees
  source?: string; // device / file source
  activity?: string; // top inferred activity from Google, if present
}

/** Transportation / activity mode, normalized across all Google formats. */
export type MoveMode =
  | "walking"
  | "running"
  | "cycling"
  | "driving"
  | "transit"
  | "flying"
  | "still"
  | "unknown";

/** A visit to a place (a "stop") — either from semantic data or inferred. */
export interface Visit {
  kind: "visit";
  id: string;
  start: number;
  end: number;
  lat: number;
  lng: number;
  placeId?: string; // internal place cluster id
  name?: string; // semantic name from Google, if available
  address?: string;
  confidence?: number; // 0..1
  inferred: boolean; // true when derived from raw points rather than semantic data
}

/** A movement segment (a "trip leg") between two visits. */
export interface Trip {
  kind: "trip";
  id: string;
  start: number;
  end: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distance: number; // meters (path distance)
  mode: MoveMode;
  confidence?: number;
  /** [pointStartIdx, pointEndIdx) range into the columnar point store */
  ptRange?: [number, number];
  maxSpeed?: number; // m/s observed
  avgSpeed?: number; // m/s
  inferred: boolean;
}

export type Segment = Visit | Trip;

/** A clustered, recurring place (home, office, client site…). */
export interface Place {
  id: string;
  lat: number;
  lng: number;
  name: string;
  visitCount: number;
  totalDwell: number; // ms
  firstSeen: number;
  lastSeen: number;
  label: "home" | "work" | "other";
}

/** Aggregated statistics for one local calendar day. */
export interface DayStat {
  date: string; // YYYY-MM-DD (local)
  distance: number; // meters
  travelTime: number; // ms in motion
  tripCount: number;
  visitCount: number;
  placeIds: string[];
  firstMove: number | null; // epoch ms
  lastMove: number | null;
  timeAtHome: number; // ms
  timeAtWork: number; // ms
  timeOutside: number; // ms not at home
  maxSpeed: number; // m/s
  modes: Partial<Record<MoveMode, number>>; // distance meters per mode
}

/** Data-quality issues surfaced by the cleaning pipeline. */
export interface Anomaly {
  id: string;
  t: number;
  type:
    | "impossible-speed"
    | "gps-jump"
    | "data-gap"
    | "duplicate-burst"
    | "low-accuracy-cluster"
    | "night-travel"
    | "unusual-trip";
  detail: string;
  lat?: number;
  lng?: number;
  severity: "info" | "warn" | "high";
}

/** Columnar point store — cheap to transfer between worker and UI thread. */
export interface PointColumns {
  t: Float64Array;
  lat: Float64Array;
  lng: Float64Array;
  speed: Float32Array; // m/s, NaN when unknown
  accuracy: Float32Array; // meters, NaN when unknown
  altitude: Float32Array; // meters, NaN when unknown
}

/** The fully processed dataset the whole UI works from. */
export interface Dataset {
  id: string;
  name: string;
  importedAt: number;
  sourceFiles: string[];
  points: PointColumns;
  segments: Segment[];
  places: Place[];
  days: DayStat[];
  anomalies: Anomaly[];
  stats: {
    totalPoints: number;
    droppedPoints: number;
    firstFix: number;
    lastFix: number;
  };
}

/** Progress events streamed from the ingest worker. */
export interface IngestProgress {
  phase:
    | "reading"
    | "unzipping"
    | "parsing"
    | "cleaning"
    | "segmenting"
    | "aggregating"
    | "done"
    | "error";
  file?: string;
  pointCount?: number;
  segmentCount?: number;
  message?: string;
  /** 0..1 when determinable */
  fraction?: number;
}

export interface ExpenseRates {
  currency: string;
  mileageRate: number; // per km, driving
  dailyAllowance: number; // per active travel day
  parkingPerStop: number; // heuristic per long urban stop
}

export const DEFAULT_EXPENSE_RATES: ExpenseRates = {
  currency: "₹",
  mileageRate: 12,
  dailyAllowance: 300,
  parkingPerStop: 40,
};
