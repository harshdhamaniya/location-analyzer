"use client";

/**
 * Global command palette (⌘K / Ctrl+K): navigation, actions, and search across
 * places, dates and coordinates.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  FileText,
  LayoutDashboard,
  ListTree,
  Map as MapIcon,
  MapPin,
  Moon,
  Search,
  Settings,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store/useStore";
import { cn, fmtDuration } from "@/lib/utils";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { dataset, requestFlyTo, setSelectedDate } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("la:command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("la:command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    const go = (path: string) => () => {
      router.push(path);
      setOpen(false);
    };
    const nav: Cmd[] = [
      { id: "nav-dash", label: "Go to Dashboard", icon: <LayoutDashboard className="size-4" />, run: go("/") },
      { id: "nav-map", label: "Go to Map", icon: <MapIcon className="size-4" />, run: go("/map") },
      { id: "nav-tl", label: "Go to Timeline", icon: <ListTree className="size-4" />, run: go("/timeline") },
      { id: "nav-cal", label: "Go to Calendar", icon: <CalendarDays className="size-4" />, run: go("/calendar") },
      { id: "nav-an", label: "Go to Analytics", icon: <BarChart3 className="size-4" />, run: go("/analytics") },
      { id: "nav-rep", label: "Go to Reports", icon: <FileText className="size-4" />, run: go("/reports") },
      { id: "nav-set", label: "Go to Settings", icon: <Settings className="size-4" />, run: go("/settings") },
      {
        id: "theme",
        label: "Toggle dark / light theme",
        icon: <Moon className="size-4" />,
        run: () => {
          const next = !document.documentElement.classList.contains("dark");
          document.documentElement.classList.toggle("dark", next);
          try {
            localStorage.setItem("la-theme", next ? "dark" : "light");
          } catch {}
          setOpen(false);
        },
      },
    ];

    const q = query.trim().toLowerCase();

    // Coordinate search: "12.97, 77.59"
    const coordMatch = q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        nav.unshift({
          id: "coord",
          label: `Fly to ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          icon: <MapPin className="size-4" />,
          run: () => {
            requestFlyTo(lat, lng, 14);
            router.push("/map");
            setOpen(false);
          },
        });
      }
    }

    // Date search: 2024-05-12
    const dateMatch = q.match(/^\d{4}-\d{2}-\d{2}$/);
    if (dateMatch && dataset) {
      nav.unshift({
        id: "date",
        label: `Open day ${q}`,
        icon: <CalendarDays className="size-4" />,
        run: () => {
          setSelectedDate(q);
          router.push("/timeline");
          setOpen(false);
        },
      });
    }

    // Place search
    if (dataset && q.length >= 2) {
      const places = dataset.places
        .filter((p) => p.name.toLowerCase().includes(q))
        .slice(0, 6)
        .map<Cmd>((p) => ({
          id: p.id,
          label: p.name,
          hint: `${p.visitCount} visits · ${fmtDuration(p.totalDwell)}`,
          icon: <MapPin className="size-4 text-accent" />,
          run: () => {
            requestFlyTo(p.lat, p.lng, 15);
            router.push("/map");
            setOpen(false);
          },
        }));
      nav.unshift(...places);
    }

    if (!q) return nav;
    return nav.filter(
      (c) => c.label.toLowerCase().includes(q) || c.id.startsWith("coord") || c.id.startsWith("date")
    );
  }, [query, dataset, router, requestFlyTo, setSelectedDate]);

  useEffect(() => setActive(0), [query]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[16vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, y: -12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: -8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
            className="glass w-[min(560px,92vw)] overflow-hidden rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-2.5 border-b border-hairline px-4">
              <Search className="size-4 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, commands.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter") {
                    commands[active]?.run();
                  }
                }}
                placeholder="Search places, dates (YYYY-MM-DD), coordinates, actions…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto p-2">
              {commands.length === 0 && (
                <li className="px-3 py-8 text-center text-sm text-faint">No results</li>
              )}
              {commands.map((c, i) => (
                <li key={c.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={c.run}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm",
                      i === active ? "bg-accent-soft text-ink" : "text-muted"
                    )}
                  >
                    {c.icon}
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="text-xs text-faint">{c.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
