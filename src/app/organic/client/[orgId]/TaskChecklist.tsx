"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, HelpCircle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleFields } from "@/lib/organic/task-fields";
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
  // Conditional fields count only once they are on screen — see visibleFields.
  const fields = visibleFields(set, (k) => byKey.get(k)?.answer_bool);
  const answered = fields.filter((f) => {
    const a = byKey.get(f.key);
    if (!a) return false;
    return a.answer_bool !== null || a.answer_text !== null || a.answer_number !== null;
  }).length;

  return (
    <div className="mt-5 o-card overflow-hidden">
      <div className="o-card-head px-6 py-5">
        <div className="flex items-start justify-between gap-6">
          <p className="text-sm text-foreground leading-relaxed max-w-3xl">{set.intro}</p>
          {/* Progress as a ring, not a fraction in the corner. It is the
              one number worth seeing from across the page. */}
          <div className="shrink-0 flex items-center gap-2.5">
            <div className="relative w-9 h-9">
              <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3"
                        stroke="rgba(16,24,40,0.09)" />
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3"
                        strokeLinecap="round" stroke="var(--color-o-accent)"
                        strokeDasharray={`${(answered / Math.max(1, fields.length)) * 97.4} 97.4`}
                        className="transition-[stroke-dasharray] duration-500" />
              </svg>
              <span className="absolute inset-0 grid place-items-center o-figure text-[11px] text-o-ink">
                {answered}
              </span>
            </div>
            <span className="o-eyebrow">of {fields.length}</span>
          </div>
        </div>
        {set.scoring && (
          <p className="mt-4 pt-4 border-t border-o-hairline text-xs text-muted-foreground leading-relaxed max-w-3xl">
            <span className="font-semibold text-foreground">How it scores. </span>
            {set.scoring}
          </p>
        )}
      </div>

      <div className="divide-y divide-o-hairline">
        {fields.map((f, i) => (
          <FieldRow
            key={f.key}
            index={i + 1}
            conditional={!!f.onlyWhen}
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
  index, orgId, taskId, field, answer, readOnly, conditional,
}: {
  index: number;
  orgId: string;
  taskId: string;
  field: TaskField;
  answer: TaskAnswer | null;
  readOnly?: boolean;
  /** This row is on screen because an answer above it failed. */
  conditional?: boolean;
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
  // A row that appeared because a check failed is owed an answer by
  // definition — that is the only reason it is here.
  const owed = evidenceMissing || (conditional && !hasAnswer);

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

  const answerCls = "o-btn";

  return (
    <div className={cn(
      "relative px-6 py-6 transition-colors",
      owed && "bg-primary/[0.022]"
    )}>
      {/* A left rule marks the row that still owes something, rather than
          tinting the whole block and hoping it is noticed. */}
      {owed && (
        <span aria-hidden className="absolute left-0 inset-y-0 w-[3px] bg-o-accent" />
      )}
      <div className="flex gap-5">
        {/* Item number — makes a checklist read as a sequence you work
            through rather than a wall of boxes. */}
        <span className={cn(
          "shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-semibold tabular-nums ring-1 ring-inset transition-colors",
          hasAnswer
            ? "bg-o-accent text-white ring-o-accent"
            : "bg-o-surface text-o-ink-3 ring-o-hairline-firm"
        )}>
          {index}
        </span>

        <div className="flex-1 min-w-0">
          {conditional && (
            <span className="o-eyebrow text-o-accent">Because a check above did not pass</span>
          )}
          <h4 className={cn("o-h3 text-foreground", conditional && "mt-1")}>{field.question}</h4>

          {/* Two panels when the item needs arguing for, one line when it
              does not. See TaskField.why. */}
          {field.why ? (
            <div className="mt-3.5 grid md:grid-cols-2 gap-px bg-o-hairline rounded-lg overflow-hidden max-w-4xl">
              <div className="bg-o-sunk/60 px-4 py-3.5">
                <span className="o-eyebrow inline-flex items-center gap-1.5">
                  <HelpCircle className="w-3 h-3" /> Why it matters
                </span>
                <p className="mt-1.5 text-sm text-o-ink-2 leading-relaxed">{field.why}</p>
              </div>
              <div className="bg-o-sunk/60 px-4 py-3.5">
                <span className="o-eyebrow inline-flex items-center gap-1.5">
                  <CircleDot className="w-3 h-3" /> How to check
                </span>
                <p className="mt-1.5 text-sm text-o-ink-2 leading-relaxed">{field.how}</p>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-o-ink-2 leading-relaxed max-w-3xl">{field.how}</p>
          )}

          {/* ---- the answer ------------------------------------- */}
          <div className="mt-4">
            {field.kind === "boolean" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button" disabled={readOnly || busy !== null}
                  onClick={() => save({ answer_bool: true }, "answer")}
                  className={cn(answerCls, bool === true && "o-btn-primary")}
                >
                  <Check className="w-4 h-4" /> Yes
                </button>
                <button
                  type="button" disabled={readOnly || busy !== null}
                  onClick={() => save({ answer_bool: false }, "answer")}
                  className={cn(answerCls, bool === false && "o-btn-dark")}
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
                    className={cn(answerCls, answer?.answer_text === o && "o-btn-primary")}
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
                  className="o-input w-36"
                />
                {field.unit && <span className="text-sm text-muted-foreground">{field.unit}</span>}
                <button
                  type="button" disabled={readOnly || busy !== null || num === ""}
                  onClick={() => save({ answer_number: Number(num) }, "answer")}
                  className={cn(answerCls, "o-btn-primary")}
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
                  className="o-input max-w-3xl"
                />
                <div className="mt-2">
                  <button
                    type="button" disabled={readOnly || busy !== null}
                    onClick={() => save({ answer_text: text }, "answer")}
                    className={cn(answerCls, "o-btn-primary")}
                  >
                    {busy === "answer" ? "Saving…" : "Save answer"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- the reasoning ----------------------------------
              No prompt, no box. On a conformance check ("is the domain
              claimed") a reasoning field behind a yes is busywork, and
              busywork is what teaches people to type "yes" into it. */}
          {field.evidence !== undefined && field.kind !== "longtext" && field.kind !== "text" && (
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
                className={cn("o-input mt-2 max-w-3xl", evidenceMissing && "border-o-accent/45")}
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={readOnly || busy !== null || evidence === (answer?.evidence ?? "")}
                  onClick={() => save({ evidence }, "evidence")}
                  className={cn(answerCls, evidence !== (answer?.evidence ?? "") && "o-btn-primary")}
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
