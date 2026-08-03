/**
 * Expense estimation from movement data. All rates are user-configurable —
 * these are estimates for reimbursement review, not invoices.
 */
import type { Dataset, ExpenseRates, Segment } from "../types";
import { dayKey } from "../utils";
import { filterDays, filterSegments, type DateRange } from "./derive";

export interface ExpenseBreakdown {
  mileageKm: number;
  mileageCost: number;
  allowanceDays: number;
  allowanceCost: number;
  parkingStops: number;
  parkingCost: number;
  total: number;
  perDay: Map<string, number>;
}

export function estimateExpenses(
  ds: Dataset,
  range: DateRange,
  rates: ExpenseRates
): ExpenseBreakdown {
  const days = filterDays(ds, range);
  const segs = filterSegments(ds, range);

  let mileageKm = 0;
  let parkingStops = 0;
  const perDay = new Map<string, number>();
  const bump = (date: string, amt: number) =>
    perDay.set(date, (perDay.get(date) ?? 0) + amt);

  const homeId = ds.places.find((p) => p.label === "home")?.id;

  let prev: Segment | null = null;
  for (const s of segs) {
    if (s.kind === "trip" && (s.mode === "driving" || s.mode === "unknown")) {
      const km = s.distance / 1000;
      mileageKm += km;
      bump(dayKey(s.start), km * rates.mileageRate);
    }
    // Parking heuristic: arrived by car and stopped ≥ 1 h somewhere ≠ home.
    if (
      s.kind === "visit" &&
      s.placeId !== homeId &&
      s.end - s.start >= 3600_000 &&
      prev?.kind === "trip" &&
      prev.mode === "driving"
    ) {
      parkingStops++;
      bump(dayKey(s.start), rates.parkingPerStop);
    }
    prev = s;
  }

  const allowanceDays = days.filter((d) => d.distance > 5000).length;
  for (const d of days) if (d.distance > 5000) bump(d.date, rates.dailyAllowance);

  const mileageCost = mileageKm * rates.mileageRate;
  const allowanceCost = allowanceDays * rates.dailyAllowance;
  const parkingCost = parkingStops * rates.parkingPerStop;

  return {
    mileageKm,
    mileageCost,
    allowanceDays,
    allowanceCost,
    parkingStops,
    parkingCost,
    total: mileageCost + allowanceCost + parkingCost,
    perDay,
  };
}
