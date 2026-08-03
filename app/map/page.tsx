"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => <div className="skeleton mt-4 h-[calc(100dvh-8.5rem)]" />,
  }
);

export default function MapPage() {
  return <MapView />;
}
