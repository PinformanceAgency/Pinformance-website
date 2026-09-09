"use client";

/**
 * The topic picker on the URL table, and the bulk assign above it.
 *
 * Coverage is counted per topic, so a URL with no topic can never enter a
 * cycle — and until now nothing in the app could set one. Every URL the
 * sitemap importer wrote landed with a null topic, which is why Fit
 * Cherries held 167 URLs and could start nothing, with no screen saying
 * why. The importer now proposes a topic; this is where the ones it could
 * not place get theirs.
 *
 * Bulk assign exists because the alternative is 167 individual choices,
 * and a control nobody can face using is the same as no control.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export interface TopicOption { id: string; name: string }

async function setTopic(orgId: string, urlId: string, topicId: string | null) {
  const res = await fetch(`/api/organic/phase4/${orgId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "set_url_topic", url_id: urlId, topic_id: topicId }),
    redirect: "error",
  });
  const raw = await res.text();
  let data: { error?: string } = {};
  try { data = JSON.parse(raw); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${raw.slice(0, 160)}`);
}

export function TopicCell({
  orgId, urlId, topicId, topics,
}: {
  orgId: string;
  urlId: string;
  topicId: string | null;
  topics: TopicOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(topicId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function change(next: string) {
    const previous = value;
    setValue(next); setErr(null); setBusy(true);
    try {
      await setTopic(orgId, urlId, next || null);
      startTransition(() => router.refresh());
    } catch (e) {
      setValue(previous);
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  if (topics.length === 0) {
    return <span className="text-o-ink-3" title="No topics designed yet — phase 3 builds them.">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={value}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        aria-label="Topic"
        className={`rounded-md border px-1.5 py-0.5 text-xs bg-o-surface max-w-[10rem] ${
          value ? "border-o-hairline text-foreground" : "border-o-neg/50 text-o-neg"
        }`}
      >
        <option value="">— no topic —</option>
        {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {busy && <Loader2 className="w-3 h-3 animate-spin text-o-ink-3" />}
      {err && <span className="text-[11px] text-o-neg" role="alert">{err}</span>}
    </span>
  );
}

/**
 * Assign one topic to every URL that has none.
 *
 * Deliberately only touches the empty ones. Overwriting a topic somebody
 * chose — or one the importer matched on the account's own board names —
 * with a blanket value is not something a single button should be able to
 * do by accident.
 */
export function BulkTopicAssign({
  orgId, untopicked, topics,
}: {
  orgId: string;
  untopicked: string[];
  topics: TopicOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const n = untopicked.length;
  const label = useMemo(
    () => `${n} URL${n === 1 ? " has" : "s have"} no topic, so ${n === 1 ? "it" : "they"} cannot enter a cycle`,
    [n]
  );

  if (n === 0 || topics.length === 0) return null;

  async function apply() {
    if (!pick) { setErr("Pick a topic first."); return; }
    setErr(null); setBusy(true); setDone(null);
    let ok = 0;
    try {
      for (const id of untopicked) {
        await setTopic(orgId, id, pick);
        ok++;
      }
      setDone(ok);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(`${(e as Error).message} — ${ok} of ${n} were set.`);
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-[10px] border border-o-hairline bg-o-surface px-4 py-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
        Coverage is counted per topic, so a URL without one never clears the gate — it is not short of
        boards, there is simply nothing to count. Set them together here, then correct the individual
        ones in the table.
      </p>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}
          className="rounded-md border border-o-hairline px-2 py-1 text-xs bg-o-surface">
          <option value="">— pick a topic —</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" onClick={apply} disabled={busy || !pick} className="o-btn">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Apply to all {n}
        </button>
        {done !== null && <span className="text-xs text-o-ink-2">{done} set.</span>}
        {err && <span className="text-xs text-o-neg" role="alert">{err}</span>}
      </div>
    </div>
  );
}
