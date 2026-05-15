"use client";

import { useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConversionWindow =
  | "30/1"
  | "30/7"
  | "7/7"
  | "7/1"
  | "1/1"
  | "30/30";

export const CONVERSION_WINDOWS: {
  key: ConversionWindow;
  click: number;
  view: number;
  label: string;
}[] = [
  { key: "30/1", click: 30, view: 1, label: "30-day click / 1-day view" },
  { key: "30/7", click: 30, view: 7, label: "30-day click / 7-day view" },
  { key: "30/30", click: 30, view: 30, label: "30-day click / 30-day view" },
  { key: "7/7", click: 7, view: 7, label: "7-day click / 7-day view" },
  { key: "7/1", click: 7, view: 1, label: "7-day click / 1-day view" },
  { key: "1/1", click: 1, view: 1, label: "1-day click / 1-day view" },
];

export const CONVERSION_SETTINGS_STORAGE_KEY = "paid-ads:conversion-window";

export function ConversionSettings({
  value,
  onChange,
}: {
  value: ConversionWindow;
  onChange: (v: ConversionWindow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ConversionWindow>(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
      >
        <SettingsIcon className="w-3.5 h-3.5" />
        Conversion settings ({value})
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] rounded-xl border border-border bg-card shadow-xl z-30 p-4">
          <div className="font-semibold text-sm">Conversion settings</div>
          <div className="mt-4">
            <div className="text-xs font-medium text-foreground mb-2">Conversion window</div>
            <div className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              Time period during which a conversion is counted after a click or view.
            </div>
            <div className="space-y-1">
              {CONVERSION_WINDOWS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => setDraft(w.key)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left",
                    draft === w.key
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span>
                    <span className="font-medium">{w.key}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{w.label}</span>
                  </span>
                  {draft === w.key && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-border">
            <div className="text-xs font-medium text-foreground mb-2">
              Conversion date for daily reporting
            </div>
            <div className="text-[11px] text-muted-foreground mb-2">
              Always reports on <strong className="text-foreground">Date of conversion event</strong>{" "}
              to match Pinterest Campaign Manager.
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
