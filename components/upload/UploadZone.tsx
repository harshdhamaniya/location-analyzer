"use client";

/**
 * Drag & drop import surface. Accepts Takeout ZIPs and individual export
 * files; shows live parsing progress streamed from the ingest worker.
 */
import { AnimatePresence, motion } from "framer-motion";
import { FileArchive, FileJson, Loader2, MapPinned, ShieldCheck, UploadCloud } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useStore } from "@/lib/store/useStore";
import { cn } from "@/lib/utils";

const ACCEPT = ".zip,.json,.gpx,.kml,.csv";

export function UploadZone({ compact = false }: { compact?: boolean }) {
  const { importing, progress, importError, importFiles } = useStore();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      importFiles([...list]);
    },
    [importFiles]
  );

  const phaseLabel = (() => {
    if (!progress) return "";
    switch (progress.phase) {
      case "reading":
        return `Reading ${progress.file ?? "files"}…`;
      case "unzipping":
        return `Extracting ${progress.file ?? "archive"}…`;
      case "parsing":
        return `Parsing ${progress.file ?? ""} — ${(progress.pointCount ?? 0).toLocaleString()} points`;
      case "cleaning":
        return `Cleaning ${(progress.pointCount ?? 0).toLocaleString()} GPS points…`;
      case "segmenting":
        return "Detecting trips & stops…";
      case "aggregating":
        return "Building daily statistics…";
      default:
        return "Working…";
    }
  })();

  return (
    <div className={cn(!compact && "mx-auto max-w-2xl")}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "glass relative overflow-hidden rounded-3xl p-8 text-center transition-colors",
          dragging && "border-accent/60 bg-accent-soft",
          compact && "p-5"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />

        <AnimatePresence mode="wait">
          {importing ? (
            <motion.div
              key="busy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-4"
            >
              <Loader2 className="mx-auto size-9 animate-spin text-accent" />
              <p className="mt-4 text-sm font-medium">{phaseLabel}</p>
              {progress?.fraction != null && (
                <div className="mx-auto mt-3 h-1.5 w-64 overflow-hidden rounded-full bg-hairline">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                    animate={{ width: `${Math.round(progress.fraction * 100)}%` }}
                    transition={{ ease: "easeOut" }}
                  />
                </div>
              )}
              <p className="mt-3 text-xs text-faint">
                Large archives can take a few minutes — everything runs on this device.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {!compact && (
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 shadow-lg">
                  <UploadCloud className="size-7 text-white" />
                </div>
              )}
              <h3 className="text-lg font-semibold tracking-tight">
                Drop your Google Takeout here
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
                Takeout <b>.zip</b>, <b>Records.json</b>, Semantic Location History,{" "}
                <b>Timeline.json</b>, GPX, KML or CSV. Format is detected automatically.
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-5 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                Browse files
              </button>
              <div className="mt-5 flex items-center justify-center gap-5 text-[11px] text-faint">
                <span className="flex items-center gap-1">
                  <FileArchive className="size-3.5" /> ZIP supported
                </span>
                <span className="flex items-center gap-1">
                  <FileJson className="size-3.5" /> All Google formats
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-positive" /> Never uploaded
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {importError && (
          <p className="mt-4 rounded-xl bg-danger/10 px-4 py-2 text-xs font-medium text-danger">
            {importError}
          </p>
        )}
      </motion.div>

      {!compact && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-faint">
          <MapPinned className="size-3.5" />
          Export yours at Google Takeout → Location History, or phone Settings →
          Location → Timeline → Export.
        </p>
      )}
    </div>
  );
}
