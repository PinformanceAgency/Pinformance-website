"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, HelpCircle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskField, TaskFieldSet } from "@/lib/organic/task-fields";
import type { TaskAnswer } from "@/lib/organic/workspace";

/**
 * One question per block, full width, with its reasoning.
 *
 * What this replaces was a two-column grid of tick boxes labelled
 * "Visual product", "High average order value". Those are labels, not
 * questions: two people tick them for different reasons and neither
 * reason is recorded anywhere. The score survived, the thinking did not.
 *
 * So each item now runs the full width of the panel and states the
 * question, why it decides anything, and where to look — then takes the
 * answer and the evidence behind it. Every field saves on its own, which
 * matters because these get filled in over a call rather than in one
 * sitting.
 */

export function TaskChecklist({
  orgId, taskId, set, answers,
  readOnly,
}: {
  orgId: string;
  taskId: string;
  set: TaskFieldSet;
  answers: TaskAnswer[];
  readOnly?: boolean;
}) {
  const byKey = new Map(answers.filter((a) => a.task_id === taskId).map((a) => [a.field_key, a]));
  const answered = set.fields.filter((f) => {
    const a = byKey.get(f.key);
    if (!a) return false;
    return a.answer_bool !== null || a.answer_text !== null || a.answer_number !== null;
  }).length;

  return (
    <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/40">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-foreground leading-relaxed max-w-3xl">{set.intro}</p>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
            {answered}/{set.fields.length}
          </span>
        </div>
        {set.scoring && (
          <p className="mt-2.5 pt-2.5 border-t border-border text-xs text-muted-foreground leading-relaxed max-w-3xl">
            <span className="font-semibold text-foreground">How it scores. </span>
            {set.scoring}
          </p>
        )}
      </div>

      <div className="divide-y divide-border">
        {set.fields.map((f, i) => (
          <FieldRow
            key={f.key}
            index={i + 1}
            orgId={orgId}
            taskId={taskId}
            field={f}
            answer={byKey.get(f.key) ?? null}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FieldRow({
  index, orgId, taskId, field, answer, readOnly,
}: {
  index: number;
  orgId: string;
  taskId: string;
  field: TaskField;
  answer: TaskAnswer | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "answer" | "evidence">(null);
  const [err, setErr] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(answer?.evidence ?? "");
  const [text, setText] = useState(answer?.answer_text ?? "");
  const [num, setNum] = useState(answer?.answer_number != null ? String(answer.answer_number) : "");
  const [savedFlash, setSavedFlash] = useState(false);

  const bool = answer?.answer_bool ?? null;
  const hasAnswer =
    bool !== null || answer?.answer_text != null || answer?.answer_number != null;
  const evidenceMissing = hasAnswer && field.evidenceRequired && !(answer?.evidence ?? "").trim();

  async function save(patch: Record<string, unknown>, which: "answer" | "evidence") {
    setErr(null); setBusy(which);
    try {
      const res = await fetch(`/api/organic/answers/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, field_key: field.key, ...patch }),
        redirect: "error",
      });
      const raw = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(raw); } catch { /* keep raw */ }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${raw.slice(0, 120)}`);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const answerCls =
    "rounded-md border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <div className={cn("px-5 py-5", evidenceMissing && "bg-primary/[0.03]")}>
      <div className="flex gap-4">
        {/* Item number — makes a checklist read as a sequence you work
            through rather than a wall of boxes. */}
        <span className={cn(
          "shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-semibold tabular-nums",
          hasAnswer ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}>
          {index}
        </span>

        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold text-foreground leading-snug">
            {field.question}
          </h4>

          <div className="mt-2.5 grid md:grid-cols-2 gap-x-8 gap-y-2 max-w-4xl">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <HelpCircle className="w-3.5 h-3.5" /> Why it matters
              </span>
              <br />
              {field.why}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <CircleDot className="w-3.5 h-3.5" /> How to check
              </span>
              <br />
              {field.how}
            </p>
          </div>

          {/* ---- the answer ------------------------------------- */}
          <div className="mt-4">
            {field.kind === "boolean" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button" disabled={readOnly || busy !== null}
                  onClick={() => save({ answer_bool: true }, "answer")}
                  className={cn(answerCls, "inline-flex items-center gap-1.5",
                    bool === true
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted")}
                >
                  <Check className="w-4 h-4" /> Yes
                </button>
                <button
                  type="button" disabled={readOnly || busy !== null}
                  onClick={() => save({ answer_bool: false }, "answer")}
                  className={cn(answerCls, "inline-flex items-center gap-1.5",
                    bool === false
                      ? "border-foreground bg-foreground text-white"
                      : "border-border bg-card text-foreground hover:bg-muted")}
                >
                  <X className="w-4 h-4" /> No
                </button>
                {bool !== null && !readOnly && (
                  <button type="button" disabled={busy !== null}
                    onClick={() => save({ clear: "answer" }, "answer")}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                    clear
                  </button>
                )}
                {busy === "answer" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            )}

            {field.kind === "choice" && (
              <div className="flex flex-wrap items-center gap-2">
                {(field.options ?? []).map((o) => (
                  <button
                    key={o} type="button" disabled={readOnly || busy !== null}
                    onClick={() => save({ answer_text: o }, "answer")}
                    className={cn(answerCls,
                      answer?.answer_text === o
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted")}
                  >
                    {o}
                  </button>
                ))}
                {busy === "answer" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            )}

            {field.kind === "number" && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number" value={num} disabled={readOnly}
                  onChange={(e) => setNum(e.target.value)}
                  className="w-36 rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
                {field.unit && <span className="text-sm text-muted-foreground">{field.unit}</span>}
                <button
                  type="button" disabled={readOnly || busy !== null || num === ""}
                  onClick={() => save({ answer_number: Number(num) }, "answer")}
                  className={cn(answerCls, "border-primary bg-primary text-primary-foreground hover:opacity-90")}
                >
                  {busy === "answer" ? "Saving…" : "Save"}
                </button>
              </div>
            )}

            {(field.kind === "text" || field.kind === "longtext") && (
              <div>
                <textarea
                  rows={field.kind === "longtext" ? 3 : 2} value={text} disabled={readOnly}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={field.evidence}
                  className="w-full max-w-3xl rounded-md border border-border bg-card px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-primary"
                />
                <div className="mt-2">
                  <button
                    type="button" disabled={readOnly || busy !== null}
                    onClick={() => save({ answer_text: text }, "answer")}
                    className={cn(answerCls, "border-primary bg-primary text-primary-foreground hover:opacity-90")}
                  >
                    {busy === "answer" ? "Saving…" : "Save answer"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- the reasoning ---------------------------------- */}
          {field.kind !== "longtext" && field.kind !== "text" && (
            <div className="mt-4">
              <label className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                Why?
                {field.evidenceRequired
                  ? <span className={cn("text-xs font-normal",
                      evidenceMissing ? "text-primary" : "text-muted-foreground")}>
                      {evidenceMissing ? "still needed" : "required"}
                    </span>
                  : <span className="text-xs font-normal text-muted-foreground">optional</span>}
              </label>
              <textarea
                rows={2} value={evidence} disabled={readOnly}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder={field.evidence}
                className={cn(
                  "mt-1.5 w-full max-w-3xl rounded-md border bg-card px-3 py-2 text-sm leading-relaxed",
                  "focus:outline-none focus:border-primary",
                  evidenceMissing ? "border-primary/40" : "border-border"
                )}
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={readOnly || busy !== null || evidence === (answer?.evidence ?? "")}
                  onClick={() => save({ evidence }, "evidence")}
                  className={cn(answerCls,
                    evidence !== (answer?.evidence ?? "")
                      ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
                      : "border-border bg-card text-muted-foreground")}
                >
                  {busy === "evidence" ? "Saving…" : evidence !== (answer?.evidence ?? "") ? "Save reasoning" : "Saved"}
                </button>
                {savedFlash && (
                  <span className="text-xs text-foreground inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
              </div>
            </div>
          )}

          {err && (
            <p className="mt-2 text-xs text-red-600 break-words" role="alert">
              Could not save: {err}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
