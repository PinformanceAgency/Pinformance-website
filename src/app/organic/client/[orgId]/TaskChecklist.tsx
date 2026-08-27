"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, HelpCircle, CircleDot, Paperclip, ExternalLink, AlertTriangle, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleFields, raisedConcerns, planKeyFor } from "@/lib/organic/task-fields";
import type { TaskField, TaskFieldSet, FieldConcern, RaisedConcern } from "@/lib/organic/task-fields";
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
  const concerns = raisedConcerns(
    set,
    (k) => byKey.get(k)?.answer_bool,
    (k) => byKey.get(k)?.answer_text
  );
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

      {concerns.length > 0 && <ConcernSummary concerns={concerns} />}

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
            planAnswer={byKey.get(planKeyFor(f.key)) ?? null}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * What this assessment found wrong, before you have scrolled to it.
 *
 * The per-row warning is where the thinking happens, but a fit check runs
 * five questions deep and the flag raised on question one is off screen by
 * the time you answer question three. This is the same information as a
 * standing tally: what was raised, and whether anybody has said what we do
 * about it.
 */
function ConcernSummary({ concerns }: { concerns: RaisedConcern[] }) {
  const unplanned = concerns.filter((c) => !c.planned).length;
  const worst = concerns.some((c) => c.concern.severity === "reconsider")
    ? "reconsider"
    : "work_around";

  return (
    <div className={cn(
      "px-6 py-4 border-t",
      worst === "reconsider"
        ? "bg-o-accent/[0.055] border-o-accent/25"
        : "bg-o-accent/[0.03] border-o-hairline"
    )}>
      <div className="flex items-start gap-3">
        <span className={cn("shrink-0 mt-0.5", worst === "reconsider" ? "text-o-accent" : "text-o-accent/80")}>
          {worst === "reconsider"
            ? <OctagonAlert className="w-4 h-4" />
            : <AlertTriangle className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {concerns.length === 1
              ? "One thing on this account needs an answer"
              : `${concerns.length} things on this account need an answer`}
            {unplanned > 0 && (
              <span className="font-normal text-o-accent"> — {unplanned} still without a plan</span>
            )}
          </p>
          <ul className="mt-2 space-y-1.5">
            {concerns.map((c) => (
              <li key={c.field.key} className="text-sm text-o-ink-2 flex items-baseline gap-2">
                <a href={`#field-${c.field.key}`}
                   className="text-foreground hover:text-o-accent underline underline-offset-2 decoration-o-hairline-firm">
                  {c.concern.headline}
                </a>
                <span className={cn(
                  "o-eyebrow shrink-0",
                  c.planned ? "text-o-ink-3" : "text-o-accent"
                )}>
                  {c.planned ? "plan written" : "no plan yet"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * The warning on the answer that caused it.
 *
 * Drawn under the Yes/No buttons the moment the concerning answer is
 * given, because that is the second the person is still thinking about
 * this question. It states the cost rather than the fact — "the account
 * plateaus around month two" tells you something "this is a negative
 * signal" does not — and it points at the plan box that has just opened
 * underneath it, so the warning has somewhere to go.
 */
function ConcernPanel({
  concern, planned, onOpen,
}: {
  concern: FieldConcern;
  planned: boolean;
  /** Reopen the dialog. The pop-up fires on the answer, and somebody who
   *  put it off needs a way back to it that is not "answer the question
   *  again". */
  onOpen: () => void;
}) {
  const hard = concern.severity === "reconsider";
  return (
    <div
      role="alert"
      className={cn(
        "mt-4 max-w-3xl rounded-lg overflow-hidden ring-1 ring-inset",
        hard ? "ring-o-accent/40 bg-o-accent/[0.05]" : "ring-o-accent/25 bg-o-accent/[0.028]"
      )}
    >
      <div className={cn(
        "flex items-center gap-2 px-4 py-2.5 border-b",
        hard ? "border-o-accent/25" : "border-o-accent/15"
      )}>
        <span className="text-o-accent shrink-0">
          {hard ? <OctagonAlert className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        </span>
        <span className="o-eyebrow text-o-accent">
          {hard ? "Stop and think" : "Watch out"}
        </span>
        <span className="text-sm font-semibold text-foreground">{concern.headline}</span>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-sm text-o-ink-2 leading-relaxed">{concern.consequence}</p>
        <p className={cn(
          "mt-3 text-sm leading-relaxed",
          planned ? "text-o-ink-2" : "text-foreground font-medium"
        )}>
          {planned
            ? "Answered below."
            : `${concern.ask} Answer it in the box below — this check stays open until you do.`}
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-2.5 text-xs text-o-accent hover:text-foreground underline underline-offset-2"
        >
          {planned ? "Read the warning again" : "Answer it now"}
        </button>
      </div>
    </div>
  );
}

/**
 * The warning, in the way.
 *
 * The inline panel is the standing record; this is the moment it happens.
 * It opens on the click that raises the concern, because that is the one
 * second the person is still thinking about this question and has the
 * client on the phone — half an hour later they are three tasks further
 * and the answer has become a row in a table.
 *
 * It takes the plan itself rather than only acknowledging: a dialog you
 * dismiss with "OK" teaches you to dismiss it with "OK". And it can be
 * left for later on purpose — some of these cannot be solved (a
 * one-product store is a one-product store) and pretending otherwise
 * would make the honest answer the one you have to lie to get past. The
 * flag does not go away either way; it stays on the row and in the tally
 * at the top until a plan is written.
 */
function ConcernDialog({
  concern, field, plan, saving, error,
  onSavePlan, onRevert, onClose,
}: {
  concern: FieldConcern;
  field: TaskField;
  plan: string;
  saving: boolean;
  error: string | null;
  onSavePlan: (text: string) => void;
  onRevert: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(plan);
  const hard = concern.severity === "reconsider";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={concern.headline}
    >
      <div
        className="w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-xl bg-o-surface shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn(
          "flex items-start gap-3 px-6 py-4 border-b",
          hard ? "bg-o-accent/[0.07] border-o-accent/25" : "bg-o-accent/[0.04] border-o-hairline"
        )}>
          <span className="text-o-accent shrink-0 mt-0.5">
            {hard ? <OctagonAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </span>
          <div className="min-w-0">
            <div className="o-eyebrow text-o-accent">
              {hard ? "Stop and think" : "Watch out"}
            </div>
            <h3 className="mt-1 o-h3 text-foreground">{concern.headline}</h3>
            <p className="mt-0.5 text-xs text-o-ink-3">
              In answer to: {field.question}
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-o-ink-2 leading-relaxed">{concern.consequence}</p>

          <label className="mt-5 block text-sm font-semibold text-foreground">
            {concern.ask}
          </label>
          <p className="mt-1 text-xs text-o-ink-2 leading-relaxed">
            If it cannot be solved, say so and say what we accept because of it — a stated
            ceiling is an answer, an empty box is not.
          </p>
          <textarea
            autoFocus
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={concern.example}
            className="o-input mt-2 w-full"
          />

          {error && (
            <p className="mt-2 text-xs text-red-600 break-words" role="alert">
              Could not save: {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onRevert}
              disabled={saving}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              That is not what I meant — change my answer
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="o-btn">
                Later
              </button>
              <button
                type="button"
                onClick={() => onSavePlan(text)}
                disabled={saving || !text.trim()}
                className={cn("o-btn", "o-btn-primary")}
              >
                {saving ? "Saving…" : "Save the plan"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  index, orgId, taskId, field, answer, readOnly, conditional, planAnswer,
}: {
  index: number;
  orgId: string;
  taskId: string;
  field: TaskField;
  answer: TaskAnswer | null;
  readOnly?: boolean;
  /** This row is on screen because an answer above it failed. */
  conditional?: boolean;
  /** The plan written for this field's concern, where it has one. Passed in
   *  rather than derived here because the dialog opens with it already in
   *  the box: coming back to a raised flag should show what was said last
   *  time, not an empty textarea. */
  planAnswer?: TaskAnswer | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "answer" | "evidence" | "file" | "plan">(null);
  const [err, setErr] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(answer?.evidence ?? "");
  const [text, setText] = useState(answer?.answer_text ?? "");
  const [num, setNum] = useState(answer?.answer_number != null ? String(answer.answer_number) : "");
  const [fileUrl, setFileUrl] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [concernOpen, setConcernOpen] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);

  const bool = answer?.answer_bool ?? null;
  const planned = !!(planAnswer?.answer_text ?? "").trim();
  const hasAnswer =
    bool !== null || answer?.answer_text != null || answer?.answer_number != null;
  const evidenceMissing = hasAnswer && field.evidenceRequired && !(answer?.evidence ?? "").trim();
  // The concerning answer, given. Not "an answer we dislike" — an answer
  // that has a stated cost and an unanswered question attached to it.
  const concerned = field.concern != null && bool === field.concern.when;
  // A row that appeared because a check failed is owed an answer by
  // definition — that is the only reason it is here.
  const owed = evidenceMissing || (conditional && !hasAnswer) || (concerned && !planned);

  /** Returns whether the write actually landed, so a caller can act on it —
   *  the concern dialog must not open over a save that failed. */
  async function save(
    patch: Record<string, unknown>,
    which: "answer" | "evidence" | "file" | "plan",
    fieldKey: string = field.key
  ): Promise<boolean> {
    const fail = which === "plan" ? setPlanErr : setErr;
    fail(null); setBusy(which);
    try {
      const res = await fetch(`/api/organic/answers/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, field_key: fieldKey, ...patch }),
        redirect: "error",
      });
      const raw = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(raw); } catch { /* keep raw */ }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${raw.slice(0, 120)}`);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      startTransition(() => router.refresh());
      return true;
    } catch (e) {
      fail((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  /**
   * Answering a yes/no, and putting the warning in front of whoever did.
   *
   * The dialog opens on the answer landing rather than on the click, so a
   * save that failed cannot leave somebody planning around a concern the
   * database never recorded.
   */
  async function answerBool(v: boolean) {
    const ok = await save({ answer_bool: v }, "answer");
    if (ok && field.concern && v === field.concern.when) setConcernOpen(true);
  }

  const answerCls = "o-btn";

  return (
    <div id={`field-${field.key}`} className={cn(
      "relative px-6 py-6 transition-colors scroll-mt-24",
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
                  onClick={() => answerBool(true)}
                  className={cn(answerCls, bool === true && "o-btn-primary")}
                >
                  <Check className="w-4 h-4" /> Yes
                </button>
                <button
                  type="button" disabled={readOnly || busy !== null}
                  onClick={() => answerBool(false)}
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

            {/* The whole point of the check. Without it a yes and a no are
                the same click and the assessment assesses nothing. */}
            {concerned && field.concern && (
              <ConcernPanel concern={field.concern} planned={planned}
                             onOpen={() => setConcernOpen(true)} />
            )}

            {field.kind === "choice" && (
              <div className="flex flex-wrap items-center gap-2">
                {(field.options ?? []).map((o) => (
                  <button
                    key={o} type="button" disabled={readOnly || busy !== null}
                    onClick={() => save({ answer_text: o }, "answer")}
                    className={cn(answerCls, answer?.answer_text === o && "o-btn-primary")}
                  >
                    {field.optionLabels?.[o] ?? o}
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

          {/* ---- the file this answer rests on --------------------
              Per question, not per task. A task with six checks used to
              share one attachment between them, filed at the end behind a
              dialog — so the reader got a document and no idea which check
              it proved, and the person filing it had to leave the question
              they were looking at to do it. */}
          <div className="mt-4">
            {answer?.file_url ? (
              <div className="flex items-center gap-2.5 max-w-3xl rounded-lg bg-o-sunk/60 ring-1 ring-inset ring-o-hairline px-3.5 py-2.5">
                <Paperclip className="w-3.5 h-3.5 text-o-ink-3 shrink-0" />
                <a href={answer.file_url} target="_blank" rel="noreferrer"
                   className="flex-1 min-w-0 text-sm text-primary hover:underline truncate">
                  {answer.file_title || answer.file_url}
                </a>
                <a href={answer.file_url} target="_blank" rel="noreferrer"
                   className="text-o-ink-3 hover:text-foreground shrink-0" title="Open">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {!readOnly && (
                  <button type="button" disabled={busy !== null}
                    onClick={() => { setFileUrl(""); save({ clear: "file" }, "file"); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0">
                    remove
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="url" value={fileUrl} disabled={readOnly}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="Link the file for this question — https://drive.google.com/…"
                  className="o-input max-w-md flex-1 min-w-[16rem]"
                />
                <button
                  type="button" disabled={readOnly || busy !== null || !fileUrl.trim()}
                  onClick={() => save({ file_url: fileUrl.trim(), file_title: titleFromUrl(fileUrl) }, "file")}
                  className={cn(answerCls, fileUrl.trim() && "o-btn-primary")}
                >
                  {busy === "file"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Paperclip className="w-4 h-4" />}
                  Attach
                </button>
              </div>
            )}
          </div>

          {err && (
            <p className="mt-2 text-xs text-red-600 break-words" role="alert">
              Could not save: {err}
            </p>
          )}
        </div>
      </div>

      {concernOpen && field.concern && !readOnly && (
        <ConcernDialog
          concern={field.concern}
          field={field}
          plan={planAnswer?.answer_text ?? ""}
          saving={busy === "plan" || busy === "answer"}
          error={planErr}
          onClose={() => setConcernOpen(false)}
          onRevert={async () => {
            const ok = await save({ clear: "answer" }, "answer");
            if (ok) setConcernOpen(false);
          }}
          onSavePlan={async (t) => {
            const ok = await save({ answer_text: t }, "plan", planKeyFor(field.key));
            if (ok) setConcernOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * A readable name from a pasted URL, so the attachment does not render as
 * eighty characters of query string. The last meaningful path segment is
 * almost always the document name; the host is the fallback.
 */
function titleFromUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(seg ?? "").slice(0, 120) || u.hostname;
  } catch {
    return raw.trim().slice(0, 120);
  }
}
