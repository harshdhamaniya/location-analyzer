"use client";

/**
 * Interactive map (MapLibre GL): reconstructed routes colored by mode/speed,
 * GPS point inspection, heatmap, place markers, direction arrows and a full
 * route-replay engine with variable speed.
 */
import * as maplibregl from "maplibre-gl";
import {
  type GeoJSONSource,
  type Map as MLMap,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Flame,
  Layers,
  MapPin,
  Pause,
  Play,
  Route as RouteIcon,
  ScanSearch,
  Waypoints,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import type { Trip } from "@/lib/types";
import { lowerBound } from "@/lib/engine/clean";
import { cn, dayKey, fmtCoord, fmtDistance, fmtDuration, fmtSpeed, fmtTime, haversine } from "@/lib/utils";

type Basemap = "light" | "dark" | "satellite" | "none";

const MODE_COLORS: Record<string, string> = {
  walking: "#10b981",
  running: "#14b8a6",
  cycling: "#06b6d4",
  driving: "#4f6df5",
  transit: "#8b5cf6",
  flying: "#f43f5e",
  still: "#94a3b8",
  unknown: "#64748b",
};

const MAX_RENDER_POINTS = 120_000;

function buildStyle(online: boolean): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [
    {
      id: "bg",
      type: "background",
      paint: { "background-color": "#0e1116" },
    },
  ];
  if (online) {
    sources["osm"] = {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    };
    sources["dark"] = {
      type: "raster",
      tiles: [
        "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
      maxzoom: 19,
    };
    sources["sat"] = {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri",
      maxzoom: 19,
    };
    layers.push(
      { id: "base-light", type: "raster", source: "osm", layout: { visibility: "visible" } },
      { id: "base-dark", type: "raster", source: "dark", layout: { visibility: "none" } },
      { id: "base-sat", type: "raster", source: "sat", layout: { visibility: "none" } }
    );
  }
  return { version: 8, sources, layers };
}

interface PointInfo {
  lat: number;
  lng: number;
  t: number;
  speed: number;
  accuracy: number;
  altitude: number;
  distPrev: number;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);

  const { dataset, range, selectedDate, setSelectedDate, flyTo, useOnlineBasemap } =
    useStore();

  const [basemap, setBasemap] = useState<Basemap>("light");
  const [showHeat, setShowHeat] = useState(false);
  const [showPoints, setShowPoints] = useState(false);
  const [showPlaces, setShowPlaces] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [info, setInfo] = useState<PointInfo | null>(null);

  // playback state
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(60);
  const [playT, setPlayT] = useState<number | null>(null);
  const playRef = useRef<{ raf: number; last: number } | null>(null);

  /** Point index window for the active range/day. */
  const window_ = useMemo(() => {
    if (!dataset) return null;
    const t = dataset.points.t;
    let from = 0;
    let to = t.length;
    const dFrom = selectedDate ?? range.from;
    const dTo = selectedDate ?? range.to;
    if (dFrom) from = lowerBound(t, new Date(dFrom + "T00:00:00").getTime());
    if (dTo) to = lowerBound(t, new Date(dTo + "T00:00:00").getTime() + 86400_000);
    return { from, to };
  }, [dataset, range, selectedDate]);

  /* ------------------------- map bootstrap ------------------------- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Bundlers break maplibre's relative worker URL — serve it from /public
    // (kept in sync by scripts/copy-maplibre-worker.mjs on postinstall).
    (maplibregl as unknown as { setWorkerUrl?: (u: string) => void }).setWorkerUrl?.(
      new URL("/maplibre-gl-worker.mjs", window.location.origin).href
    );
    const isDark = document.documentElement.classList.contains("dark");
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(useOnlineBasemap),
      center: [77.59, 12.97],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({}), "bottom-left");
    mapRef.current = map;
    (window as unknown as Record<string, unknown>).__laMap = map; // debug/e2e hook
    if (isDark) setBasemap("dark");

    map.on("load", () => {
      // arrow icon for travel direction
      const cv = document.createElement("canvas");
      cv.width = cv.height = 24;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(4, 5);
      ctx.lineTo(20, 12);
      ctx.lineTo(4, 19);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      map.addImage("arrow", ctx.getImageData(0, 0, 24, 24), { pixelRatio: 2 });

      const empty = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;
      map.addSource("track", { type: "geojson", data: empty });
      map.addSource("pts", { type: "geojson", data: empty });
      map.addSource("placesrc", { type: "geojson", data: empty });
      map.addSource("play", { type: "geojson", data: empty });

      map.addLayer({
        id: "track-casing",
        type: "line",
        source: "track",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#000", "line-opacity": 0.18, "line-width": 5.5 },
      });
      map.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.6, 12, 3.2, 16, 5],
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "track-arrows",
        type: "symbol",
        source: "track",
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 90,
          "icon-image": "arrow",
          "icon-size": 0.55,
          "icon-allow-overlap": true,
          "icon-rotation-alignment": "map",
        },
        minzoom: 11,
      });
      map.addLayer({
        id: "heat",
        type: "heatmap",
        source: "pts",
        layout: { visibility: "none" },
        paint: {
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 12, 18],
          "heatmap-opacity": 0.75,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(79,109,245,0)",
            0.25, "rgba(79,109,245,0.55)",
            0.5, "rgba(139,92,246,0.75)",
            0.75, "rgba(244,63,94,0.85)",
            1, "rgba(255,205,64,0.95)",
          ],
        },
      });
      map.addLayer({
        id: "pts-circles",
        type: "circle",
        source: "pts",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.6, 14, 4],
          "circle-color": [
            "interpolate", ["linear"], ["coalesce", ["get", "s"], 0],
            0, "#10b981", 8, "#06b6d4", 20, "#4f6df5", 35, "#8b5cf6", 60, "#f43f5e",
          ],
          "circle-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "places-halo",
        type: "circle",
        source: "placesrc",
        paint: {
          "circle-radius": ["+", 8, ["*", 2.2, ["ln", ["+", 1, ["get", "visits"]]]],],
          "circle-color": ["match", ["get", "label"], "home", "#10b981", "work", "#f59e0b", "#4f6df5"],
          "circle-opacity": 0.22,
        },
      });
      map.addLayer({
        id: "places-dot",
        type: "circle",
        source: "placesrc",
        paint: {
          "circle-radius": 5,
          "circle-color": ["match", ["get", "label"], "home", "#10b981", "work", "#f59e0b", "#4f6df5"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "play-dot",
        type: "circle",
        source: "play",
        paint: {
          "circle-radius": 9,
          "circle-color": "#4f6df5",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", "pts-circles", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, number>;
        setInfo({
          lat: (f.geometry as GeoJSON.Point).coordinates[1],
          lng: (f.geometry as GeoJSON.Point).coordinates[0],
          t: Number(p.t),
          speed: Number(p.s),
          accuracy: Number(p.a),
          altitude: Number(p.alt),
          distPrev: Number(p.dp),
        });
      });
      map.on("click", "places-dot", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const c = (f.geometry as GeoJSON.Point).coordinates;
        const p = f.properties as Record<string, string | number>;
        new maplibregl.Popup({ offset: 10 })
          .setLngLat([c[0], c[1]])
          .setHTML(
            `<div style="font-size:13px"><b>${p.name}</b><br/><span style="opacity:.7">${p.visits} visits · ${p.dwell}</span></div>`
          )
          .addTo(map);
      });
      for (const layer of ["pts-circles", "places-dot"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [useOnlineBasemap]);

  /* ------------------------ basemap switching ----------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !useOnlineBasemap) return;
    const vis = (id: string, v: boolean) =>
      map.getLayer(id) && map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
    vis("base-light", basemap === "light");
    vis("base-dark", basemap === "dark");
    vis("base-sat", basemap === "satellite");
  }, [basemap, ready, useOnlineBasemap]);

  /* -------------------------- data layers --------------------------- */
  const tripsInWindow = useMemo(() => {
    if (!dataset) return [] as Trip[];
    return dataset.segments.filter((s): s is Trip => {
      if (s.kind !== "trip") return false;
      const day = dayKey(s.start);
      if (selectedDate) return day === selectedDate || dayKey(s.end) === selectedDate;
      if (range.from && day < range.from) return false;
      if (range.to && day > range.to) return false;
      return true;
    });
  }, [dataset, range, selectedDate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !dataset || !window_) return;
    const { points } = dataset;

    // Track lines: one feature per trip, path from ptRange (strided), else straight line.
    const features: GeoJSON.Feature[] = [];
    for (const trip of tripsInWindow) {
      let coords: [number, number][] = [];
      if (trip.ptRange) {
        const [a, b] = trip.ptRange;
        const stride = Math.max(1, Math.floor((b - a) / 600));
        for (let i = a; i < b; i += stride) coords.push([points.lng[i], points.lat[i]]);
        if (coords.length < 2) coords = [];
      }
      if (coords.length < 2)
        coords = [
          [trip.startLng, trip.startLat],
          [trip.endLng, trip.endLat],
        ];
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { color: MODE_COLORS[trip.mode] ?? MODE_COLORS.unknown, id: trip.id },
      });
    }
    (map.getSource("track") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features,
    });

    // Point cloud (strided to MAX_RENDER_POINTS)
    const { from, to } = window_;
    const n = to - from;
    const stride = Math.max(1, Math.ceil(n / MAX_RENDER_POINTS));
    const ptFeatures: GeoJSON.Feature[] = [];
    let prevIdx = -1;
    for (let i = from; i < to; i += stride) {
      const dp = prevIdx >= 0
        ? haversine(points.lat[prevIdx], points.lng[prevIdx], points.lat[i], points.lng[i])
        : 0;
      ptFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [points.lng[i], points.lat[i]] },
        properties: {
          t: points.t[i],
          s: Number.isNaN(points.speed[i]) ? 0 : points.speed[i],
          a: Number.isNaN(points.accuracy[i]) ? -1 : points.accuracy[i],
          alt: Number.isNaN(points.altitude[i]) ? -9999 : points.altitude[i],
          dp: Math.round(dp),
        },
      });
      prevIdx = i;
    }
    (map.getSource("pts") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: ptFeatures,
    });

    // Places
    (map.getSource("placesrc") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: dataset.places.slice(0, 400).map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          name: p.name,
          visits: p.visitCount,
          label: p.label,
          dwell: fmtDuration(p.totalDwell),
        },
      })),
    });

    // Fit bounds on first data load / window change
    if (n > 1 || features.length) {
      const bounds = new maplibregl.LngLatBounds();
      for (let i = from; i < to; i += Math.max(1, Math.ceil(n / 2000)))
        bounds.extend([points.lng[i], points.lat[i]]);
      for (const f of features)
        for (const c of (f.geometry as GeoJSON.LineString).coordinates)
          bounds.extend(c as [number, number]);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 700 });
    }
  }, [dataset, ready, window_, tripsInWindow]);

  /* ----------------------- toggles / visibility ---------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (id: string, v: boolean) =>
      map.getLayer(id) && map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
    vis("heat", showHeat);
    vis("pts-circles", showPoints);
    vis("places-halo", showPlaces);
    vis("places-dot", showPlaces);
  }, [showHeat, showPoints, showPlaces, ready]);

  /* ---------------------------- fly-to ------------------------------ */
  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [flyTo.lng, flyTo.lat],
      zoom: flyTo.zoom ?? 14,
      duration: 1200,
    });
  }, [flyTo]);

  /* --------------------------- playback ----------------------------- */
  const playbackBounds = useMemo(() => {
    if (!dataset || !window_ || window_.to - window_.from < 2) return null;
    return {
      t0: dataset.points.t[window_.from],
      t1: dataset.points.t[window_.to - 1],
    };
  }, [dataset, window_]);

  const updatePlayMarker = useCallback(
    (t: number) => {
      const map = mapRef.current;
      if (!map || !dataset || !window_) return;
      const idx = Math.min(
        Math.max(lowerBound(dataset.points.t, t), window_.from),
        window_.to - 1
      );
      const lng = dataset.points.lng[idx];
      const lat = dataset.points.lat[idx];
      (map.getSource("play") as GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: {} },
        ],
      });
      if (playing && !map.getBounds().contains([lng, lat]))
        map.panTo([lng, lat], { duration: 350 });
    },
    [dataset, window_, playing]
  );

  useEffect(() => {
    if (!playing || !playbackBounds) return;
    let cur = playT ?? playbackBounds.t0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      cur += (now - last) * playSpeed;
      last = now;
      if (cur >= playbackBounds.t1) {
        cur = playbackBounds.t1;
        setPlaying(false);
      }
      setPlayT(cur);
      updatePlayMarker(cur);
      if (cur < playbackBounds.t1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    playRef.current = { raf, last };
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, playSpeed, playbackBounds]);

  if (!dataset) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-sm text-faint">
        Import location data to see the map.
      </div>
    );
  }

  const btn = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
      active ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
    );

  return (
    <div className="relative mt-4 h-[calc(100dvh-8.5rem)] overflow-hidden rounded-2xl border border-hairline shadow-lg">
      {/* inline style: maplibre's stylesheet overrides Tailwind's `absolute` */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* layer controls */}
      <div className="absolute top-3 left-3 z-10">
        <div className="glass rounded-xl p-1.5">
          <button className={btn(layersOpen)} onClick={() => setLayersOpen((v) => !v)} aria-label="Layers">
            <Layers className="size-4" /> Layers
          </button>
          {layersOpen && (
            <div className="mt-1 space-y-0.5 border-t border-hairline pt-1.5">
              <button className={btn(true)} onClick={() => {}}>
                <RouteIcon className="size-3.5" /> Routes
              </button>
              <button className={btn(showHeat)} onClick={() => setShowHeat((v) => !v)}>
                <Flame className="size-3.5" /> Heatmap
              </button>
              <button className={btn(showPoints)} onClick={() => setShowPoints((v) => !v)}>
                <Waypoints className="size-3.5" /> GPS points
              </button>
              <button className={btn(showPlaces)} onClick={() => setShowPlaces((v) => !v)}>
                <MapPin className="size-3.5" /> Places
              </button>
              <div className="mt-1 border-t border-hairline pt-1.5">
                {useOnlineBasemap ? (
                  (["light", "dark", "satellite", "none"] as Basemap[]).map((b) => (
                    <button key={b} className={btn(basemap === b)} onClick={() => setBasemap(b)}>
                      {b === "none" ? "No basemap" : b[0].toUpperCase() + b.slice(1)}
                    </button>
                  ))
                ) : (
                  <span className="px-2 text-[10px] text-faint">Offline mode — no tiles</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* day chip + zoom-to-data */}
      <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        {selectedDate && (
          <span className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            {selectedDate}
            <button onClick={() => setSelectedDate(null)} aria-label="Clear day filter">
              <X className="size-3.5 text-muted hover:text-ink" />
            </button>
          </span>
        )}
        <button
          onClick={() => {
            const map = mapRef.current;
            if (!map || !window_ || !dataset) return;
            const b = new maplibregl.LngLatBounds();
            const { from, to } = window_;
            const stride = Math.max(1, Math.ceil((to - from) / 2000));
            for (let i = from; i < to; i += stride)
              b.extend([dataset.points.lng[i], dataset.points.lat[i]]);
            if (!b.isEmpty()) map.fitBounds(b, { padding: 70, duration: 600 });
          }}
          className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
        >
          <ScanSearch className="size-3.5" /> Fit data
        </button>
      </div>

      {/* point info panel */}
      {info && (
        <div className="glass absolute top-3 right-3 z-10 w-64 rounded-2xl p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <b>GPS point</b>
            <button onClick={() => setInfo(null)} aria-label="Close">
              <X className="size-4 text-muted hover:text-ink" />
            </button>
          </div>
          <dl className="space-y-1.5 text-xs">
            <Row k="Time" v={`${fmtTime(info.t)} · ${dayKey(info.t)}`} />
            <Row k="Coordinates" v={fmtCoord(info.lat, info.lng)} mono />
            <Row k="Speed" v={info.speed > 0 ? fmtSpeed(info.speed) : "—"} />
            <Row k="From previous" v={fmtDistance(info.distPrev)} />
            <Row k="Accuracy" v={info.accuracy >= 0 ? `± ${Math.round(info.accuracy)} m` : "—"} />
            <Row k="Elevation" v={info.altitude > -9999 ? `${Math.round(info.altitude)} m` : "—"} />
          </dl>
        </div>
      )}

      {/* playback bar */}
      {playbackBounds && (
        <div className="glass absolute right-3 bottom-3 left-3 z-10 flex items-center gap-3 rounded-2xl px-4 py-2.5">
          <button
            onClick={() => {
              if (!playing && (playT == null || playT >= playbackBounds.t1))
                setPlayT(playbackBounds.t0);
              setPlaying((v) => !v);
            }}
            className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-md transition-transform hover:scale-105"
            aria-label={playing ? "Pause replay" : "Play replay"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 pl-0.5" />}
          </button>
          <input
            type="range"
            min={playbackBounds.t0}
            max={playbackBounds.t1}
            value={playT ?? playbackBounds.t0}
            onChange={(e) => {
              const t = Number(e.target.value);
              setPlayT(t);
              updatePlayMarker(t);
            }}
            className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
            aria-label="Replay position"
          />
          <span className="num w-32 text-right text-xs text-muted">
            {playT ? `${dayKey(playT)} ${fmtTime(playT)}` : dayKey(playbackBounds.t0)}
          </span>
          <select
            value={playSpeed}
            onChange={(e) => setPlaySpeed(Number(e.target.value))}
            className="rounded-lg border border-hairline bg-transparent px-1.5 py-1 text-xs font-medium"
            aria-label="Replay speed"
          >
            {[10, 60, 300, 1200, 3600].map((s) => (
              <option key={s} value={s}>
                {s < 60 ? `${s}×` : `${s / 60}min/s`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-faint">{k}</dt>
      <dd className={cn("text-right font-medium", mono && "font-mono text-[11px]")}>{v}</dd>
    </div>
  );
}
