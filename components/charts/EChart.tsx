"use client";

/**
 * Thin ECharts wrapper: theme-aware, resize-observing, disposed on unmount.
 */
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import {
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
} from "echarts/charts";
import {
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  CalendarComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export function EChart({
  option,
  className,
  onClick,
}: {
  option: EChartsCoreOption;
  className?: string;
  onClick?: (params: { name?: string; value?: unknown; seriesName?: string }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(withTheme(option), true);
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onClick) return;
    chart.on("click", onClick);
    return () => {
      chart.off("click", onClick);
    };
  }, [onClick]);

  return <div ref={ref} className={className ?? "h-64 w-full"} />;
}

/** Read current CSS variables so charts always match the active theme. */
function withTheme(option: EChartsCoreOption): EChartsCoreOption {
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue("--ink").trim() || "#0f1219";
  const muted = css.getPropertyValue("--ink-muted").trim() || "#5c6370";
  const hairline = css.getPropertyValue("--hairline").trim() || "rgba(0,0,0,.08)";
  const panel = css.getPropertyValue("--panel-solid").trim() || "#fff";

  return {
    textStyle: { color: muted, fontFamily: "inherit" },
    tooltip: {
      backgroundColor: panel,
      borderColor: hairline,
      textStyle: { color: ink, fontSize: 12 },
      borderRadius: 10,
      extraCssText: "box-shadow: var(--shadow-pop); backdrop-filter: blur(8px);",
    },
    ...option,
  };
}

export const CHART_COLORS = [
  "#4f6df5",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#64748b",
];
