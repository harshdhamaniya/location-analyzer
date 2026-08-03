#!/usr/bin/env node
/**
 * Generates a realistic sample Google Takeout dataset (Records.json) for demos
 * and testing: ~60 days of commuting life in Bengaluru — home nights, office
 * weekdays, lunch breaks, client visits, weekend outings and one airport trip.
 *
 * Usage:  node scripts/generate-sample.mjs [days] [outDir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DAYS = Number(process.argv[2]) || 60;
const OUT = process.argv[3] || "sample-data";

const HOME = { lat: 12.9352, lng: 77.6245 }; // Koramangala
const OFFICE = { lat: 12.9784, lng: 77.6408 }; // Indiranagar
const LUNCH = { lat: 12.9791, lng: 77.6383 };
const CLIENT = { lat: 12.9698, lng: 77.7499 }; // Whitefield
const MALL = { lat: 12.9976, lng: 77.6963 };
const AIRPORT = { lat: 13.1986, lng: 77.7066 };

let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const jitter = (m) => (rand() - 0.5) * (m / 111320) * 2;

const locations = [];
function emit(t, lat, lng, extra = {}) {
  locations.push({
    latitudeE7: Math.round((lat + jitter(12)) * 1e7),
    longitudeE7: Math.round((lng + jitter(12)) * 1e7),
    accuracy: Math.round(8 + rand() * 30),
    timestamp: new Date(t).toISOString(),
    source: "WIFI",
    ...extra,
  });
}

/** Stationary dwell: a fix every ~5 min. */
function dwell(t0, t1, loc) {
  for (let t = t0; t < t1; t += (4 + rand() * 3) * 60000) emit(t, loc.lat, loc.lng);
  return t1;
}

/** Movement between two points: a fix every ~30 s along the line. */
function travel(t0, from, to, speedKmh) {
  const R = 111320;
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const distM = Math.hypot(dLat * R, dLng * R * Math.cos((from.lat * Math.PI) / 180)) * 1.3;
  const durMs = (distM / ((speedKmh * (0.85 + rand() * 0.3)) / 3.6)) * 1000;
  const steps = Math.max(4, Math.floor(durMs / 30000));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    // slight curve to look like roads
    const curve = Math.sin(f * Math.PI) * 0.15;
    emit(
      t0 + f * durMs,
      from.lat + dLat * f + curve * dLng * 0.5,
      from.lng + dLng * f - curve * dLat * 0.5,
      { velocity: Math.round((speedKmh / 3.6) * (0.7 + rand() * 0.6)) }
    );
  }
  return t0 + durMs;
}

const start = new Date();
start.setDate(start.getDate() - DAYS);
start.setHours(0, 0, 0, 0);

for (let d = 0; d < DAYS; d++) {
  const day = new Date(start.getTime() + d * 86400000);
  const dow = day.getDay();
  const at = (h, m = 0) => day.getTime() + h * 3600000 + m * 60000;
  const weekday = dow >= 1 && dow <= 5;

  let t = dwell(at(0), at(weekday ? 8 : 9, Math.floor(rand() * 45)), HOME);

  if (weekday) {
    if (d === Math.floor(DAYS * 0.7)) {
      // one airport day-trip
      t = travel(t, HOME, AIRPORT, 55);
      t = dwell(t, t + 4 * 3600000, AIRPORT);
      t = travel(t, AIRPORT, HOME, 50);
      dwell(t, at(23, 50), HOME);
      continue;
    }
    t = travel(t, HOME, OFFICE, 22 + rand() * 10);
    t = dwell(t, at(12, 30 + Math.floor(rand() * 30)), OFFICE);
    t = travel(t, OFFICE, LUNCH, 5);
    t = dwell(t, t + (35 + rand() * 20) * 60000, LUNCH);
    t = travel(t, LUNCH, OFFICE, 5);
    // Tuesdays: client visit in the afternoon
    if (dow === 2) {
      t = dwell(t, at(14, 30), OFFICE);
      t = travel(t, OFFICE, CLIENT, 30);
      t = dwell(t, at(17, 15), CLIENT);
      t = travel(t, CLIENT, OFFICE, 28);
    }
    t = dwell(t, at(18, 15 + Math.floor(rand() * 60)), OFFICE);
    t = travel(t, OFFICE, HOME, 18 + rand() * 8);
  } else if (rand() > 0.35) {
    // weekend outing
    t = travel(t, HOME, MALL, 25);
    t = dwell(t, t + (2.5 + rand() * 2) * 3600000, MALL);
    t = travel(t, MALL, HOME, 25);
  }
  dwell(t, at(23, 50), HOME);
}

mkdirSync(OUT, { recursive: true });
const out = join(OUT, "Records.json");
writeFileSync(out, JSON.stringify({ locations }, null, 1));
console.log(`Wrote ${locations.length.toLocaleString()} points for ${DAYS} days → ${out}`);
