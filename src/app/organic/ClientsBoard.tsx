"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientListRow } from "@/lib/organic/types";

export function ClientsBoard({ rows }: { rows: ClientListRow[] }) {
  const active = rows.filter((r) => r.activated);
  const inactive = rows.filter((r) => !r.activated);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-lg font-semibold mb-3">
          Active clients <span className="text-neutral-400 font-normal">({active.length})</span>
        </h1>
        {active.length === 0 ? (
          <EmptyCard>No clients activated yet. Activate one from the list below.</EmptyCard>
        ) : (
          <ClientsTable rows={active} />
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Not activated <span className="text-neutral-400 font-normal">({inactive.length})</span>
        </h2>
        {inactive.length === 0 ? (
          <EmptyCard>Every organisation is activated.</EmptyCard>
        ) : (
          <InactiveTable rows={inactive} />
        )}
      </section>
    </div>
  );
}

function ClientsTable({ rows }: { rows: ClientListRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="py-2 px-3 font-medium">Client</th>
            <th className="py-2 px-3 font-medium">Niche</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">Account</th>
            <th className="py-2 px-3 font-medium text-right">Daily</th>
            <th className="py-2 px-3 font-medium text-center">Phase</th>
            <th className="py-2 px-3 font-medium">Progress</th>
            <th className="py-2 px-3 font-medium text-right">Blocked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.org_id}
              className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 transition-colors"
            >
              <td className="py-2 px-3">
                <Link
                  href={`/client/${r.org_id}`}
                  className="font-medium text-neutral-900 hover:text-primary"
                >
                  {r.name}
                </Link>
              </td>
              <td className="py-2 px-3 text-neutral-600">{r.niche ?? "—"}</td>
              <td className="py-2 px-3">
                <EngagementPill status={r.engagement_status} />
              </td>
              <td className="py-2 px-3">
                <AccountCell klass={r.account_class} spacingHours={r.spacing_hours} />
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-neutral-700">
                {r.daily_pin_target ?? "—"}
              </td>
              <td className="py-2 px-3 text-center tabular-nums text-neutral-700">
                {r.current_phase ?? "—"}
              </td>
              <td className="py-2 px-3">
                <ProgressBar pct={r.pct_done} />
              </td>
              <td className="py-2 px-3 text-right tabular-nums">
                {r.blocked_tasks > 0 ? (
                  <span className="text-red-600 font-semibold">{r.blocked_tasks}</span>
                ) : (
                  <span className="text-neutral-400">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InactiveTable({ rows }: { rows: ClientListRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.org_id}
              className="border-b border-neutral-100 last:border-b-0"
            >
              <td className="py-2 px-3 font-medium text-neutral-700">{r.name}</td>
              <td className="py-2 px-3 text-right">
                <ActivateButton orgId={r.org_id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivateButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/organic/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId }),
      });

      // Read body as text first — /api routes returning 404 render an HTML
      // page, and res.json() would throw an unrelated SyntaxError that hides
      // the real HTTP failure.
      const text = await res.text();
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        // Non-JSON response — keep the raw body snippet so the operator can
        // see what came back (404 page, gateway error, etc).
      }

      if (!res.ok) {
        const snippet = text ? text.replace(/\s+/g, " ").slice(0, 120) : "";
        setError(
          data.error ??
            `HTTP ${res.status}${snippet ? ` — ${snippet}` : ""}`
        );
        return;
      }

      startTransition(() => router.refresh());
    } catch (e) {
      // Network error, aborted request, unexpected exception. Never fail silently.
      const msg = e instanceof Error ? e.message : String(e);
      console.error("activate() failed", e);
      setError(`Request failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2 max-w-md justify-end">
      {error && (
        <span className="text-xs text-red-600 text-right break-words" role="alert">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={activate}
        disabled={submitting}
        className="px-2.5 py-1 text-xs font-medium rounded-md border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-wait shrink-0"
      >
        {submitting ? "Activating…" : "Activate"}
      </button>
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-500 text-center">
      {children}
    </div>
  );
}

function EngagementPill({ status }: { status: ClientListRow["engagement_status"] }) {
  if (!status) return <span className="text-neutral-400 text-xs">—</span>;
  const cls =
    status === "ACTIVE"
      ? "bg-foreground text-white border-foreground"
      : status === "ONBOARDING"
      ? "bg-primary/10 text-primary border-primary/30"
      : status === "PAUSED"
      ? "bg-muted text-foreground border-border"
      : status === "CHURNED"
      ? "bg-neutral-100 text-neutral-500 border-neutral-200"
      : "bg-neutral-50 text-neutral-600 border-neutral-200";
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function AccountCell({ klass, spacingHours }: { klass: string | null; spacingHours: number | null }) {
  if (!klass) return <span className="text-neutral-400">—</span>;
  return (
    <span className="text-neutral-700">
      <span className="font-medium">{klass}</span>
      {spacingHours != null && (
        <span className="text-neutral-400 ml-1.5 text-xs">· every {spacingHours}h</span>
      )}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-foreground" : pct >= 50 ? "bg-primary" : "bg-border";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden max-w-[120px]">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-neutral-600 w-9 text-right">{pct}%</span>
    </div>
  );
}
