/**
 * Ingest worker: parses uploaded files and builds the Dataset off the UI
 * thread. Typed-array columns are transferred (zero-copy) back to the page.
 */
import { ingestFiles } from "../parse/ingest";
import { buildDataset } from "../engine/pipeline";
import type { Dataset, IngestProgress } from "../types";

export interface IngestRequest {
  files: File[];
  name: string;
}

export type IngestResponse =
  | { type: "progress"; progress: IngestProgress }
  | { type: "done"; dataset: Dataset }
  | { type: "error"; message: string };

self.onmessage = async (e: MessageEvent<IngestRequest>) => {
  const post = (msg: IngestResponse, transfer?: Transferable[]) =>
    (self as unknown as Worker).postMessage(msg, transfer ?? []);

  const progress = (p: IngestProgress) => post({ type: "progress", progress: p });

  try {
    const { files, name } = e.data;
    const batch = await ingestFiles(files, progress);

    if (
      batch.points.length === 0 &&
      batch.visits.length === 0 &&
      batch.trips.length === 0
    ) {
      post({
        type: "error",
        message:
          "No location records found. Supported: Google Takeout ZIP, Records.json, Semantic Location History, Timeline.json, GPX, KML, CSV.",
      });
      return;
    }

    const dataset = buildDataset(
      batch,
      name,
      files.map((f) => f.name),
      progress
    );

    const transfers: Transferable[] = [
      dataset.points.t.buffer,
      dataset.points.lat.buffer,
      dataset.points.lng.buffer,
      dataset.points.speed.buffer,
      dataset.points.accuracy.buffer,
      dataset.points.altitude.buffer,
    ];
    post({ type: "done", dataset }, transfers);
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown import error",
    });
  }
};
