/**
 * IndexedDB persistence (Dexie). The processed dataset is cached locally so
 * reopening the app is instant — no re-parsing. Raw uploads are never stored.
 */
import Dexie, { type EntityTable } from "dexie";
import type { Anomaly, Dataset, DayStat, Place, Segment } from "../types";

interface StoredDataset {
  id: string;
  name: string;
  importedAt: number;
  sourceFiles: string[];
  segments: Segment[];
  places: Place[];
  days: DayStat[];
  anomalies: Anomaly[];
  stats: Dataset["stats"];
  // typed-array columns stored as raw buffers
  t: ArrayBuffer;
  lat: ArrayBuffer;
  lng: ArrayBuffer;
  speed: ArrayBuffer;
  accuracy: ArrayBuffer;
  altitude: ArrayBuffer;
}

const db = new Dexie("location-analyzer") as Dexie & {
  datasets: EntityTable<StoredDataset, "id">;
};

db.version(1).stores({
  datasets: "id, importedAt",
});

export async function saveDataset(ds: Dataset): Promise<void> {
  await db.datasets.put({
    id: ds.id,
    name: ds.name,
    importedAt: ds.importedAt,
    sourceFiles: ds.sourceFiles,
    segments: ds.segments,
    places: ds.places,
    days: ds.days,
    anomalies: ds.anomalies,
    stats: ds.stats,
    t: ds.points.t.buffer as ArrayBuffer,
    lat: ds.points.lat.buffer as ArrayBuffer,
    lng: ds.points.lng.buffer as ArrayBuffer,
    speed: ds.points.speed.buffer as ArrayBuffer,
    accuracy: ds.points.accuracy.buffer as ArrayBuffer,
    altitude: ds.points.altitude.buffer as ArrayBuffer,
  });
}

export async function loadLatestDataset(): Promise<Dataset | null> {
  const stored = await db.datasets.orderBy("importedAt").reverse().first();
  if (!stored) return null;
  return {
    id: stored.id,
    name: stored.name,
    importedAt: stored.importedAt,
    sourceFiles: stored.sourceFiles,
    segments: stored.segments,
    places: stored.places,
    days: stored.days,
    anomalies: stored.anomalies,
    stats: stored.stats,
    points: {
      t: new Float64Array(stored.t),
      lat: new Float64Array(stored.lat),
      lng: new Float64Array(stored.lng),
      speed: new Float32Array(stored.speed),
      accuracy: new Float32Array(stored.accuracy),
      altitude: new Float32Array(stored.altitude),
    },
  };
}

export async function deleteAllDatasets(): Promise<void> {
  await db.datasets.clear();
}
