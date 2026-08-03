"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  onClick,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.2, 0.8, 0.2, 1] }}
      onClick={onClick}
      className={cn(
        "glass rounded-2xl p-4",
        onClick && "glass-hover cursor-pointer",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  delay = 0,
  onClick,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  delay?: number;
  onClick?: () => void;
  accent?: boolean;
}) {
  return (
    <Card delay={delay} onClick={onClick} className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
          {label}
        </span>
        {icon && (
          <span className="rounded-lg bg-accent-soft p-1.5 text-accent">{icon}</span>
        )}
      </div>
      <div
        className={cn(
          "num mt-2 truncate text-[22px] leading-tight font-bold tracking-tight",
          accent && "text-gradient"
        )}
        title={value}
      >
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-xs text-faint">{sub}</div>}
    </Card>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-8 mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-tight text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-hairline text-sm text-faint">
      {text}
    </div>
  );
}
