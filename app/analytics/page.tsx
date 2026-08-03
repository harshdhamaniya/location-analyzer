"use client";

/**
 * Advanced analytics: trends, distributions, working patterns, hour-of-week
 * heatmap, calendar heatmap and the data-quality / anomaly audit.
 */
import { useMemo } from "react";
import { AlertTriangle, MapPinOff, Moon, Zap } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { byMonth, filterDays, filterSegments } from "@/lib/engine/derive";
import { fmtDate, fmtDistance, fmtDuration, fmtTime } from "@/lib/utils";
import { Card, EmptyHint, SectionTitle } from "@/components/ui/Card";
import { CHART_COLORS, EChart } from "@/components/charts/EChart";

export default function AnalyticsPage() {
  const { dataset, range, requestFlyTo } = useStore();

  const days = useMemo(() => (dataset ? filterDays(dataset, range) : []), [dataset, range]);
  const segs = useMemo(() => (dataset ? filterSegments(dataset, range) : []), [dataset, range]);
  const trips = useMemo(() => segs.filter((s) => s.kind === "trip"), [segs]);

  const monthly = useMemo(() => {
    const m = byMonth(days);
    return [...m.entries()].map(([key, list]) => ({
      key,
      distance: list.reduce((s, d) => s + d.distance, 0),
      travel: list.reduce((s, d) => s + d.travelTime, 0),
      trips: list.reduce((s, d) => s + d.tripCount, 0),
    }));
  }, [days]);

  const weekdayAvg = useMemo(() => {
    const sums = Array(7).fill(0);
    const counts = Array(7).fill(0);
    for (const d of days) {
      const dow = (new Date(d.date + "T12:00:00").getDay() + 6) % 7;
      sums[dow] += d.distance;
      counts[dow]++;
    }
    return sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  }, [days]);

  const hourHeat = useMemo(() => {
    // [dow 0-6][hour 0-23] → minutes in motion
    const grid: number[][] = [];
    for (const s of segs) {
      if (s.kind !== "trip") continue;
      let cur = s.start;
      while (cur < s.end) {
        const d = new Date(cur);
        const hourEnd = new Date(d).setMinutes(60, 0, 0);
        const slice = Math.min(s.end, hourEnd) - cur;
        grid.push([(d.getDay() + 6) % 7, d.getHours(), slice / 60000]);
        cur = hourEnd;
      }
    }
    const agg = new Map<string, number>();
    for (const [dow, h, min] of grid) {
      const k = `${dow}-${h}`;
      agg.set(k, (agg.get(k) ?? 0) + min);
    }
    return [...agg.entries()].map(([k, v]) => {
      const [dow, h] = k.split("-").map(Number);
      return [h, dow, Math.round(v)];
    });
  }, [segs]);

  const distHistogram = useMemo(() => {
    const buckets = [1, 2, 5, 10, 20, 50, 100, 250, Infinity];
    const labels = ["<1", "1–2", "2–5", "5–10", "10–20", "20–50", "50–100", "100–250", "250+"];
    const counts = Array(buckets.length).fill(0);
    for (const t of trips) {
      const km = t.kind === "trip" ? t.distance / 1000 : 0;
      const idx = buckets.findIndex((b) => km < b);
      counts[idx >= 0 ? idx : buckets.length - 1]++;
    }
    return { labels, counts };
  }, [trips]);

  const speedProfile = useMemo(() => {
    if (!dataset) return { labels: [] as string[], counts: [] as number[] };
    const buckets = [5, 15, 30, 50, 80, 120, Infinity];
    const labels = ["0–5", "5–15", "15–30", "30–50", "50–80", "80–120", "120+"];
    const counts = Array(buckets.length).fill(0);
    const { speed } = dataset.points;
    for (let i = 0; i < speed.length; i++) {
      const kmh = speed[i] * 3.6;
      if (Number.isNaN(kmh) || kmh < 1) continue;
      const idx = buckets.findIndex((b) => kmh < b);
      counts[idx >= 0 ? idx : buckets.length - 1]++;
    }
    return { labels, counts };
  }, [dataset]);

  const calendarHeat = useMemo(
    () => days.map((d) => [d.date, Math.round(d.distance / 1000)]),
    [days]
  );

  const anomalies = useMemo(() => {
    if (!dataset) return [];
    const from = range.from ? new Date(range.from + "T00:00:00").getTime() : -Infinity;
    const to = range.to ? new Date(range.to + "T00:00:00").getTime() + 86400_000 : Infinity;
    return dataset.anomalies.filter((a) => a.t >= from && a.t < to).slice(0, 120);
  }, [dataset, range]);

  if (!dataset) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-faint">
        Import location data to see analytics.
      </div>
    );
  }

  const axis = (data: string[]) => ({
    type: "category" as const,
    data,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { fontSize: 10 },
  });
  const yAxis = {
    type: "value" as const,
    splitLine: { lineStyle: { opacity: 0.25 } },
    axisLabel: { fontSize: 10 },
  };

  return (
    <div className="pt-6 pb-6">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h3 className="mb-1 text-sm font-semibold">Monthly distance trend</h3>
          {monthly.length ? (
            <EChart
              className="h-60 w-full"
              option={{
                grid: { left: 44, right: 12, top: 16, bottom: 24 },
                xAxis: axis(monthly.map((m) => m.key)),
                yAxis,
                tooltip: {
                  trigger: "axis",
                  formatter: (p: { dataIndex: number }[]) => {
                    const m = monthly[p[0].dataIndex];
                    return `<b>${m.key}</b><br/>${fmtDistance(m.distance)} · ${m.trips} trips<br/>${fmtDuration(m.travel)} in motion`;
                  },
                },
                series: [
                  {
                    type: "bar",
                    data: monthly.map((m) => Math.round(m.distance / 1000)),
                    itemStyle: { color: CHART_COLORS[0], borderRadius: [6, 6, 0, 0] },
                    barMaxWidth: 26,
                  },
                ],
              }}
            />
          ) : (
            <EmptyHint text="No data" />
          )}
        </Card>

        <Card delay={0.05}>
          <h3 className="mb-1 text-sm font-semibold">Average distance by weekday</h3>
          <EChart
            className="h-60 w-full"
            option={{
              grid: { left: 44, right: 12, top: 16, bottom: 24 },
              xAxis: axis(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
              yAxis,
              tooltip: {
                trigger: "axis",
                formatter: (p: { dataIndex: number; name: string }[]) =>
                  `<b>${p[0].name}</b><br/>${fmtDistance(weekdayAvg[p[0].dataIndex])} avg`,
              },
              series: [
                {
                  type: "bar",
                  data: weekdayAvg.map((v, i) => ({
                    value: Math.round(v / 1000),
                    itemStyle: {
                      color: i >= 5 ? CHART_COLORS[1] : CHART_COLORS[0],
                      borderRadius: [6, 6, 0, 0],
                    },
                  })),
                  barMaxWidth: 30,
                },
              ],
            }}
          />
        </Card>

        <Card delay={0.08}>
          <h3 className="mb-1 text-sm font-semibold">Trip distance distribution (km)</h3>
          <EChart
            className="h-60 w-full"
            option={{
              grid: { left: 40, right: 12, top: 16, bottom: 24 },
              xAxis: axis(distHistogram.labels),
              yAxis,
              tooltip: { trigger: "axis" },
              series: [
                {
                  type: "bar",
                  name: "trips",
                  data: distHistogram.counts,
                  itemStyle: { color: CHART_COLORS[2], borderRadius: [6, 6, 0, 0] },
                  barMaxWidth: 30,
                },
              ],
            }}
          />
        </Card>

        <Card delay={0.11}>
          <h3 className="mb-1 text-sm font-semibold">Speed profile (km/h, GPS samples)</h3>
          <EChart
            className="h-60 w-full"
            option={{
              grid: { left: 48, right: 12, top: 16, bottom: 24 },
              xAxis: axis(speedProfile.labels),
              yAxis,
              tooltip: { trigger: "axis" },
              series: [
                {
                  type: "bar",
                  name: "samples",
                  data: speedProfile.counts,
                  itemStyle: { color: CHART_COLORS[3], borderRadius: [6, 6, 0, 0] },
                  barMaxWidth: 30,
                },
              ],
            }}
          />
        </Card>
      </div>

      <SectionTitle>Working pattern — travel minutes by hour & weekday</SectionTitle>
      <Card>
        <EChart
          className="h-64 w-full"
          option={{
            grid: { left: 46, right: 20, top: 10, bottom: 40 },
            tooltip: {
              formatter: (p: { value: [number, number, number] }) =>
                `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][p.value[1]]} ${String(p.value[0]).padStart(2, "0")}:00 — <b>${p.value[2]} min</b> in motion`,
            },
            xAxis: {
              type: "category",
              data: Array.from({ length: 24 }, (_, h) => `${h}`),
              splitArea: { show: true },
              axisLabel: { fontSize: 9 },
            },
            yAxis: {
              type: "category",
              data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
              splitArea: { show: true },
              axisLabel: { fontSize: 10 },
            },
            visualMap: {
              min: 0,
              max: Math.max(30, ...hourHeat.map((h) => h[2])),
              calculable: false,
              orient: "horizontal",
              left: "center",
              bottom: 0,
              itemHeight: 90,
              textStyle: { fontSize: 9 },
              inRange: { color: ["rgba(79,109,245,0.06)", "#4f6df5", "#8b5cf6", "#f43f5e"] },
            },
            series: [{ type: "heatmap", data: hourHeat }],
          }}
        />
      </Card>

      <SectionTitle>Travel calendar heatmap</SectionTitle>
      <Card>
        {calendarHeat.length ? (
          <EChart
            className="h-56 w-full"
            option={{
              tooltip: {
                formatter: (p: { value: [string, number] }) =>
                  `<b>${fmtDate(p.value[0])}</b><br/>${p.value[1]} km`,
              },
              visualMap: {
                min: 0,
                max: Math.max(10, ...calendarHeat.map((c) => Number(c[1]))),
                show: false,
                inRange: { color: ["rgba(79,109,245,0.10)", "#4f6df5", "#8b5cf6"] },
              },
              calendar: {
                range: [days[0]?.date, days[days.length - 1]?.date],
                cellSize: ["auto", 14],
                top: 24,
                left: 40,
                right: 8,
                itemStyle: { borderWidth: 2, borderColor: "transparent", color: "rgba(127,127,127,0.06)" },
                splitLine: { show: false },
                dayLabel: { fontSize: 9 },
                monthLabel: { fontSize: 10 },
                yearLabel: { show: false },
              },
              series: [{ type: "heatmap", coordinateSystem: "calendar", data: calendarHeat }],
            }}
          />
        ) : (
          <EmptyHint text="No data" />
        )}
      </Card>

      <SectionTitle>Data quality & suspicious movement</SectionTitle>
      <div className="grid gap-2 lg:grid-cols-2">
        {anomalies.length === 0 && <EmptyHint text="No anomalies detected in this range." />}
        {anomalies.map((a, i) => (
          <Card
            key={a.id}
            delay={Math.min(i * 0.02, 0.3)}
            onClick={a.lat != null ? () => requestFlyTo(a.lat!, a.lng!, 13) : undefined}
            className="flex items-center gap-3 py-3"
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                a.severity === "high"
                  ? "bg-danger/12 text-danger"
                  : a.severity === "warn"
                    ? "bg-warning/12 text-warning"
                    : "bg-accent-soft text-accent"
              }`}
            >
              {a.type === "night-travel" ? (
                <Moon className="size-4" />
              ) : a.type === "data-gap" ? (
                <MapPinOff className="size-4" />
              ) : a.type === "impossible-speed" ? (
                <Zap className="size-4" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{a.detail}</p>
              <p className="text-xs text-faint">
                {fmtDate(a.t)} · {fmtTime(a.t)} · {a.type.replace(/-/g, " ")}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
