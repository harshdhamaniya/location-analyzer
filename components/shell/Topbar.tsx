"use client";

import { usePathname } from "next/navigation";
import { CalendarRange, Command, Loader2, Moon, Sun, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store/useStore";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/map": "Interactive Map",
  "/timeline": "Timeline",
  "/calendar": "Calendar",
  "/analytics": "Analytics",
  "/reports": "Reports & Export",
  "/settings": "Settings",
};

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("la-theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }, []);
  return { dark, toggle };
}

export function Topbar() {
  const pathname = usePathname();
  const { dark, toggle } = useTheme();
  const { dataset, range, setRange, importing, progress } = useStore();

  const min = dataset ? new Date(dataset.stats.firstFix).toISOString().slice(0, 10) : undefined;
  const max = dataset ? new Date(dataset.stats.lastFix).toISOString().slice(0, 10) : undefined;
  const hasFilter = !!(range.from || range.to);

  return (
    <header className="no-print z-10 m-3 mb-0 md:ml-3">
      <div className="glass flex h-14 items-center gap-3 rounded-2xl px-4">
        <h1 className="mr-auto text-[15px] font-semibold tracking-tight">
          {TITLES[pathname] ?? "Location Analyzer"}
        </h1>

        {importing && (
          <span className="flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
            <Loader2 className="size-3.5 animate-spin" />
            {progress?.phase === "parsing" && progress.pointCount
              ? `Parsing · ${progress.pointCount.toLocaleString()} pts`
              : (progress?.phase ?? "Working")}
          </span>
        )}

        {dataset && (
          <div
            className={cn(
              "hidden items-center gap-1.5 rounded-xl border border-hairline px-2 py-1 sm:flex",
              hasFilter && "border-accent/40 bg-accent-soft"
            )}
          >
            <CalendarRange className="size-3.5 text-muted" />
            <input
              type="date"
              value={range.from ?? ""}
              min={min}
              max={range.to ?? max}
              onChange={(e) => setRange({ ...range, from: e.target.value || null })}
              className="w-[7.6rem] bg-transparent text-xs font-medium text-ink outline-none"
              aria-label="Filter from date"
            />
            <span className="text-faint">→</span>
            <input
              type="date"
              value={range.to ?? ""}
              min={range.from ?? min}
              max={max}
              onChange={(e) => setRange({ ...range, to: e.target.value || null })}
              className="w-[7.6rem] bg-transparent text-xs font-medium text-ink outline-none"
              aria-label="Filter to date"
            />
            {hasFilter && (
              <button
                onClick={() => setRange({ from: null, to: null })}
                className="rounded-md p-0.5 text-muted hover:bg-hairline hover:text-ink"
                aria-label="Clear date filter"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        <button
          onClick={() =>
            window.dispatchEvent(new CustomEvent("la:command-palette"))
          }
          className="hidden items-center gap-1.5 rounded-xl border border-hairline px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink sm:flex"
          aria-label="Open command palette"
        >
          <Command className="size-3.5" /> ⌘K
        </button>

        <button
          onClick={toggle}
          className="rounded-xl border border-hairline p-2 text-muted transition-colors hover:text-ink"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  );
}
