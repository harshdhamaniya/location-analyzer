"use client";

/**
 * CSV and multi-sheet Excel export. Everything is generated in the browser
 * and downloaded via object URLs — no server round-trip.
 */
import type { Dataset, ExpenseRates } from "../types";
import { dayKey, fmtDuration } from "../utils";
import { computeAttendance, filterDays, filterSegments, placeById, type DateRange } from "../engine/derive";
import { estimateExpenses } from "../engine/expense";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

/* ------------------------------ CSV ------------------------------ */

export function exportDaysCsv(ds: Dataset, range: DateRange): void {
  const days = filterDays(ds, range);
  const rows: (string | number)[][] = [
    ["Date", "Distance (km)", "Travel time (min)", "Trips", "Stops", "First move", "Last move", "Time at home (h)", "Time at work (h)", "Max speed (km/h)"],
  ];
  for (const d of days) {
    rows.push([
      d.date,
      +(d.distance / 1000).toFixed(2),
      Math.round(d.travelTime / 60000),
      d.tripCount,
      d.visitCount,
      d.firstMove ? new Date(d.firstMove).toLocaleTimeString() : "",
      d.lastMove ? new Date(d.lastMove).toLocaleTimeString() : "",
      +(d.timeAtHome / 3600000).toFixed(2),
      +(d.timeAtWork / 3600000).toFixed(2),
      Math.round(d.maxSpeed * 3.6),
    ]);
  }
  download(new Blob([toCsv(rows)], { type: "text/csv" }), "daily-report.csv");
}

export function exportSegmentsCsv(ds: Dataset, range: DateRange): void {
  const segs = filterSegments(ds, range);
  const rows: (string | number)[][] = [
    ["Date", "Type", "Start", "End", "Duration (min)", "Place / Mode", "Latitude", "Longitude", "Distance (km)", "Avg speed (km/h)", "Source"],
  ];
  for (const s of segs) {
    const common = [
      dayKey(s.start),
      s.kind,
      new Date(s.start).toLocaleTimeString(),
      new Date(s.end).toLocaleTimeString(),
      Math.round((s.end - s.start) / 60000),
    ];
    if (s.kind === "visit") {
      const place = placeById(ds, s.placeId);
      rows.push([...common, place?.name ?? s.name ?? "Unknown", +s.lat.toFixed(6), +s.lng.toFixed(6), "", "", s.inferred ? "inferred" : "google"]);
    } else {
      rows.push([...common, s.mode, +s.startLat.toFixed(6), +s.startLng.toFixed(6), +(s.distance / 1000).toFixed(2), s.avgSpeed ? Math.round(s.avgSpeed * 3.6) : "", s.inferred ? "inferred" : "google"]);
    }
  }
  download(new Blob([toCsv(rows)], { type: "text/csv" }), "timeline-segments.csv");
}

export function exportPointsCsv(ds: Dataset, range: DateRange, maxRows = 500_000): void {
  const { t, lat, lng, speed, accuracy, altitude } = ds.points;
  const from = range.from ? new Date(range.from + "T00:00:00").getTime() : -Infinity;
  const to = range.to ? new Date(range.to + "T00:00:00").getTime() + 86400_000 : Infinity;
  const parts: string[] = ["timestamp,latitude,longitude,speed_ms,accuracy_m,altitude_m"];
  let count = 0;
  for (let i = 0; i < t.length && count < maxRows; i++) {
    if (t[i] < from || t[i] >= to) continue;
    parts.push(
      `${new Date(t[i]).toISOString()},${lat[i].toFixed(7)},${lng[i].toFixed(7)},${Number.isNaN(speed[i]) ? "" : speed[i].toFixed(2)},${Number.isNaN(accuracy[i]) ? "" : Math.round(accuracy[i])},${Number.isNaN(altitude[i]) ? "" : Math.round(altitude[i])}`
    );
    count++;
  }
  download(new Blob([parts.join("\r\n")], { type: "text/csv" }), "gps-points.csv");
}

/* ------------------------------ Excel ----------------------------- */

export async function exportExcel(
  ds: Dataset,
  range: DateRange,
  rates: ExpenseRates
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Location Analyzer";
  wb.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF4F6DF5" } },
  };
  const addSheet = (name: string, columns: { header: string; key: string; width?: number }[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns;
    ws.getRow(1).eachCell((c) => Object.assign(c, headerStyle));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return ws;
  };

  const days = filterDays(ds, range);
  const segs = filterSegments(ds, range);
  const expenses = estimateExpenses(ds, range, rates);
  const attendance = computeAttendance(ds, range);

  // Summary
  const sum = addSheet("Summary", [
    { header: "Metric", key: "k", width: 34 },
    { header: "Value", key: "v", width: 30 },
  ]);
  const totalDist = days.reduce((s, d) => s + d.distance, 0);
  const totalTravel = days.reduce((s, d) => s + d.travelTime, 0);
  sum.addRows([
    { k: "Period", v: `${days[0]?.date ?? "—"} → ${days[days.length - 1]?.date ?? "—"}` },
    { k: "Tracked days", v: days.length },
    { k: "Total distance (km)", v: +(totalDist / 1000).toFixed(1) },
    { k: "Total travel time", v: fmtDuration(totalTravel) },
    { k: "Trips", v: days.reduce((s, d) => s + d.tripCount, 0) },
    { k: "Stops", v: days.reduce((s, d) => s + d.visitCount, 0) },
    { k: "Known places", v: ds.places.length },
    { k: "GPS points", v: ds.stats.totalPoints },
    { k: "Estimated expenses", v: `${rates.currency}${Math.round(expenses.total).toLocaleString()}` },
    ...(attendance
      ? [
          { k: "Working days in period", v: attendance.workingDays },
          { k: "Days present at office", v: attendance.presentDays },
          { k: "Late arrivals", v: attendance.lateArrivals },
          { k: "Early departures", v: attendance.earlyDepartures },
        ]
      : []),
  ]);

  // Daily
  const daily = addSheet("Daily Report", [
    { header: "Date", key: "date", width: 12 },
    { header: "Distance (km)", key: "dist", width: 14 },
    { header: "Travel (min)", key: "travel", width: 12 },
    { header: "Trips", key: "trips", width: 8 },
    { header: "Stops", key: "stops", width: 8 },
    { header: "At home (h)", key: "home", width: 12 },
    { header: "At work (h)", key: "work", width: 12 },
    { header: "Max speed (km/h)", key: "spd", width: 16 },
    { header: "Est. expense", key: "exp", width: 12 },
  ]);
  for (const d of days)
    daily.addRow({
      date: d.date,
      dist: +(d.distance / 1000).toFixed(2),
      travel: Math.round(d.travelTime / 60000),
      trips: d.tripCount,
      stops: d.visitCount,
      home: +(d.timeAtHome / 3600000).toFixed(2),
      work: +(d.timeAtWork / 3600000).toFixed(2),
      spd: Math.round(d.maxSpeed * 3.6),
      exp: Math.round(expenses.perDay.get(d.date) ?? 0),
    });

  // Trips
  const tripsWs = addSheet("Trips", [
    { header: "Date", key: "date", width: 12 },
    { header: "Start", key: "start", width: 10 },
    { header: "End", key: "end", width: 10 },
    { header: "Mode", key: "mode", width: 10 },
    { header: "Distance (km)", key: "dist", width: 14 },
    { header: "Avg km/h", key: "avg", width: 10 },
    { header: "Max km/h", key: "max", width: 10 },
    { header: "Source", key: "src", width: 10 },
  ]);
  // Stops
  const stopsWs = addSheet("Stops", [
    { header: "Date", key: "date", width: 12 },
    { header: "Arrive", key: "start", width: 10 },
    { header: "Depart", key: "end", width: 10 },
    { header: "Duration (min)", key: "dur", width: 14 },
    { header: "Place", key: "place", width: 32 },
    { header: "Lat", key: "lat", width: 12 },
    { header: "Lng", key: "lng", width: 12 },
  ]);
  for (const s of segs) {
    if (s.kind === "trip")
      tripsWs.addRow({
        date: dayKey(s.start),
        start: new Date(s.start).toLocaleTimeString(),
        end: new Date(s.end).toLocaleTimeString(),
        mode: s.mode,
        dist: +(s.distance / 1000).toFixed(2),
        avg: s.avgSpeed ? Math.round(s.avgSpeed * 3.6) : "",
        max: s.maxSpeed ? Math.round(s.maxSpeed * 3.6) : "",
        src: s.inferred ? "inferred" : "google",
      });
    else
      stopsWs.addRow({
        date: dayKey(s.start),
        start: new Date(s.start).toLocaleTimeString(),
        end: new Date(s.end).toLocaleTimeString(),
        dur: Math.round((s.end - s.start) / 60000),
        place: placeById(ds, s.placeId)?.name ?? s.name ?? "Unknown",
        lat: +s.lat.toFixed(6),
        lng: +s.lng.toFixed(6),
      });
  }

  // Places
  const placesWs = addSheet("Visited Locations", [
    { header: "Place", key: "name", width: 32 },
    { header: "Label", key: "label", width: 10 },
    { header: "Visits", key: "visits", width: 8 },
    { header: "Total dwell (h)", key: "dwell", width: 14 },
    { header: "Lat", key: "lat", width: 12 },
    { header: "Lng", key: "lng", width: 12 },
  ]);
  for (const p of ds.places)
    placesWs.addRow({
      name: p.name,
      label: p.label,
      visits: p.visitCount,
      dwell: +(p.totalDwell / 3600000).toFixed(1),
      lat: +p.lat.toFixed(6),
      lng: +p.lng.toFixed(6),
    });

  // Expenses
  const expWs = addSheet("Expenses", [
    { header: "Item", key: "k", width: 30 },
    { header: "Quantity", key: "q", width: 16 },
    { header: "Amount", key: "v", width: 16 },
  ]);
  expWs.addRows([
    { k: "Mileage (driving)", q: `${expenses.mileageKm.toFixed(1)} km`, v: Math.round(expenses.mileageCost) },
    { k: "Daily allowance", q: `${expenses.allowanceDays} days`, v: Math.round(expenses.allowanceCost) },
    { k: "Parking (heuristic)", q: `${expenses.parkingStops} stops`, v: Math.round(expenses.parkingCost) },
    { k: "TOTAL", q: "", v: Math.round(expenses.total) },
  ]);

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `location-report-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
