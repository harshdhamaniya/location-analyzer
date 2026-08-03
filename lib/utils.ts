import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const R_EARTH = 6371000; // meters

/** Great-circle distance in meters. */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

/** Format meters → "12.4 km" / "830 m". */
export function fmtDistance(m: number): string {
  if (!isFinite(m)) return "—";
  if (m >= 100000) return `${Math.round(m / 1000).toLocaleString()} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

/** Format ms → "3h 24m" / "42m" / "18s". */
export function fmtDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** m/s → "54 km/h" */
export function fmtSpeed(ms: number): string {
  if (!isFinite(ms)) return "—";
  return `${Math.round(ms * 3.6)} km/h`;
}

export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(t: number | string): string {
  const d = typeof t === "string" ? new Date(t + "T00:00:00") : new Date(t);
  return d.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtCoord(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Local calendar day key YYYY-MM-DD for an epoch ms. */
export function dayKey(t: number): string {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of local day for a YYYY-MM-DD key. */
export function dayStart(key: string): number {
  return new Date(key + "T00:00:00").getTime();
}

let idCounter = 0;
/** Fast locally-unique id (no crypto needed — never leaves the machine). */
export function uid(prefix = "id"): string {
  idCounter = (idCounter + 1) % 0xffffff;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Human-readable byte size. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
