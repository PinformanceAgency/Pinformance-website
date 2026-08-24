import { loadBoards } from "@/lib/organic/workspace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BoardsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { boards, coverage } = await loadBoards(orgId);

  const uncoveredTopics = coverage.filter((c) => !c.is_covered);
  const boardsShort = boards.filter((b) => b.pin_count < 10 && b.status !== "PLANNED").length;

  return (
    <div className="space-y-6">
      {/* Coverage matrix */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Topic coverage</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-3">
            Every topic needs ≥5 active (SECRET / PROTECTED / PUBLIC) boards. Failure here blocks P4.1.1 (URL selection).
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {coverage.map((c) => (
              <div key={c.topic_name} className={cn(
                "rounded-md border px-3 py-2 text-xs",
                c.is_covered ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
              )}>
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{c.topic_name}</span>
                  <span className={cn("tabular-nums font-semibold", c.is_covered ? "text-emerald-700" : "text-red-700")}>
                    {c.active_boards}/5
                  </span>
                </div>
              </div>
            ))}
          </div>
          {uncoveredTopics.length > 0 && (
            <div className="mt-3 text-xs text-red-700">
              <strong>{uncoveredTopics.length} topic(s) short</strong> — add boards for: {uncoveredTopics.map((t) => t.topic_name).join(", ")}
            </div>
          )}
        </div>
      </section>

      {/* Board table */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-baseline justify-between">
          <span>Boards <span className="text-muted-foreground font-normal">({boards.length})</span></span>
          {boardsShort > 0 && <span className="text-xs text-red-600">{boardsShort} under 10 pins</span>}
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 px-3 font-medium">Board</th>
                  <th className="py-2 px-3 font-medium">Topic</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium text-right">Pins</th>
                  <th className="py-2 px-3 font-medium">Last pin</th>
                  <th className="py-2 px-3 font-medium text-right">URLs on board</th>
                </tr>
              </thead>
              <tbody>
                {boards.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="py-1.5 px-3">
                      <div className="font-medium text-foreground truncate max-w-[280px]" title={b.name}>{b.name}</div>
                      {b.primary_keyword && <div className="text-[10px] text-muted-foreground truncate">kw: {b.primary_keyword}</div>}
                    </td>
                    <td className="py-1.5 px-3 text-xs">
                      {b.topic_name ?? <span className="text-muted-foreground">—</span>}
                      {b.topic_name && (
                        <span className={cn("ml-1 text-[10px]", b.topic_covered ? "text-emerald-700" : "text-red-600")}>
                          {b.topic_covered ? "✓" : "!"}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3"><StatusPill status={b.status} /></td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <span className={cn(b.pin_count < 10 && b.status !== "PLANNED" ? "text-red-600 font-semibold" : "text-foreground")}>
                        {b.pin_count}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-xs text-muted-foreground tabular-nums">{b.last_pin_scheduled_date ?? "—"}</td>
                    <td className="py-1.5 px-3 text-right">
                      <span className="text-xs tabular-nums text-muted-foreground">{b.urls_pinned_count}</span>
                      {b.urls_pinned_names.length > 0 && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={b.urls_pinned_names.join(", ")}>
                          {b.urls_pinned_names.slice(0, 2).join(", ")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "PUBLIC"    ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "PROTECTED" ? "bg-blue-50 text-blue-700 border-blue-200" :
    status === "SECRET"    ? "bg-purple-50 text-purple-700 border-purple-200" :
    status === "PLANNED"   ? "bg-muted text-muted-foreground border-border" :
                             "bg-neutral-100 text-neutral-600 border-neutral-200";
  return <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide", cls)}>{status}</span>;
}
