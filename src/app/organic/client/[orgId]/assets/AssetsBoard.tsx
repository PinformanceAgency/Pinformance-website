"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2, Plus } from "lucide-react";
import type { AssetRow } from "@/lib/organic/workspace";
import { cn } from "@/lib/utils";

const TYPES = [
  ["BRAND_BOOK", "Brand book"],
  ["CONTENT_DRIVE", "Content drive"],
  ["PININSPECTOR_EXPORT", "PinInspector export"],
  ["CANVA_DESIGN", "Canva design"],
  ["FLAGGED_PIN_REPORT", "Flagged-pin report"],
  ["GOOGLE_KEYWORD_LIST", "Google keyword list"],
  ["AUDIENCE_DOCUMENT", "Audience document"],
  ["PRODUCT_FEED", "Product feed"],
  ["MOODBOARD", "Moodboard"],
  ["OTHER", "Other"],
] as const;

const TASK_HINTS = [
  ["P1.1.6", "Collect brand book"],
  ["P1.1.7", "Connect content drive"],
  ["P1.1.8", "Request Google keyword list"],
  ["P1.1.9", "Audience document"],
  ["P1.1.10", "Connect product feed"],
  ["P2.1.6", "Export competitor pins (PinInspector)"],
  ["P2.1.7", "Collect top pin designs"],
  ["P1.2.2", "Flagged pin check"],
] as const;

export function AssetsBoard({ orgId, initial }: { orgId: string; initial: AssetRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", url: "", type: "OTHER" as string, source_tool: "", linked_task_id: "", notes: "" });

  async function save() {
    setErr(null); setSaving(true);
    try {
      const res = await fetch(`/api/organic/assets/${orgId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title, url: form.url, type: form.type,
          source_tool: form.source_tool || null,
          linked_task_id: form.linked_task_id || null,
          notes: form.notes || null,
        }),
        redirect: "error",
      });
      const t = await res.text();
      const j = t ? JSON.parse(t) : {};
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status} — ${t.slice(0, 140)}`);
      setForm({ title: "", url: "", type: "OTHER", source_tool: "", linked_task_id: "", notes: "" });
      setAdding(false);
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this asset link?")) return;
    const res = await fetch(`/api/organic/assets/${orgId}?id=${id}`, { method: "DELETE" });
    if (res.ok) setRows(rows.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Assets <span className="text-muted-foreground font-normal">({rows.length})</span></h2>
          <p className="text-xs text-muted-foreground mt-0.5">External links only — no file storage. Everything traces back to the task that captured it.</p>
        </div>
        <button type="button" onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-3.5 h-3.5" /> Add asset link
        </button>
      </section>

      {adding && (
        <section className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-xs col-span-2">
              <span className="text-muted-foreground block mb-0.5">Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-md border border-border px-2 py-1 text-xs bg-card" />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground block mb-0.5">Type</span>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-md border border-border px-2 py-1 text-xs bg-card">
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs col-span-2">
              <span className="text-muted-foreground block mb-0.5">URL (external only)</span>
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://drive.google.com/…"
                className="w-full rounded-md border border-border px-2 py-1 text-xs bg-card" />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground block mb-0.5">Source tool</span>
              <input value={form.source_tool} onChange={(e) => setForm({ ...form, source_tool: e.target.value })}
                placeholder="Drive, Canva, PinInspector…"
                className="w-full rounded-md border border-border px-2 py-1 text-xs bg-card" />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground block mb-0.5">Linked task</span>
              <select value={form.linked_task_id} onChange={(e) => setForm({ ...form, linked_task_id: e.target.value })}
                className="w-full rounded-md border border-border px-2 py-1 text-xs bg-card">
                <option value="">— none —</option>
                {TASK_HINTS.map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}
              </select>
            </label>
            <label className="text-xs col-span-2">
              <span className="text-muted-foreground block mb-0.5">Notes</span>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-md border border-border px-2 py-1 text-xs bg-card" />
            </label>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            {err && <span className="text-xs text-red-600 break-words flex-1">{err}</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setAdding(false)}
              className="px-3 py-1 text-xs rounded-md border border-border hover:bg-muted">Cancel</button>
            <button type="button" onClick={save} disabled={saving}
              className="px-3 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving…" : "Add asset"}
            </button>
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-xs text-muted-foreground text-center">
          No assets yet. Add a link to a brand book, content drive, or export.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 px-3 font-medium">Title</th>
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium">Source tool</th>
                <th className="py-2 px-3 font-medium">Linked task</th>
                <th className="py-2 px-3 font-medium">Added</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-1.5 px-3">
                    <a href={a.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 text-foreground hover:text-primary font-medium")}>
                      {a.title} <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </a>
                    {a.notes && <div className="text-[10px] text-muted-foreground">{a.notes}</div>}
                  </td>
                  <td className="py-1.5 px-3 text-[10px] text-muted-foreground uppercase">{a.type.replace(/_/g, " ")}</td>
                  <td className="py-1.5 px-3 text-xs text-muted-foreground">{a.source_tool ?? "—"}</td>
                  <td className="py-1.5 px-3 text-xs">
                    {a.linked_task_id ? (
                      <span className="text-muted-foreground">{a.linked_task_id}{a.linked_task_name && <span className="ml-1 text-neutral-400">· {a.linked_task_name}</span>}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-1.5 px-3 text-xs text-muted-foreground tabular-nums">{a.uploaded_at.slice(0, 10)}</td>
                  <td className="py-1.5 px-3 text-right">
                    <button type="button" onClick={() => remove(a.id)} className="text-muted-foreground hover:text-red-600" aria-label="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
