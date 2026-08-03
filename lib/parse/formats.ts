/**
 * GPX / KML / CSV parsers (regex-based — DOMParser is unavailable in workers)
 * plus file-format detection.
 */
import type { RawPoint } from "../types";
import type { ParsedBatch } from "./google";

/* ---------------------------- GPX ---------------------------- */

export function parseGpx(text: string, out: ParsedBatch): void {
  const trkptRe =
    /<(?:trkpt|wpt|rtept)\b[^>]*lat="(-?[\d.]+)"[^>]*lon="(-?[\d.]+)"[^>]*>([\s\S]*?)<\/(?:trkpt|wpt|rtept)>/g;
  const selfClosing =
    /<(?:trkpt|wpt|rtept)\b[^>]*lat="(-?[\d.]+)"[^>]*lon="(-?[\d.]+)"[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = trkptRe.exec(text))) {
    const body = m[3];
    const timeM = body.match(/<time>([^<]+)<\/time>/);
    const eleM = body.match(/<ele>([-\d.]+)<\/ele>/);
    const spdM = body.match(/<speed>([-\d.]+)<\/speed>/);
    const t = timeM ? Date.parse(timeM[1]) : NaN;
    if (Number.isNaN(t)) continue;
    out.points.push({
      t,
      lat: parseFloat(m[1]),
      lng: parseFloat(m[2]),
      altitude: eleM ? parseFloat(eleM[1]) : undefined,
      speed: spdM ? parseFloat(spdM[1]) : undefined,
      source: "gpx",
    });
  }
  while ((m = selfClosing.exec(text))) {
    // waypoints without timestamps can't join the timeline — skip
  }
}

/* ---------------------------- KML ---------------------------- */

export function parseKml(text: string, out: ParsedBatch): void {
  // gx:Track — paired <when> and <gx:coord>
  const trackRe = /<gx:Track>([\s\S]*?)<\/gx:Track>/g;
  let tm: RegExpExecArray | null;
  let found = false;
  while ((tm = trackRe.exec(text))) {
    found = true;
    const body = tm[1];
    const whens: number[] = [];
    const coords: [number, number, number?][] = [];
    let m: RegExpExecArray | null;
    const whenRe = /<when>([^<]+)<\/when>/g;
    while ((m = whenRe.exec(body))) whens.push(Date.parse(m[1]));
    const coordRe = /<gx:coord>([^<]+)<\/gx:coord>/g;
    while ((m = coordRe.exec(body))) {
      const parts = m[1].trim().split(/\s+/).map(parseFloat);
      coords.push([parts[0], parts[1], parts[2]]); // lng lat alt
    }
    const n = Math.min(whens.length, coords.length);
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(whens[i])) continue;
      out.points.push({
        t: whens[i],
        lat: coords[i][1],
        lng: coords[i][0],
        altitude: coords[i][2],
        source: "kml",
      });
    }
  }
  if (found) return;

  // Fallback: LineString coordinates (no timestamps — usable for path only,
  // so we skip; timestamped data is required for the timeline).
}

/* ---------------------------- CSV ---------------------------- */

const LAT_KEYS = ["lat", "latitude", "latitude_e7"];
const LNG_KEYS = ["lng", "lon", "long", "longitude", "longitude_e7"];
const TIME_KEYS = ["time", "timestamp", "datetime", "date", "utc", "recorded_at"];

export function parseCsv(text: string, out: ParsedBatch): void {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return;
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const latI = header.findIndex((h) => LAT_KEYS.includes(h));
  const lngI = header.findIndex((h) => LNG_KEYS.includes(h));
  const timeI = header.findIndex((h) => TIME_KEYS.some((k) => h.includes(k)));
  if (latI < 0 || lngI < 0 || timeI < 0) return;
  const accI = header.findIndex((h) => h.includes("accuracy"));
  const altI = header.findIndex((h) => h.includes("alt") || h.includes("elevation"));
  const spdI = header.findIndex((h) => h.includes("speed") || h.includes("velocity"));
  const e7 = header[latI].includes("e7");

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = splitCsvLine(lines[i]);
    let lat = parseFloat(cols[latI]);
    let lng = parseFloat(cols[lngI]);
    if (e7) {
      lat /= 1e7;
      lng /= 1e7;
    }
    const raw = cols[timeI];
    const t = /^\d+$/.test(raw) ? (raw.length > 11 ? +raw : +raw * 1000) : Date.parse(raw);
    if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(t)) continue;
    const p: RawPoint = { t, lat, lng, source: "csv" };
    if (accI >= 0) p.accuracy = parseFloat(cols[accI]) || undefined;
    if (altI >= 0) p.altitude = parseFloat(cols[altI]) || undefined;
    if (spdI >= 0) p.speed = parseFloat(cols[spdI]) || undefined;
    out.points.push(p);
  }
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

/* ------------------------- detection -------------------------- */

export type FileFormat =
  | "records"
  | "semantic"
  | "mobile-timeline"
  | "gpx"
  | "kml"
  | "csv"
  | "zip"
  | "unknown";

export function detectFormat(name: string, head: string): FileFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".gpx")) return "gpx";
  if (lower.endsWith(".kml")) return "kml";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) {
    if (head.includes('"locations"')) return "records";
    if (head.includes('"timelineObjects"')) return "semantic";
    if (head.includes('"semanticSegments"') || head.includes('"rawSignals"'))
      return "mobile-timeline";
    // Filename hints for large files whose head is just "{\n"
    if (lower.includes("records")) return "records";
    if (/\d{4}_[a-z]+\.json$/i.test(lower)) return "semantic";
    if (lower.includes("timeline")) return "mobile-timeline";
    return "unknown";
  }
  if (head.trimStart().startsWith("<?xml") || head.includes("<gpx")) return "gpx";
  if (head.includes("<kml")) return "kml";
  return "unknown";
}
