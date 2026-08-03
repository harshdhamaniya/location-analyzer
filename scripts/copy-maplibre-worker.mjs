/**
 * MapLibre v6 loads its worker via a URL relative to import.meta.url, which
 * breaks when the library is bundled (Next.js serves it from a chunk path).
 * We serve the worker (and the shared chunk it imports) from /public and point
 * maplibre at it with setWorkerUrl() in MapView.
 */
import { copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "maplibre-gl", "dist");
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, f), join(root, "public", f));
}
console.log("maplibre worker files copied to /public");
