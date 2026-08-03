# User Guide

## 1. Importing data

Open the app and drop any of the following onto the upload area (Dashboard when empty, or *Settings → Import data*):

| Source | File | Notes |
|---|---|---|
| Google Takeout | the whole `takeout-*.zip` | extracted in-browser, relevant files auto-detected |
| Takeout raw history | `Records.json` | multi-GB files supported (streamed parsing) |
| Takeout semantic history | `2023_JANUARY.json` … | visits & trips with place names |
| Phone timeline export (2024+) | `Timeline.json` | Android & iOS on-device exports |
| GPS loggers | `.gpx`, `.kml`, `.csv` | CSV needs lat/lon/time columns (flexible names) |

You can drop several files at once (e.g. `Records.json` + a year of semantic files). Import replaces the current dataset. Progress is shown live; large archives take a few minutes.

The processed dataset is cached in your browser's IndexedDB, so the app reopens instantly. Delete it any time in *Settings → Data management*.

## 2. Global date filter

The date range in the top bar filters **every** view — dashboard, map, timeline, calendar, analytics, reports and all exports. Clear it with the ✕.

## 3. Views

### Dashboard
KPI cards are clickable and take you to the most relevant view. *AI insights* are deterministic, rule-based observations (month-over-month change, office attendance, recurring travel, anomalies) — generated locally, no AI service involved.

### Map
- **Layers** (top-left): routes, heatmap, GPS points, places; basemap style (light / dark / satellite / none).
- Click a **GPS point** (enable the GPS points layer) for time, speed, accuracy, elevation and distance from the previous fix.
- Click a **place marker** for visit count and total dwell.
- **Replay** (bottom bar): play/pause, speed selector (up to 60 min/s), and a scrubber over the selected range. The camera follows the marker.
- Selecting a day elsewhere (calendar, timeline) scopes the map to that day — a chip appears top-center.

### Timeline
A forensic, chronological log of one day: stops (with place names where Google provides them, otherwise inferred) and trips (mode, distance, speeds). Search by place/mode, filter stops vs trips, use ← → to move between days, and the ↗ button to see any entry on the map. Entries marked *inferred* were reconstructed from raw GPS by this app rather than reported by Google.

### Calendar
Each day shows distance, trips/stops, time at the office and estimated expenses; the background tint scales with travel volume. Click a day to open its timeline.

### Analytics
Trends, distributions, the hour×weekday working-pattern heatmap, a GitHub-style travel calendar and the **data-quality audit**: tracking gaps ≥ 6 h, GPS jumps, sustained impossible speeds, night travel (23:00–04:00) and statistically unusual trips. Click a flag to view its location.

### Reports
One printable audit report for the active range: executive summary, travel summary, attendance (working days, presence, late arrivals, early departures, commutes), expense estimate, top locations, daily log and a sign-off block.

- **Print / Save as PDF** — uses the browser's print dialog; choose "Save as PDF".
- **Excel workbook** — sheets: Summary, Daily Report, Trips, Stops, Visited Locations, Expenses.
- **CSV** — daily stats, timeline segments, or raw GPS points.

## 4. Attendance logic

Home = the place with the most overnight (00:00–06:00) dwell. Office = the non-home place with the most weekday 09:00–18:00 dwell (minimum 20 h total). A weekday counts as *present* if any office visit occurred; *late* if first arrival is after 09:30, *early departure* if last exit is before 18:00. (Thresholds are defined in `lib/engine/derive.ts`.)

## 5. Expenses

*Settings → Expense rates*: currency symbol, mileage rate per km (applied to driving trips), daily allowance (days with > 5 km travel), parking per stop (car arrivals with ≥ 1 h dwell away from home). Estimates appear in the calendar, reports and Excel export.

## 6. Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl/⌘ K` | Command palette |
| type `12.97, 77.59` in palette | fly to coordinates |
| type `2024-05-12` in palette | open that day |
| `Esc` | close palette/panels |

## 7. Privacy

Your location data never leaves the machine. To go fully air-gapped, disable basemap tiles in *Settings → Privacy & map tiles* — routes then render on a blank canvas.
