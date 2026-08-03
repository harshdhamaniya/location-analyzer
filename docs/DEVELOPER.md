# Developer Guide

## Prerequisites

- Node.js ≥ 20 (LTS recommended)
- npm ≥ 10

## Setup

```bash
npm install          # postinstall copies maplibre worker files into /public
npm run dev          # Turbopack dev server on :3000
npm test             # vitest unit tests
npm run lint         # eslint
npm run build && npm start   # production
npm run sample       # generate sample-data/Records.json (args: [days] [outDir])
```

## Conventions

- **Units**: epoch ms, meters, m/s everywhere in `lib/`. Format only at the UI edge (`lib/utils.ts` `fmt*` helpers).
- **Engine code is pure** — `lib/parse/**` and `lib/engine/**` must not import React, DOM APIs (beyond what workers provide) or the store. This keeps them testable in vitest without a DOM and reusable in the worker.
- **State**: one Zustand store (`lib/store/useStore.ts`). Views read via selectors; cross-view actions (`requestFlyTo`, `setSelectedDate`, `selectSegment`) are the only coupling between pages.
- **Styling**: Tailwind v4 with design tokens in `app/globals.css` (`--accent`, `--panel`, `--hairline`…). Use the `glass` / `glass-hover` utilities for panels. Dark mode is class-based (`.dark` on `<html>`).

## Adding a new import format

1. Write a parser in `lib/parse/` that appends to a `ParsedBatch` (see `parseGpx`).
2. Add detection in `detectFormat()` (`lib/parse/formats.ts`) — filename hint + content sniff.
3. Route it in `ingestEntry()` (`lib/parse/ingest.ts`); add the extension to `RELEVANT_IN_ZIP` and the upload `ACCEPT` list.
4. Add a fixture test in `tests/parse.test.ts`.

## Adding an analytics card / insight

- Derived metrics: extend `lib/engine/derive.ts` (pure function of `(Dataset, DateRange)`), consume with `useMemo` in a view.
- Natural-language insights: add a rule in `generateInsights()` (`lib/engine/insights.ts`).
- Anomaly types: extend the `Anomaly["type"]` union in `lib/types.ts` and emit from `clean.ts` (signal-level) or `pipeline.ts` (behavior-level).

## Gotchas

- **MapLibre worker**: v6 resolves its worker relative to `import.meta.url`, which bundlers break. `scripts/copy-maplibre-worker.mjs` copies `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` into `/public`, and `MapView` calls `setWorkerUrl("/maplibre-gl-worker.mjs")`. Re-run after upgrading maplibre.
- **MapLibre CSS vs Tailwind**: `.maplibregl-map` sets `position: relative`, overriding Tailwind's `absolute` — the map container uses an inline style for positioning.
- **Typed-array transfer**: the worker transfers point buffers (zero-copy). Never post the same dataset twice — the buffers are detached after transfer.
- **Huge files**: never `await file.text()` for JSON history files; go through `streamText` + `StreamingArrayParser`.

## Desktop packaging

### Tauri (recommended — ~10 MB binary)

```bash
npm install -D @tauri-apps/cli
npx tauri init
#   App name: Location Analyzer
#   Dev server URL: http://localhost:3000
#   Dev command:   npm run dev
#   Build command: npm run build
```

Because the app is fully client-side you can serve the production build statically: set `output: "export"` in `next.config.ts`, point Tauri's `frontendDist` at `out/`, then:

```bash
npx tauri build      # produces Windows/macOS/Linux installers
```

### Electron

```bash
npm install -D electron electron-builder
```

Create `electron/main.js` that either loads `http://localhost:3000` (spawning `npm start`) or serves the static `out/` directory, then configure `electron-builder` targets per-OS. Tauri is preferred for size and memory.

## Release checklist

1. `npm test` and `npm run lint` clean.
2. `npm run build` succeeds; smoke-test import → dashboard → map → report print.
3. Import `sample-data/Records.json` and verify home/office detection and attendance numbers are sane.
4. If maplibre was upgraded, verify the worker copy step and map rendering.
