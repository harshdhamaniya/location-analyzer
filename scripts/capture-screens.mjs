/**
 * Captures product screenshots for the README and landing page.
 * Requires the dev server on :3000 and sample-data/Records.json
 * (run `npm run dev` and `npm run sample` first).
 *
 * Usage: node scripts/capture-screens.mjs
 * Output: public/screens/*.png
 */
import puppeteer from "puppeteer";
import { mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "screens");
mkdirSync(outDir, { recursive: true });

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1560, height: 920, deviceScaleFactor: 1.5 });
await page.evaluateOnNewDocument(() => localStorage.setItem("la-theme", "dark"));

console.log("Loading app…");
await page.goto(BASE, { waitUntil: "networkidle2" });

// Seed the sample dataset through the real ingest pipeline via the dev hook.
const hasData = await page.evaluate(() => document.body.innerText.includes("TOTAL DISTANCE"));
if (!hasData) {
  console.log("Importing sample data…");
  const json = readFileSync(join(root, "sample-data", "Records.json"), "utf8");
  await page.waitForFunction(() => typeof window.__laImport === "function", { timeout: 30000 });
  await page.evaluate((data) => {
    const file = new File([data], "Records.json", { type: "application/json" });
    window.__laImport([file]);
  }, json);
  await page.waitForFunction(
    () => document.body.innerText.includes("TOTAL DISTANCE"),
    { timeout: 300000 }
  );
}

const shoot = async (name, wait = 1800) => {
  await sleep(wait); // let entrance animations & tiles settle
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log(`✓ ${name}.png`);
};

await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
await shoot("dashboard");

await page.goto(`${BASE}/map`, { waitUntil: "networkidle2" });
await shoot("map", 6000); // basemap tiles

// Timeline: pick a busy weekday (a Tuesday two weeks before the data ends).
await page.goto(`${BASE}/timeline`, { waitUntil: "networkidle2" });
await page.evaluate(() => {
  const days = [...document.querySelectorAll("main input[type=date]")];
  const inp = days[0];
  if (!inp || !inp.max) return;
  const end = new Date(inp.max + "T12:00:00");
  end.setDate(end.getDate() - 14);
  while (end.getDay() !== 2) end.setDate(end.getDate() - 1); // walk back to Tuesday
  const val = end.toISOString().slice(0, 10);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(inp, val);
  inp.dispatchEvent(new Event("change", { bubbles: true }));
});
await shoot("timeline");

// Calendar: previous month (guaranteed full).
await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle2" });
await page.click('button[aria-label="Previous month"]').catch(() => {});
await shoot("calendar");

await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle2" });
await shoot("analytics", 2500);

await page.goto(`${BASE}/reports`, { waitUntil: "networkidle2" });
await shoot("report");

await browser.close();
console.log(`Done → ${outDir}`);
