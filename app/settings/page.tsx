"use client";

/**
 * Settings: expense rates, basemap/privacy mode, data management.
 */
import { useState } from "react";
import { Database, Globe, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { Card, SectionTitle } from "@/components/ui/Card";
import { UploadZone } from "@/components/upload/UploadZone";
import { fmtBytes } from "@/lib/utils";

export default function SettingsPage() {
  const {
    dataset,
    expenseRates,
    setExpenseRates,
    useOnlineBasemap,
    setUseOnlineBasemap,
    clearData,
  } = useStore();
  const [confirming, setConfirming] = useState(false);

  const approxSize = dataset ? dataset.points.t.byteLength * 4.5 : 0;

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-10">
      <SectionTitle>Import data</SectionTitle>
      <UploadZone compact />

      <SectionTitle>Expense rates</SectionTitle>
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="size-4 text-accent" /> Reimbursement assumptions
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Currency symbol">
            <input
              value={expenseRates.currency}
              onChange={(e) => setExpenseRates({ ...expenseRates, currency: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Mileage / km">
            <input
              type="number"
              step="0.5"
              value={expenseRates.mileageRate}
              onChange={(e) =>
                setExpenseRates({ ...expenseRates, mileageRate: Number(e.target.value) || 0 })
              }
              className="input"
            />
          </Field>
          <Field label="Daily allowance">
            <input
              type="number"
              value={expenseRates.dailyAllowance}
              onChange={(e) =>
                setExpenseRates({ ...expenseRates, dailyAllowance: Number(e.target.value) || 0 })
              }
              className="input"
            />
          </Field>
          <Field label="Parking / stop">
            <input
              type="number"
              value={expenseRates.parkingPerStop}
              onChange={(e) =>
                setExpenseRates({ ...expenseRates, parkingPerStop: Number(e.target.value) || 0 })
              }
              className="input"
            />
          </Field>
        </div>
        <p className="text-xs text-faint">
          Applied to expense estimates in Calendar, Reports and Excel exports. Daily allowance
          counts days with more than 5 km of travel.
        </p>
      </Card>

      <SectionTitle>Privacy & map tiles</SectionTitle>
      <Card className="space-y-3 p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={useOnlineBasemap}
            onChange={(e) => setUseOnlineBasemap(e.target.checked)}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <Globe className="size-4 text-accent" /> Load OpenStreetMap basemap tiles
            </span>
            <span className="mt-0.5 block text-xs text-faint">
              The only network requests this app can make are anonymous map-tile downloads
              (OpenStreetMap / CARTO / Esri) for the background map. Your location data is never
              sent anywhere. Disable for a fully air-gapped mode — routes render on a blank canvas.
              Takes effect when the map page reloads.
            </span>
          </span>
        </label>
        <div className="flex items-center gap-2 rounded-xl bg-positive/10 px-3 py-2 text-xs font-medium text-positive">
          <ShieldCheck className="size-4" />
          Parsing, analytics, storage and reports run 100% on this device.
        </div>
      </Card>

      <SectionTitle>Data management</SectionTitle>
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm">
          <Database className="size-4 text-accent" />
          {dataset ? (
            <span>
              <b>{dataset.name}</b> · {dataset.stats.totalPoints.toLocaleString()} points ·{" "}
              {dataset.days.length} days · ≈{fmtBytes(approxSize)} cached in IndexedDB
            </span>
          ) : (
            <span className="text-faint">No dataset loaded.</span>
          )}
        </div>
        {dataset && (
          <p className="text-xs text-faint">
            Source files: {dataset.sourceFiles.join(", ")} · imported{" "}
            {new Date(dataset.importedAt).toLocaleString()}
          </p>
        )}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!dataset}
            className="flex items-center gap-2 rounded-xl border border-danger/40 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
          >
            <Trash2 className="size-4" /> Delete all local data
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void clearData();
                setConfirming(false);
              }}
              className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white"
            >
              Yes, delete everything
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-xl border border-hairline px-4 py-2 text-sm font-medium text-muted"
            >
              Cancel
            </button>
          </div>
        )}
      </Card>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid var(--hairline);
          background: transparent;
          padding: 8px 10px;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-faint uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
