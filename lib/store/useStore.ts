"use client";

/**
 * Global app state (Zustand): the active dataset, import lifecycle, filters,
 * cross-view selection and user settings.
 */
import { create } from "zustand";
import type { Dataset, ExpenseRates, IngestProgress } from "../types";
import { DEFAULT_EXPENSE_RATES } from "../types";
import type { DateRange } from "../engine/derive";
import { deleteAllDatasets, loadLatestDataset, saveDataset } from "./db";
import type { IngestResponse } from "../workers/ingest.worker";

interface AppState {
  dataset: Dataset | null;
  hydrated: boolean; // finished checking IndexedDB on startup
  importing: boolean;
  progress: IngestProgress | null;
  importError: string | null;

  range: DateRange;
  /** date selected in calendar/timeline (YYYY-MM-DD) */
  selectedDate: string | null;
  /** segment highlighted on the map */
  selectedSegmentId: string | null;
  /** map focus request (consumed by the map view) */
  flyTo: { lat: number; lng: number; zoom?: number; token: number } | null;

  expenseRates: ExpenseRates;
  useOnlineBasemap: boolean;

  // actions
  hydrate: () => Promise<void>;
  importFiles: (files: File[]) => void;
  clearData: () => Promise<void>;
  setRange: (r: DateRange) => void;
  setSelectedDate: (d: string | null) => void;
  selectSegment: (id: string | null) => void;
  requestFlyTo: (lat: number, lng: number, zoom?: number) => void;
  setExpenseRates: (r: ExpenseRates) => void;
  setUseOnlineBasemap: (v: boolean) => void;
}

const SETTINGS_KEY = "la-settings-v1";

function loadSettings(): { expenseRates: ExpenseRates; useOnlineBasemap: boolean } {
  if (typeof window === "undefined")
    return { expenseRates: DEFAULT_EXPENSE_RATES, useOnlineBasemap: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { expenseRates: DEFAULT_EXPENSE_RATES, useOnlineBasemap: true, ...JSON.parse(raw) };
  } catch {
    /* corrupted settings fall back to defaults */
  }
  return { expenseRates: DEFAULT_EXPENSE_RATES, useOnlineBasemap: true };
}

function persistSettings(s: { expenseRates: ExpenseRates; useOnlineBasemap: boolean }) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage full/blocked — settings just won't persist */
  }
}

let worker: Worker | null = null;
let flyToken = 0;

export const useStore = create<AppState>((set, get) => ({
  dataset: null,
  hydrated: false,
  importing: false,
  progress: null,
  importError: null,
  range: { from: null, to: null },
  selectedDate: null,
  selectedSegmentId: null,
  flyTo: null,
  ...loadSettings(),

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const ds = await loadLatestDataset();
      set({ dataset: ds, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  importFiles: (files: File[]) => {
    if (get().importing || files.length === 0) return;
    set({ importing: true, progress: { phase: "reading" }, importError: null });

    worker?.terminate();
    worker = new Worker(new URL("../workers/ingest.worker.ts", import.meta.url));

    worker.onmessage = (e: MessageEvent<IngestResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        set({ progress: msg.progress });
      } else if (msg.type === "done") {
        set({
          dataset: msg.dataset,
          importing: false,
          progress: { phase: "done" },
          range: { from: null, to: null },
          selectedDate: null,
        });
        void saveDataset(msg.dataset).catch(() => {
          /* very large datasets may exceed IndexedDB quota — app still works in-memory */
        });
        worker?.terminate();
        worker = null;
      } else {
        set({ importing: false, importError: msg.message, progress: null });
        worker?.terminate();
        worker = null;
      }
    };
    worker.onerror = (err) => {
      set({
        importing: false,
        importError: err.message || "Import worker crashed",
        progress: null,
      });
    };

    const name =
      files.length === 1 ? files[0].name : `${files.length} files`;
    worker.postMessage({ files, name });
  },

  clearData: async () => {
    await deleteAllDatasets();
    set({ dataset: null, selectedDate: null, selectedSegmentId: null, range: { from: null, to: null } });
  },

  setRange: (range) => set({ range }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  selectSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  requestFlyTo: (lat, lng, zoom) => set({ flyTo: { lat, lng, zoom, token: ++flyToken } }),

  setExpenseRates: (expenseRates) => {
    set({ expenseRates });
    persistSettings({ expenseRates, useOnlineBasemap: get().useOnlineBasemap });
  },
  setUseOnlineBasemap: (useOnlineBasemap) => {
    set({ useOnlineBasemap });
    persistSettings({ expenseRates: get().expenseRates, useOnlineBasemap });
  },
}));
