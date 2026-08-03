/**
 * File ingestion orchestrator: takes browser File objects (including Takeout
 * ZIPs), detects each entry's format, streams it through the right parser and
 * accumulates one ParsedBatch. Runs inside the ingest worker.
 */
import { Unzip, UnzipInflate } from "fflate";
import { StreamingArrayParser, streamText } from "./stream";
import {
  emptyBatch,
  parseRecordsItem,
  parseRawSignal,
  parseSemanticSegment,
  parseTimelineObject,
  type ParsedBatch,
} from "./google";
import { detectFormat, parseCsv, parseGpx, parseKml, type FileFormat } from "./formats";
import type { IngestProgress } from "../types";

type ProgressFn = (p: IngestProgress) => void;

const STREAM_KEYS = new Set([
  "locations",
  "timelineObjects",
  "semanticSegments",
  "rawSignals",
]);

/** Route one parsed array element into the batch based on its source array. */
function routeItem(item: unknown, key: string, out: ParsedBatch): void {
  switch (key) {
    case "locations": {
      const p = parseRecordsItem(item);
      if (p) out.points.push(p);
      break;
    }
    case "timelineObjects":
      parseTimelineObject(item, out);
      break;
    case "semanticSegments":
      parseSemanticSegment(item, out);
      break;
    case "rawSignals":
      parseRawSignal(item, out);
      break;
  }
}

async function ingestJsonStream(
  name: string,
  blob: Blob,
  out: ParsedBatch,
  progress: ProgressFn
): Promise<void> {
  const parser = new StreamingArrayParser(STREAM_KEYS, (item, key) =>
    routeItem(item, key, out)
  );
  const total = blob.size;
  let lastReport = 0;
  await streamText(blob, (chunk, bytes) => {
    parser.push(chunk);
    if (bytes - lastReport > 8 * 1024 * 1024) {
      lastReport = bytes;
      progress({
        phase: "parsing",
        file: name,
        pointCount: out.points.length,
        segmentCount: out.visits.length + out.trips.length,
        fraction: total ? bytes / total : undefined,
      });
    }
  });
}

async function ingestText(name: string, blob: Blob, format: FileFormat, out: ParsedBatch) {
  const text = await blob.text();
  if (format === "gpx") parseGpx(text, out);
  else if (format === "kml") parseKml(text, out);
  else if (format === "csv") parseCsv(text, out);
}

async function ingestEntry(
  name: string,
  blob: Blob,
  out: ParsedBatch,
  progress: ProgressFn
): Promise<void> {
  const head = await blob.slice(0, 4096).text();
  const format = detectFormat(name, head);
  progress({ phase: "parsing", file: name, message: `Detected format: ${format}` });

  switch (format) {
    case "records":
    case "semantic":
    case "mobile-timeline":
      await ingestJsonStream(name, blob, out, progress);
      break;
    case "gpx":
    case "kml":
    case "csv":
      await ingestText(name, blob, format, out);
      break;
    case "unknown":
      // Last resort: try the JSON streamer anyway — it only reacts to known keys.
      if (name.toLowerCase().endsWith(".json")) await ingestJsonStream(name, blob, out, progress);
      break;
  }
}

const RELEVANT_IN_ZIP = /\.(json|gpx|kml|csv)$/i;

/** Stream-extract a ZIP without buffering the whole archive in memory. */
async function ingestZip(
  file: File,
  out: ParsedBatch,
  progress: ProgressFn
): Promise<void> {
  progress({ phase: "unzipping", file: file.name });

  // Collect matching entries as [name, chunks] while streaming the zip.
  const pending: Promise<void>[] = [];
  const unzip = new Unzip((stream) => {
    if (!RELEVANT_IN_ZIP.test(stream.name) || stream.name.endsWith("/")) return;
    const shortName = stream.name.split("/").pop() ?? stream.name;
    const chunks: Uint8Array[] = [];
    const done = new Promise<void>((resolve, reject) => {
      stream.ondata = (err, chunk, final) => {
        if (err) return reject(err);
        if (chunk) chunks.push(chunk);
        if (final) {
          const blob = new Blob(chunks as BlobPart[]);
          chunks.length = 0;
          ingestEntry(shortName, blob, out, progress).then(resolve, reject);
        }
      };
    });
    pending.push(done.catch(() => {}));
    stream.start();
  });
  unzip.register(UnzipInflate);

  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      unzip.push(new Uint8Array(0), true);
      break;
    }
    unzip.push(value, false);
    // Keep memory bounded: wait for in-flight entry parsing before reading more.
    if (pending.length > 2) {
      await Promise.all(pending.splice(0));
    }
  }
  await Promise.all(pending);
}

/** Ingest a set of user-provided files into one ParsedBatch. */
export async function ingestFiles(
  files: File[],
  progress: ProgressFn
): Promise<ParsedBatch> {
  const out = emptyBatch();
  for (const file of files) {
    progress({ phase: "reading", file: file.name });
    if (file.name.toLowerCase().endsWith(".zip")) {
      await ingestZip(file, out, progress);
    } else {
      await ingestEntry(file.name, file, out, progress);
    }
  }
  return out;
}
