"use client";

/**
 * Dashboard: KPI grid, insights, trend charts and top places.
 */
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Car,
  Clock,
  Flame,
  Footprints,
  Gauge,
  Home,
  MapPin,
  Moon,
  Mountain,
  Route,
  Timer,
  TrendingDown,
  TrendingUp,
  Repeat,
  Map as MapIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store/useStore";
import {
  computeTotals,
  filterDays,
  topPlaces,
  travelRadius,
} from "@/lib/engine/derive";
import { generateInsights, type Insight } from "@/lib/engine/insights";
import {
  fmtDate,
  fmtDistance,
  fmtDuration,
  fmtSpeed,
  fmtTime,
} from "@/lib/utils";
import { Card, EmptyHint, SectionTitle, StatCard } from "@/components/ui/Card";
import { UploadZone } from "@/components/upload/UploadZone";
import { CHART_COLORS, EChart } from "@/components/charts/EChart";

export default function DashboardPage() {
  const router = useRouter();
  const { dataset, hydrated, range, setSelectedDate } = useStore();

  const totals = useMemo(
    () => (dataset ? computeTotals(dataset, range) : null),
    [dataset, range]
  );
  const days = useMemo(
    () => (dataset ? filterDays(dataset, range) : []),
    [dataset, range]
  );
  const insights = useMemo(
    () => (dataset ? generateInsights(dataset, range) : []),
    [dataset, range]
  );
  const places = useMemo(
    () => (dataset ? topPlaces(dataset, range, 6) : []),
    [dataset, range]
  );
  const radius = useMemo(
    () => (dataset ? travelRadius(dataset, range) : 0),
    [dataset, range]
  );

  if (!hydrated) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    );
  }

  if (!dataset || !totals) {
    return (
      <div className="py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Your movement history,{" "}
            <span className="text-gradient">decoded locally</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted md:text-base">
            Travel audit, attendance verification, route reconstruction and
            executive reporting from Google Timeline — without a single byte
            leaving this machine.
          </p>
        </div>
        <UploadZone />
        <LandingPreview />
      </div>
    );
  }

  const home = dataset.places.find((p) => p.label === "home");
  const work = dataset.places.find((p) => p.label === "work");

  const dailyChart = {
    grid: { left: 40, right: 12, top: 18, bottom: 24 },
    xAxis: {
      type: "category",
      data: days.map((d) => d.date.slice(5)),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k`, fontSize: 10 },
      splitLine: { lineStyle: { opacity: 0.25 } },
    },
    tooltip: {
      trigger: "axis",
      formatter: (p: { dataIndex: number }[]) => {
        const d = days[p[0].dataIndex];
        return `<b>${fmtDate(d.date)}</b><br/>${fmtDistance(d.distance)} · ${d.tripCount} trips · ${fmtDuration(d.travelTime)} travel`;
      },
    },
    series: [
      {
        type: "line",
        data: days.map((d) => Math.round(d.distance)),
        smooth: 0.35,
        symbol: "none",
        lineStyle: { width: 2.5, color: CHART_COLORS[0] },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(79,109,245,0.32)" },
              { offset: 1, color: "rgba(79,109,245,0.02)" },
            ],
          },
        },
      },
    ],
  };

  const modeTotals = new Map<string, number>();
  for (const d of days)
    for (const [mode, dist] of Object.entries(d.modes))
      modeTotals.set(mode, (modeTotals.get(mode) ?? 0) + (dist ?? 0));
  const modeChart = {
    tooltip: {
      trigger: "item",
      formatter: (p: { name: string; value: number; percent: number }) =>
        `<b>${p.name}</b><br/>${fmtDistance(p.value)} (${p.percent}%)`,
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "82%"],
        itemStyle: { borderRadius: 6, borderWidth: 2, borderColor: "transparent" },
        label: { show: false },
        data: [...modeTotals.entries()]
          .filter(([, v]) => v > 100)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value], i) => ({
            name,
            value: Math.round(value),
            itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
          })),
      },
    ],
  };

  const s = (i: number) => 0.03 * i;
  return (
    <div className="pt-6 pb-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Total distance" value={fmtDistance(totals.distance)} sub={`${days.length} days in range`} icon={<Route className="size-4" />} accent delay={s(0)} onClick={() => router.push("/analytics")} />
        <StatCard label="Travel time" value={fmtDuration(totals.travelTime)} sub={`${fmtDuration(totals.drivingTime)} driving`} icon={<Timer className="size-4" />} delay={s(1)} onClick={() => router.push("/analytics")} />
        <StatCard label="Trips" value={totals.tripCount.toLocaleString()} sub={`${totals.stopCount.toLocaleString()} stops`} icon={<Car className="size-4" />} delay={s(2)} onClick={() => router.push("/timeline")} />
        <StatCard label="Places visited" value={totals.placesVisited.toLocaleString()} sub={`${dataset.places.length} known places`} icon={<MapPin className="size-4" />} delay={s(3)} onClick={() => router.push("/map")} />
        <StatCard label="Avg daily distance" value={fmtDistance(totals.avgDailyDistance)} icon={<Gauge className="size-4" />} delay={s(4)} onClick={() => router.push("/analytics")} />
        <StatCard label="Top speed" value={fmtSpeed(totals.maxSpeed)} icon={<Flame className="size-4" />} delay={s(5)} onClick={() => router.push("/analytics")} />
        <StatCard label="Longest trip" value={totals.longestTrip ? fmtDistance(totals.longestTrip.distance) : "—"} sub={totals.longestTrip ? fmtDate(totals.longestTrip.start) : undefined} icon={<Mountain className="size-4" />} delay={s(6)}
          onClick={() => { if (totals.longestTrip) { setSelectedDate(new Date(totals.longestTrip.start).toISOString().slice(0, 10)); router.push("/timeline"); } }} />
        <StatCard label="Travel radius" value={fmtDistance(radius)} sub="max distance from home" icon={<MapIcon className="size-4" />} delay={s(7)} onClick={() => router.push("/map")} />
        <StatCard label="Working days" value={String(totals.workingDays)} sub={work ? `at ${work.name}` : "no office detected"} icon={<Briefcase className="size-4" />} delay={s(8)} onClick={() => router.push("/reports")} />
        <StatCard label="Avg working hours" value={totals.avgWorkingHours ? fmtDuration(totals.avgWorkingHours) : "—"} icon={<Clock className="size-4" />} delay={s(9)} onClick={() => router.push("/reports")} />
        <StatCard label="Time at home" value={fmtDuration(totals.timeAtHome)} sub={home ? "home detected automatically" : "no home detected"} icon={<Home className="size-4" />} delay={s(10)} />
        <StatCard label="Time outside" value={fmtDuration(totals.timeOutside)} icon={<Footprints className="size-4" />} delay={s(11)} />
        <StatCard label="Weekday distance" value={fmtDistance(totals.weekdayDistance)} icon={<Building2 className="size-4" />} delay={s(12)} />
        <StatCard label="Weekend distance" value={fmtDistance(totals.weekendDistance)} icon={<Moon className="size-4" />} delay={s(13)} />
        <StatCard label="GPS points" value={dataset.stats.totalPoints.toLocaleString()} sub={`${dataset.stats.droppedPoints.toLocaleString()} cleaned out`} icon={<Gauge className="size-4" />} delay={s(14)} />
        <StatCard label="Data flags" value={String(dataset.anomalies.length)} sub="gaps, jumps, unusual trips" icon={<AlertTriangle className="size-4" />} delay={s(15)} onClick={() => router.push("/analytics")} />
      </div>

      {/* Charts row */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Card delay={0.1} className="lg:col-span-2">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Daily distance</h3>
            <span className="text-xs text-faint">
              {fmtDate(totals.firstFix)} — {fmtDate(totals.lastFix)}
            </span>
          </div>
          {days.length ? <EChart option={dailyChart} className="h-56 w-full" /> : <EmptyHint text="No days in range" />}
        </Card>
        <Card delay={0.14}>
          <h3 className="mb-1 text-sm font-semibold">Distance by mode</h3>
          {modeTotals.size ? <EChart option={modeChart} className="h-56 w-full" /> : <EmptyHint text="No trips in range" />}
        </Card>
      </div>

      {/* Insights + top places */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <SectionTitle>AI insights</SectionTitle>
          <div className="space-y-2">
            {insights.length === 0 && <EmptyHint text="Not enough data for insights yet" />}
            {insights.map((ins, i) => (
              <InsightRow key={ins.id} insight={ins} delay={0.04 * i} />
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>Top places</SectionTitle>
          <div className="space-y-2">
            {places.length === 0 && <EmptyHint text="No visits in range" />}
            {places.map((p, i) => (
              <Card key={p.id} delay={0.04 * i} onClick={() => { useStore.getState().requestFlyTo(p.lat, p.lng, 15); router.push("/map"); }} className="flex items-center gap-3 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  {p.label === "home" ? <Home className="size-4" /> : p.label === "work" ? <Briefcase className="size-4" /> : <MapPin className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-faint">
                    {p.rangeVisits} visits · {fmtDuration(p.rangeDwell)} total
                  </div>
                </div>
                <span className="num text-xs text-muted">
                  last {fmtTime(p.lastSeen)}
                </span>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Product-shot gallery shown on the empty-state landing page. */
function LandingPreview() {
  const shots = [
    { src: "/screens/map.png", alt: "Interactive map with reconstructed routes and route replay", caption: "Route reconstruction & replay" },
    { src: "/screens/calendar.png", alt: "Calendar with per-day distance, working hours and expenses", caption: "Travel calendar & expenses" },
    { src: "/screens/timeline.png", alt: "Forensic day timeline of stops and trips", caption: "Forensic timeline" },
    { src: "/screens/analytics.png", alt: "Analytics charts and anomaly audit", caption: "Analytics & anomaly audit" },
  ];
  return (
    <section className="mx-auto mt-20 w-full max-w-5xl" aria-label="Product preview">
      <p className="mb-6 text-center text-[11px] font-semibold tracking-[0.2em] text-faint uppercase">
        What your data becomes
      </p>

      {/* hero shot in a browser frame */}
      <motion.figure
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        className="glass overflow-hidden rounded-2xl shadow-2xl"
      >
        <div className="flex items-center gap-1.5 border-b border-hairline px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-positive/70" />
          <span className="mx-auto rounded-md bg-canvas-deep/60 px-3 py-0.5 text-[10px] text-faint">
            localhost:3000 — everything stays here
          </span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/screens/dashboard.png"
          alt="Location Analyzer dashboard with travel KPIs, daily distance trend and insights"
          className="w-full"
          loading="lazy"
        />
      </motion.figure>

      {/* supporting shots */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {shots.map((s, i) => (
          <motion.figure
            key={s.src}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: 0.08 * i, ease: [0.2, 0.8, 0.2, 1] }}
            className="glass glass-hover overflow-hidden rounded-2xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.alt} className="w-full" loading="lazy" />
            <figcaption className="px-4 py-3 text-center text-xs font-medium text-muted">
              {s.caption}
            </figcaption>
          </motion.figure>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-faint">
        Screenshots generated from the bundled sample dataset — try it with{" "}
        <code className="rounded bg-canvas-deep/60 px-1.5 py-0.5">npm run sample</code>.
      </p>
    </section>
  );
}

function InsightRow({ insight, delay }: { insight: Insight; delay: number }) {
  const icons = {
    "trend-up": <TrendingUp className="size-4" />,
    "trend-down": <TrendingDown className="size-4" />,
    flag: <MapPin className="size-4" />,
    clock: <Clock className="size-4" />,
    map: <MapIcon className="size-4" />,
    repeat: <Repeat className="size-4" />,
    alert: <AlertTriangle className="size-4" />,
  } as const;
  const tone =
    insight.severity === "positive"
      ? "text-positive bg-positive/10"
      : insight.severity === "attention"
        ? "text-warning bg-warning/10"
        : "text-accent bg-accent-soft";
  return (
    <Card delay={delay} className="flex items-center gap-3 py-3">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        {icons[insight.icon]}
      </span>
      <p className="text-sm leading-snug">{insight.text}</p>
    </Card>
  );
}
