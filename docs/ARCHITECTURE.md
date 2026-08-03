# Architecture

## Design decision: no backend

The original product sketch allowed a FastAPI/Node backend. This implementation deliberately keeps **all processing client-side** (Web Workers + IndexedDB) because:

1. **Privacy is provable** — there is no server that could receive data; the app works with the network cable unplugged.
2. **Zero-install deployment** — one `npm start` (or a static host / Tauri shell) instead of orchestrating a Python service + DB.
3. **Performance is sufficient** — the streaming parser handles multi-GB `Records.json` chunk-by-chunk, and the columnar point store keeps millions of points in a few hundred MB of typed arrays.

## Data flow

```
Files (zip/json/gpx/kml/csv)
        │  drag & drop
        ▼
┌─────────────────────────────── ingest worker ───────────────────────────────┐
│ parse/ingest.ts    — routes each file/zip entry by detected format           │
│ parse/stream.ts    — StreamingArrayParser: O(element) memory JSON streaming  │
│ parse/google.ts    — Records / timelineObjects / semanticSegments parsers    │
│ parse/formats.ts   — GPX, KML, CSV + format detection                        │
│        ▼ ParsedBatch { points[], visits[], trips[] }                         │
│ engine/clean.ts    — sort, dedupe, thin bursts, drop GPS jumps, anomalies    │
│        ▼ PointColumns (Float64/32Array) + dropped stats                      │
│ engine/segment.ts  — stop/trip inference; merge with Google semantic data    │
│ engine/places.ts   — place clustering; home/work labeling                    │
│ engine/stats.ts    — per-day aggregation (split at local midnight)           │
│ engine/pipeline.ts — behavioral anomalies; assembles Dataset                 │
└──────────────────────────────────────────────────────────────────────────────┘
        │ postMessage (typed arrays transferred zero-copy)
        ▼
Zustand store (lib/store/useStore.ts) ──► Dexie/IndexedDB cache (lib/store/db.ts)
        │
        ▼
Views (React) ── derived selectors in engine/derive.ts, insights.ts, expense.ts
```

## Key data structures (`lib/types.ts`)

- **`PointColumns`** — columnar typed arrays (`t`, `lat`, `lng`, `speed`, `accuracy`, `altitude`). Cheap to transfer between threads, cache-friendly to scan, and slices are addressed by index ranges (`Trip.ptRange`) rather than copies. Binary search (`lowerBound`) gives O(log n) time-window lookups.
- **`Segment`** — the unified timeline: `Visit` (stop at a place) or `Trip` (movement leg with mode, distance, speed stats). `inferred` marks app-reconstructed vs Google-reported entries.
- **`Place`** — greedy 150 m clusters of visits with dwell-based `home`/`work` labels.
- **`DayStat`** — per-local-calendar-day aggregates; segments crossing midnight are split proportionally.
- **`Anomaly`** — data-quality and behavioral flags produced during cleaning and pipeline stages.

## Algorithms

- **Streaming JSON**: a character-level state machine tracks string/escape state and brace depth; when a configured top-level key's array opens, each element's byte range is sliced and `JSON.parse`d individually. Memory is bounded by the largest single element, not file size.
- **GPS-jump removal**: a point requiring > 350 m/s to reach is dropped if the track "returns" (next point reachable from the previous at sane speed); sustained high speed is kept but flagged.
- **Stop detection**: grow a cluster around an anchor with a rolling centroid; ≥ 7 min within 160 m ⇒ visit. Movement between visits ⇒ trip; distance = summed haversine; mode from avg/max speed unless Google supplied one.
- **Semantic merge**: Google's `placeVisit`/`activitySegment`/`semanticSegments` win on overlap; inferred segments are kept only where < 35% of their span is covered.
- **Home/work**: dwell histograms over 00:00–06:00 (home) and weekday 09:00–18:00 (work, ≥ 20 h minimum).

## Rendering & performance

- Map layers cap at ~120k rendered points (stride-sampled); trip lines are simplified to ≤ 600 vertices each. Heatmap/points/places are separate MapLibre sources toggled by visibility.
- MapLibre's worker is served from `/public` (`scripts/copy-maplibre-worker.mjs`, run on postinstall) because bundlers break its `import.meta.url`-relative worker resolution.
- ECharts is imported per-module (tree-shaken) and re-themed from CSS variables on every option change.
- All derived analytics are memoized per `(dataset, range)` via `useMemo`.

## Persistence

One Dexie table `datasets` stores the processed dataset (segments/places/days/anomalies as structured clones, point columns as raw `ArrayBuffer`s). Raw uploads are never written. Settings live in `localStorage` (`la-settings-v1`, `la-theme`).

## Directory map

```
app/                    # Next.js routes (dashboard, map, timeline, calendar, analytics, reports, settings)
components/
  shell/                # Sidebar, Topbar, CommandPalette, Providers
  map/MapView.tsx       # MapLibre integration + replay engine
  charts/EChart.tsx     # themed ECharts wrapper
  ui/, upload/          # primitives, drag & drop import
lib/
  parse/                # streaming parser + format parsers + zip ingestion
  engine/               # clean → segment → places → stats → pipeline; derive/insights/expense
  store/                # zustand store + dexie persistence
  workers/              # ingest worker entry
  export/               # CSV + Excel builders
scripts/                # sample-data generator, maplibre worker copier
tests/                  # vitest unit tests (parsers, engine)
docs/                   # this documentation
```
