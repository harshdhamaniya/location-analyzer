"use client";

/**
 * Reports: executive summary, attendance audit, expense estimation and
 * one-click exports (print-ready PDF, Excel, CSV).
 */
import { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Table,
} from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import {
  computeAttendance,
  computeTotals,
  filterDays,
  topPlaces,
} from "@/lib/engine/derive";
import { estimateExpenses } from "@/lib/engine/expense";
import { executiveSummary, generateInsights } from "@/lib/engine/insights";
import {
  exportDaysCsv,
  exportExcel,
  exportPointsCsv,
  exportSegmentsCsv,
} from "@/lib/export/exports";
import { fmtDistance, fmtDuration } from "@/lib/utils";
import { Card, EmptyHint, SectionTitle } from "@/components/ui/Card";

export default function ReportsPage() {
  const { dataset, range, expenseRates } = useStore();
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => (dataset ? computeTotals(dataset, range) : null), [dataset, range]);
  const days = useMemo(() => (dataset ? filterDays(dataset, range) : []), [dataset, range]);
  const attendance = useMemo(() => (dataset ? computeAttendance(dataset, range) : null), [dataset, range]);
  const expenses = useMemo(
    () => (dataset ? estimateExpenses(dataset, range, expenseRates) : null),
    [dataset, range, expenseRates]
  );
  const summary = useMemo(() => (dataset ? executiveSummary(dataset, range) : ""), [dataset, range]);
  const insights = useMemo(() => (dataset ? generateInsights(dataset, range) : []), [dataset, range]);
  const places = useMemo(() => (dataset ? topPlaces(dataset, range, 8) : []), [dataset, range]);

  if (!dataset || !totals || !expenses) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-faint">
        Import location data to generate reports.
      </div>
    );
  }

  const period = `${days[0]?.date ?? "—"} → ${days[days.length - 1]?.date ?? "—"}`;
  const minToHHMM = (m: number | null) =>
    m == null ? "—" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-10">
      {/* export bar */}
      <div className="no-print flex flex-wrap gap-2">
        <ExportBtn icon={<Printer className="size-4" />} label="Print / Save as PDF" onClick={() => window.print()} primary />
        <ExportBtn
          icon={<FileSpreadsheet className="size-4" />}
          label={busy ? "Building…" : "Excel workbook"}
          onClick={async () => {
            setBusy(true);
            try {
              await exportExcel(dataset, range, expenseRates);
            } finally {
              setBusy(false);
            }
          }}
        />
        <ExportBtn icon={<Table className="size-4" />} label="Daily CSV" onClick={() => exportDaysCsv(dataset, range)} />
        <ExportBtn icon={<FileText className="size-4" />} label="Segments CSV" onClick={() => exportSegmentsCsv(dataset, range)} />
        <ExportBtn icon={<Download className="size-4" />} label="GPS points CSV" onClick={() => exportPointsCsv(dataset, range)} />
      </div>

      {/* printable report */}
      <div className="print-block mt-6">
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Location Audit Report</h2>
              <p className="mt-0.5 text-xs text-muted">
                Period {period} · generated {new Date().toLocaleString()} · Location Analyzer (offline)
              </p>
            </div>
            <div className="rounded-xl bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
              CONFIDENTIAL
            </div>
          </div>

          <h3 className="mt-6 mb-2 text-sm font-semibold">Executive summary</h3>
          <p className="text-sm leading-relaxed text-muted">{summary}</p>

          {insights.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {insights.slice(0, 6).map((i) => (
                <li key={i.id}>{i.text}</li>
              ))}
            </ul>
          )}

          <h3 className="mt-6 mb-2 text-sm font-semibold">Travel summary</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
            <KV k="Total distance" v={fmtDistance(totals.distance)} />
            <KV k="Travel time" v={fmtDuration(totals.travelTime)} />
            <KV k="Driving time" v={fmtDuration(totals.drivingTime)} />
            <KV k="Trips" v={String(totals.tripCount)} />
            <KV k="Stops" v={String(totals.stopCount)} />
            <KV k="Places visited" v={String(totals.placesVisited)} />
            <KV k="Active days" v={String(totals.activeDays)} />
            <KV k="Avg daily distance" v={fmtDistance(totals.avgDailyDistance)} />
            <KV k="Time at home" v={fmtDuration(totals.timeAtHome)} />
          </div>

          {attendance && (
            <>
              <h3 className="mt-6 mb-2 text-sm font-semibold">Attendance</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
                <KV k="Working days (Mon–Fri)" v={String(attendance.workingDays)} />
                <KV k="Present at office" v={String(attendance.presentDays)} />
                <KV k="Leaves / absences" v={String(attendance.leaveDays)} />
                <KV k="Late arrivals" v={String(attendance.lateArrivals)} />
                <KV k="Early departures" v={String(attendance.earlyDepartures)} />
                <KV k="Avg arrival" v={minToHHMM(attendance.avgArrival)} />
                <KV k="Avg departure" v={minToHHMM(attendance.avgDeparture)} />
                <KV k="Avg commute" v={attendance.avgCommuteMs ? fmtDuration(attendance.avgCommuteMs) : "—"} />
                <KV k="Longest commute" v={attendance.longestCommuteMs ? fmtDuration(attendance.longestCommuteMs) : "—"} />
              </div>
            </>
          )}

          <h3 className="mt-6 mb-2 text-sm font-semibold">Expense estimation</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-faint">
                <th className="py-1.5 font-medium">Item</th>
                <th className="py-1.5 font-medium">Quantity</th>
                <th className="py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <ExpRow k="Mileage (driving)" q={`${expenses.mileageKm.toFixed(1)} km × ${expenseRates.currency}${expenseRates.mileageRate}/km`} v={expenses.mileageCost} c={expenseRates.currency} />
              <ExpRow k="Daily allowance" q={`${expenses.allowanceDays} travel days`} v={expenses.allowanceCost} c={expenseRates.currency} />
              <ExpRow k="Parking (est.)" q={`${expenses.parkingStops} stops`} v={expenses.parkingCost} c={expenseRates.currency} />
              <tr className="border-t border-hairline font-semibold">
                <td className="py-2">Total estimated reimbursement</td>
                <td />
                <td className="num py-2 text-right">
                  {expenseRates.currency}
                  {Math.round(expenses.total).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>

          <h3 className="mt-6 mb-2 text-sm font-semibold">Most visited locations</h3>
          {places.length === 0 ? (
            <EmptyHint text="No visits in range" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-faint">
                  <th className="py-1.5 font-medium">Place</th>
                  <th className="py-1.5 font-medium">Type</th>
                  <th className="py-1.5 text-right font-medium">Visits</th>
                  <th className="py-1.5 text-right font-medium">Total time</th>
                </tr>
              </thead>
              <tbody>
                {places.map((p) => (
                  <tr key={p.id} className="border-b border-hairline/50">
                    <td className="max-w-56 truncate py-1.5">{p.name}</td>
                    <td className="py-1.5 capitalize">{p.label}</td>
                    <td className="num py-1.5 text-right">{p.rangeVisits}</td>
                    <td className="num py-1.5 text-right">{fmtDuration(p.rangeDwell)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <SectionTitle>Daily log</SectionTitle>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-hairline print:max-h-none print:overflow-visible">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel">
                <tr className="text-left text-xs text-faint">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Distance</th>
                  <th className="px-3 py-2 text-right font-medium">Travel</th>
                  <th className="px-3 py-2 text-right font-medium">Trips</th>
                  <th className="px-3 py-2 text-right font-medium">At work</th>
                  <th className="px-3 py-2 text-right font-medium">Est. exp.</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date} className="border-t border-hairline/50">
                    <td className="num px-3 py-1.5">{d.date}</td>
                    <td className="num px-3 py-1.5 text-right">{fmtDistance(d.distance)}</td>
                    <td className="num px-3 py-1.5 text-right">{fmtDuration(d.travelTime)}</td>
                    <td className="num px-3 py-1.5 text-right">{d.tripCount}</td>
                    <td className="num px-3 py-1.5 text-right">
                      {d.timeAtWork ? fmtDuration(d.timeAtWork) : "—"}
                    </td>
                    <td className="num px-3 py-1.5 text-right">
                      {expenses.perDay.get(d.date)
                        ? `${expenseRates.currency}${Math.round(expenses.perDay.get(d.date)!)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* sign-off */}
          <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-muted print:mt-16">
            <div>
              <div className="h-10 border-b border-hairline" />
              <p className="mt-1.5">Prepared by · date</p>
            </div>
            <div>
              <div className="h-10 border-b border-hairline" />
              <p className="mt-1.5">Approved by · date</p>
            </div>
          </div>
          <p className="mt-6 text-[10px] leading-relaxed text-faint">
            Generated fully offline by Location Analyzer from Google Timeline export data.
            Distances, times, attendance and expenses are estimates derived from GPS records
            and may be affected by device accuracy, tracking gaps and inference heuristics.
          </p>
        </Card>
      </div>
    </div>
  );
}

function ExportBtn({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        primary
          ? "flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.02]"
          : "glass glass-hover flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted hover:text-ink"
      }
    >
      {icon}
      {label}
    </button>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-hairline/40 py-1">
      <span className="text-faint">{k}</span>
      <span className="num font-medium">{v}</span>
    </div>
  );
}

function ExpRow({ k, q, v, c }: { k: string; q: string; v: number; c: string }) {
  return (
    <tr className="border-b border-hairline/50">
      <td className="py-1.5">{k}</td>
      <td className="py-1.5 text-muted">{q}</td>
      <td className="num py-1.5 text-right">
        {c}
        {Math.round(v).toLocaleString()}
      </td>
    </tr>
  );
}
