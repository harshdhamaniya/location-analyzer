"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store/useStore";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
    // Dev/e2e hook: import files programmatically from the console.
    (window as unknown as Record<string, unknown>).__laImport = (files: File[]) =>
      useStore.getState().importFiles(files);
  }, [hydrate]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
