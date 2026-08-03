/**
 * Rule-based natural-language insights. Deterministic and fully offline —
 * no LLM involved, just statistics phrased for humans.
 */
import type { Dataset } from "../types";
import { fmtDistance, fmtDuration } from "../utils";
import { byMonth, computeTotals, filterDays, type DateRange } from "./derive";

export interface Insight {
  id: string;
  icon: "trend-up" | "trend-down" | "flag" | "clock" | "map" | "repeat" | "alert";
  text: string;
  severity: "positive" | "neutral" | "attention";
}

export function generateInsights(ds: Dataset, range: DateRange): Insight[] {
  const out: Insight[] = [];
  const days = filterDays(ds, range);
  if (days.length === 0) return out;
  const totals = computeTotals(ds, range);
  let n = 0;
  const add = (icon: Insight["icon"], text: string, severity: Insight["severity"]) =>
    out.push({ id: `ins${n++}`, icon, text, severity });

  // Month-over-month travel change
  const months = [...byMonth(days).entries()];
  if (months.length >= 2) {
    const [, prev] = months[months.length - 2];
    const [curKey, cur] = months[months.length - 1];
    const prevDist = prev.reduce((s, d) => s + d.distance, 0);
    const curDist = cur.reduce((s, d) => s + d.distance, 0);
    if (prevDist > 1000) {
      const pct = Math.round(((curDist - prevDist) / prevDist) * 100);
      if (Math.abs(pct) >= 10) {
        const label = new Date(curKey + "-15").toLocaleDateString([], {
          month: "long",
        });
        add(
          pct > 0 ? "trend-up" : "trend-down",
          `Travel ${pct > 0 ? "increased" : "decreased"} ${Math.abs(pct)}% in ${label} (${fmtDistance(curDist)} vs ${fmtDistance(prevDist)}).`,
          pct > 0 ? "attention" : "positive"
        );
      }
    }
  }

  // Office attendance
  const work = ds.places.find((p) => p.label === "work");
  if (work) {
    const officeDays = days.filter((d) => d.timeAtWork > 30 * 60_000).length;
    add("flag", `Visited ${work.name} on ${officeDays} of ${days.length} days in this period.`, "neutral");
    if (totals.avgWorkingHours > 0)
      add(
        "clock",
        `Average on-site working time was ${fmtDuration(totals.avgWorkingHours)} per working day.`,
        "neutral"
      );
  }

  // Commute trend
  const home = ds.places.find((p) => p.label === "home");
  if (home && months.length >= 2) {
    const commuteAvg = (dayList: typeof days) => {
      const withTravel = dayList.filter((d) => d.travelTime > 0 && d.timeAtWork > 0);
      if (!withTravel.length) return null;
      return withTravel.reduce((s, d) => s + d.travelTime, 0) / withTravel.length;
    };
    const prevAvg = commuteAvg(months[months.length - 2][1]);
    const curAvg = commuteAvg(months[months.length - 1][1]);
    if (prevAvg && curAvg && prevAvg > 5 * 60_000) {
      const pct = Math.round(((curAvg - prevAvg) / prevAvg) * 100);
      if (Math.abs(pct) >= 10)
        add(
          pct < 0 ? "trend-down" : "trend-up",
          `Average daily travel time ${pct < 0 ? "reduced" : "grew"} by ${Math.abs(pct)}% month-over-month.`,
          pct < 0 ? "positive" : "attention"
        );
    }
  }

  // Repeated weekly travel
  const tripDays = new Map<number, number>(); // weekday → long-trip count
  for (const d of days) {
    if (d.distance > 20_000) {
      const dow = new Date(d.date + "T12:00:00").getDay();
      tripDays.set(dow, (tripDays.get(dow) ?? 0) + 1);
    }
  }
  const weeks = Math.max(1, Math.round(days.length / 7));
  for (const [dow, count] of tripDays) {
    if (count >= 3 && count / weeks > 0.6) {
      const name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow];
      add("repeat", `Recurring long-distance travel detected on ${name}s (${count} occurrences).`, "neutral");
      break;
    }
  }

  // Unusual trips & anomalies
  const unusual = ds.anomalies.filter(
    (a) => a.type === "unusual-trip" && daysContain(days, a.t)
  );
  if (unusual.length)
    add("alert", `Detected ${unusual.length} unusually long trip${unusual.length > 1 ? "s" : ""} versus this period's typical pattern.`, "attention");

  const night = ds.anomalies.filter(
    (a) => a.type === "night-travel" && daysContain(days, a.t)
  );
  if (night.length)
    add("alert", `${night.length} trip${night.length > 1 ? "s" : ""} occurred between 23:00 and 04:00.`, "attention");

  const gaps = ds.anomalies.filter((a) => a.type === "data-gap" && daysContain(days, a.t));
  if (gaps.length)
    add("map", `${gaps.length} tracking gap${gaps.length > 1 ? "s" : ""} of 6+ hours — movement in those windows is unverifiable.`, "attention");

  // Longest stop
  let longestVisit: { name: string; ms: number } | null = null;
  for (const s of ds.segments) {
    if (s.kind !== "visit") continue;
    const key = s.start;
    if (!daysContain(days, key)) continue;
    const place = ds.places.find((p) => p.id === s.placeId);
    if (place?.label === "home") continue;
    const ms = s.end - s.start;
    if (!longestVisit || ms > longestVisit.ms)
      longestVisit = { name: place?.name ?? "an unnamed location", ms };
  }
  if (longestVisit)
    add("clock", `Longest stop away from home: ${fmtDuration(longestVisit.ms)} at ${longestVisit.name}.`, "neutral");

  // Weekend share
  if (totals.distance > 0) {
    const weekendPct = Math.round((totals.weekendDistance / totals.distance) * 100);
    if (weekendPct >= 35)
      add("map", `${weekendPct}% of all distance was travelled on weekends.`, "neutral");
  }

  return out;
}

function daysContain(days: { date: string }[], t: number): boolean {
  const d = new Date(t);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  // days is sorted
  return days.length > 0 && key >= days[0].date && key <= days[days.length - 1].date;
}

/** Executive paragraph for reports. */
export function executiveSummary(ds: Dataset, range: DateRange): string {
  const totals = computeTotals(ds, range);
  const days = filterDays(ds, range);
  if (!days.length) return "No location data in the selected period.";
  const from = days[0].date;
  const to = days[days.length - 1].date;
  const work = ds.places.find((p) => p.label === "work");
  const officeDays = days.filter((d) => d.timeAtWork > 30 * 60_000).length;

  const parts = [
    `Between ${from} and ${to}, the subject travelled ${fmtDistance(totals.distance)} across ${totals.tripCount} trips, spending ${fmtDuration(totals.travelTime)} in motion.`,
    `${totals.placesVisited} distinct places were visited over ${totals.activeDays} active days (average ${fmtDistance(totals.avgDailyDistance)}/day).`,
  ];
  if (work)
    parts.push(
      `Office presence was recorded on ${officeDays} days with an average on-site time of ${fmtDuration(totals.avgWorkingHours)}.`
    );
  const flagged = ds.anomalies.filter((a) => a.severity !== "info").length;
  parts.push(
    flagged
      ? `${flagged} data-quality or behavioral flags require review.`
      : `No significant data-quality or behavioral flags were detected.`
  );
  return parts.join(" ");
}
