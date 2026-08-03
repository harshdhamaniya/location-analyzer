"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  FileText,
  LayoutDashboard,
  ListTree,
  Map as MapIcon,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/timeline", label: "Timeline", icon: ListTree },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const dataset = useStore((s) => s.dataset);

  return (
    <aside className="no-print glass z-20 m-3 mr-0 hidden w-56 shrink-0 flex-col rounded-2xl md:flex">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 shadow-md">
          <MapIcon className="size-4 text-white" strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">
            Location<span className="text-gradient">Analyzer</span>
          </div>
          <div className="text-[10px] font-medium tracking-wide text-faint uppercase">
            Offline intelligence
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
                active ? "text-ink" : "text-muted hover:bg-accent-soft/60 hover:text-ink"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-accent-soft ring-1 ring-accent/25"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <Icon className="relative size-4" strokeWidth={2.1} />
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl border border-hairline bg-canvas-deep/50 p-3">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted">
          <ShieldCheck className="size-3.5 text-positive" />
          100% local processing
        </div>
        {dataset && (
          <p className="mt-1.5 truncate text-[11px] text-faint" title={dataset.name}>
            {dataset.stats.totalPoints.toLocaleString()} points · {dataset.days.length} days
          </p>
        )}
      </div>
    </aside>
  );
}
