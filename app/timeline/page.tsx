"use client";

/**
 * Forensic timeline: chronological visits & trips for a selected day, with
 * search, filtering and jump-to-map.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bike,
  Briefcase,
  Car,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Home,
  MapPin,
  Plane,
  Search,
  Train,
  ExternalLink,
} from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { daySegments, filterDays, placeById } from "@/lib/engine/derive";
import type { MoveMode, Segment } from "@/lib/types";
import {
  cn,
  fmtDistance,
  fmtDuration,
  fmtSpeed,
  fmtTime,
} from "@/lib/utils";
import { Card, EmptyHint } from "@/components/ui/Card";

const MODE_ICON: Record<MoveMode, React.ReactNode> = {
  walking: <Footprints className="size-4" />,
  running: <Footprints className="size-4" />,
  cycling: <Bike className="size-4" />,
  driving: <Car className="size-4" />,
  transit: <Train className="size-4" />,
  flying: <Plane className="size-4" />,
  still: <MapPin className="size-4" />,
  unknown: <Car className="size-4" />,
};

export default function TimelinePage() {
  const router = useRouter();
  const { dataset, range, selectedDate, setSelectedDate, requestFlyTo, selectSegment } =
    useStore();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "visit" | "trip">("all");

  const days = useMemo(
    () => (dataset ? filterDays(dataset, range) : []),
    [dataset, range]
  );

  const date = selectedDate ?? days[days.length - 1]?.date ?? null;
  const dayIdx = days.findIndex((d) => d.date === date);

  const segments = useMemo(() => {
    if (!dataset || !date) return [];
    let segs = daySegments(dataset, date);
    if (kindFilter !== "all") segs = segs.filter((s) => s.kind === kindFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      segs = segs.filter((s) => {
        if (s.kind === "visit") {
          const place = placeById(dataset, s.placeId);
          return (
            place?.name.toLowerCase().includes(q) ||
            s.name?.toLowerCase().includes(q) ||
            s.address?.toLowerCase().includes(q)
          );
        }
        return s.mode.includes(q);
      });
    }
    return segs;
  }, [dataset, date, query, kindFilter]);

  if (!dataset)
    return <EmptyHintPage text="Import location data to explore the timeline." />;
  if (!date)
    return <EmptyHintPage text="No days available in the selected range." />;

  const dayStat = days[dayIdx];

  return (
    <div className="mx-auto max-w-3xl pt-6">
      {/* day navigator */}
      <Card className="flex flex-wrap items-center gap-3">
        <button
          disabled={dayIdx <= 0}
          onClick={() => setSelectedDate(days[dayIdx - 1].date)}
          className="rounded-xl border border-hairline p-2 text-muted transition hover:text-ink disabled:opacity-30"
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <input
            type="date"
            value={date}
            min={days[0]?.date}
            max={days[days.length - 1]?.date}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="bg-transparent text-center text-[15px] font-semibold outline-none"
            aria-label="Select day"
          />
          {dayStat && (
            <p className="text-xs text-faint">
              {fmtDistance(dayStat.distance)} · {dayStat.tripCount} trips ·{" "}
              {fmtDuration(dayStat.travelTime)} travelling ·{" "}
              {dayStat.visitCount} stops
            </p>
          )}
        </div>
        <button
          disabled={dayIdx < 0 || dayIdx >= days.length - 1}
          onClick={() => setSelectedDate(days[dayIdx + 1].date)}
          className="rounded-xl border border-hairline p-2 text-muted transition hover:text-ink disabled:opacity-30"
          aria-label="Next day"
        >
          <ChevronRight className="size-4" />
        </button>
      </Card>

      {/* filters */}
      <div className="mt-3 flex items-center gap-2">
        <div className="glass flex flex-1 items-center gap-2 rounded-xl px-3">
          <Search className="size-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search places, addresses, modes…"
            className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
        {(["all", "visit", "trip"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={cn(
              "rounded-xl px-3 py-2 text-xs font-medium capitalize transition-colors",
              kindFilter === k
                ? "bg-accent-soft text-accent ring-1 ring-accent/30"
                : "glass text-muted hover:text-ink"
            )}
          >
            {k === "all" ? "All" : k === "visit" ? "Stops" : "Trips"}
          </button>
        ))}
      </div>

      {/* timeline */}
      <div className="relative mt-5 pb-10 pl-5">
        <div className="absolute top-2 bottom-2 left-[27px] w-px bg-gradient-to-b from-accent/60 via-hairline to-accent-2/60" />
        {segments.length === 0 && <EmptyHint text="Nothing recorded for this day." />}
        <AnimatePresence mode="popLayout">
          {segments.map((seg, i) => (
            <TimelineRow
              key={seg.id}
              seg={seg}
              delay={Math.min(i * 0.03, 0.4)}
              onMap={() => {
                const lat = seg.kind === "visit" ? seg.lat : seg.startLat;
                const lng = seg.kind === "visit" ? seg.lng : seg.startLng;
                selectSegment(seg.id);
                requestFlyTo(lat, lng, 14);
                router.push("/map");
              }}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TimelineRow({
  seg,
  delay,
  onMap,
}: {
  seg: Segment;
  delay: number;
  onMap: () => void;
}) {
  const dataset = useStore((s) => s.dataset)!;
  const isVisit = seg.kind === "visit";
  const place = isVisit ? placeById(dataset, seg.placeId) : undefined;
  const title = isVisit
    ? (place?.name ?? seg.name ?? "Unknown place")
    : `${seg.mode[0].toUpperCase()}${seg.mode.slice(1)} · ${fmtDistance(seg.distance)}`;

  const icon = isVisit
    ? place?.label === "home"
      ? <Home className="size-4" />
      : place?.label === "work"
        ? <Briefcase className="size-4" />
        : <MapPin className="size-4" />
    : MODE_ICON[seg.mode];

  const tone = isVisit
    ? place?.label === "home"
      ? "bg-positive/12 text-positive"
      : place?.label === "work"
        ? "bg-warning/12 text-warning"
        : "bg-accent-soft text-accent"
    : "bg-accent-2/12 text-accent-2";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.3, delay, ease: [0.2, 0.8, 0.2, 1] }}
      className="group relative mb-2.5 flex gap-3"
    >
      <span
        className={cn(
          "relative z-[1] mt-2 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-[var(--canvas)]",
          tone
        )}
      >
        {icon}
      </span>
      <div className={cn("glass min-w-0 flex-1 rounded-2xl px-4 py-3", !isVisit && "opacity-90")}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-xs font-semibold text-muted">
            {fmtTime(seg.start)} – {fmtTime(seg.end)}
          </span>
          <span className="text-xs text-faint">{fmtDuration(seg.end - seg.start)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="truncate text-xs text-faint">
              {isVisit
                ? (seg.address ??
                  `${seg.lat.toFixed(4)}, ${seg.lng.toFixed(4)}${seg.inferred ? " · inferred stop" : ""}`)
                : `avg ${seg.avgSpeed ? fmtSpeed(seg.avgSpeed) : "—"}${seg.maxSpeed ? ` · max ${fmtSpeed(seg.maxSpeed)}` : ""}${seg.inferred ? " · inferred" : ""}`}
            </p>
          </div>
          <button
            onClick={onMap}
            className="shrink-0 rounded-lg p-1.5 text-faint opacity-0 transition group-hover:opacity-100 hover:bg-accent-soft hover:text-accent"
            aria-label="Show on map"
            title="Show on map"
          >
            <ExternalLink className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyHintPage({ text }: { text: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center text-sm text-faint">
      {text}
    </div>
  );
}
