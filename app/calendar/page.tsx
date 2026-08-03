"use client";

/**
 * Monthly calendar: per-day distance / trips / working hours at a glance,
 * heat-tinted by travel volume. Clicking a day opens its timeline report.
 */
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { estimateExpenses } from "@/lib/engine/expense";
import type { DayStat } from "@/lib/types";
import { cn, fmtDistance, fmtDuration } from "@/lib/utils";
import { Card } from "@/components/ui/Card";

export default function CalendarPage() {
  const router = useRouter();
  const { dataset, setSelectedDate, expenseRates } = useStore();
  const [month, setMonth] = useState<string | null>(null); // YYYY-MM

  const byDate = useMemo(() => {
    const m = new Map<string, DayStat>();
    for (const d of dataset?.days ?? []) m.set(d.date, d);
    return m;
  }, [dataset]);

  const months = useMemo(() => {
    const s = new Set<string>();
    for (const d of dataset?.days ?? []) s.add(d.date.slice(0, 7));
    return [...s].sort();
  }, [dataset]);

  const current = month ?? months[months.length - 1] ?? null;

  const expenses = useMemo(() => {
    if (!dataset || !current) return null;
    const from = `${current}-01`;
    const to = `${current}-31`;
    return estimateExpenses(dataset, { from, to }, expenseRates);
  }, [dataset, current, expenseRates]);

  if (!dataset || !current) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-faint">
        Import location data to see the calendar.
      </div>
    );
  }

  const [year, mon] = current.split("-").map(Number);
  const first = new Date(year, mon - 1, 1);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const startPad = (first.getDay() + 6) % 7; // Monday first
  const monthIdx = months.indexOf(current);

  const monthDays = [...byDate.values()].filter((d) => d.date.startsWith(current));
  const monthDistance = monthDays.reduce((s, d) => s + d.distance, 0);
  const monthTrips = monthDays.reduce((s, d) => s + d.tripCount, 0);
  const maxDayDist = Math.max(1, ...monthDays.map((d) => d.distance));

  const cells: (string | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${current}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <Card className="flex flex-wrap items-center gap-3">
        <button
          disabled={monthIdx <= 0}
          onClick={() => setMonth(months[monthIdx - 1])}
          className="rounded-xl border border-hairline p-2 text-muted transition hover:text-ink disabled:opacity-30"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex-1 text-center">
          <h2 className="text-[15px] font-semibold">
            {first.toLocaleDateString([], { month: "long", year: "numeric" })}
          </h2>
          <p className="text-xs text-faint">
            {fmtDistance(monthDistance)} · {monthTrips} trips ·{" "}
            {monthDays.length} tracked days
            {expenses && expenses.total > 0 && (
              <>
                {" "}· est. expenses {expenseRates.currency}
                {Math.round(expenses.total).toLocaleString()}
              </>
            )}
          </p>
        </div>
        <button
          disabled={monthIdx < 0 || monthIdx >= months.length - 1}
          onClick={() => setMonth(months[monthIdx + 1])}
          className="rounded-xl border border-hairline p-2 text-muted transition hover:text-ink disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
      </Card>

      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold tracking-wide text-faint uppercase">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((dateKey, i) => {
          if (!dateKey) return <div key={`pad${i}`} />;
          const stat = byDate.get(dateKey);
          const heat = stat ? Math.min(1, stat.distance / maxDayDist) : 0;
          const dayExp = expenses?.perDay.get(dateKey);
          return (
            <motion.button
              key={dateKey}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.012, 0.35), duration: 0.25 }}
              onClick={() => {
                setSelectedDate(dateKey);
                router.push("/timeline");
              }}
              className={cn(
                "glass glass-hover flex min-h-[92px] flex-col rounded-xl p-2 text-left",
                !stat && "opacity-45"
              )}
              style={
                heat > 0.02
                  ? {
                      background: `linear-gradient(160deg, color-mix(in srgb, var(--accent) ${Math.round(
                        8 + heat * 26
                      )}%, var(--panel-solid)), var(--panel))`,
                    }
                  : undefined
              }
            >
              <span className="num text-xs font-semibold">{Number(dateKey.slice(8))}</span>
              {stat ? (
                <span className="mt-auto space-y-0.5 text-[10px] leading-tight text-muted">
                  <span className="num block font-semibold text-ink">
                    {fmtDistance(stat.distance)}
                  </span>
                  <span className="block">
                    {stat.tripCount} trips · {stat.visitCount} stops
                  </span>
                  {stat.timeAtWork > 30 * 60_000 && (
                    <span className="block text-warning">
                      {fmtDuration(stat.timeAtWork)} at work
                    </span>
                  )}
                  {dayExp != null && dayExp > 0 && (
                    <span className="block text-positive">
                      ~{expenseRates.currency}
                      {Math.round(dayExp)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="mt-auto text-[10px] text-faint">no data</span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
