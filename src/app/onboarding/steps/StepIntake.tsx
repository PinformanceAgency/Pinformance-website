"use client";

import { useMemo, useState } from "react";
import type { OnboardingConfig } from "../config";

interface Props {
  onDone: () => void;
  config: OnboardingConfig;
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

const OTHER_VALUE = "__other__";
const GOOGLE_FORM_OTHER_TOKEN = "__other_option__";

export default function StepIntake({ onDone, config }: Props) {
  const questions = config.intake.questions;
  const [values, setValues] = useState<Record<string, string>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const missing = useMemo(() => {
    return questions
      .filter((q) => {
        if (!(q.required ?? true)) return false;
        const v = (values[q.id] ?? "").trim();
        if (!v) return true;
        // If "Other" chosen, the text next to it is also required
        if (q.allowOther && v === OTHER_VALUE && !(otherText[q.id] ?? "").trim()) return true;
        return false;
      })
      .map((q) => q.id);
  }, [questions, values, otherText]);

  const canSubmit = missing.length === 0 && !submitting;

  const setValue = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));
  const setOther = (id: string, v: string) => setOtherText((prev) => ({ ...prev, [id]: v }));

  const submit = async () => {
    if (!canSubmit) {
      setTouched(Object.fromEntries(questions.map((q) => [q.id, true])));
      return;
    }
    setSubmitting(true);
    setError(null);

    const answers: Record<string, string> = {};
    for (const q of questions) {
      const raw = values[q.id] ?? "";
      if (q.allowOther && raw === OTHER_VALUE) {
        // Google Forms convention for "Other" on radio/select fields:
        // - main field gets the magic __other_option__ token
        // - sibling `.other_option_response` field holds the free-text answer
        answers[q.entryId] = GOOGLE_FORM_OTHER_TOKEN;
        answers[`${q.entryId}.other_option_response`] = otherText[q.id] ?? "";
      } else {
        answers[q.entryId] = raw;
      }
    }

    try {
      const res = await fetch("/api/onboarding/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: answers,
          formResponseUrl: config.intake.formResponseUrl,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Error (${res.status})`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error while submitting");
      setSubmitting(false);
    }
  };

  if (!config.intake.formResponseUrl) {
    return (
      <div className="ob-warn">
        <strong>Intake not yet configured.</strong>
        <br />
        Set <code>intake.formResponseUrl</code> and the <code>entryId</code> for each question in <code>src/app/onboarding/config.ts</code>.
      </div>
    );
  }

  return (
    <>
      {questions.map((q) => {
        const showError = (touched[q.id] ?? false) && missing.includes(q.id);
        const isOtherSelected = q.allowOther && values[q.id] === OTHER_VALUE;
        const otherEmpty = (otherText[q.id] ?? "").trim().length === 0;

        return (
          <div key={q.id} className="ob-field">
            <label htmlFor={q.id}>
              {q.label}
              {(q.required ?? true) && <span style={{ color: "#F0021A" }}> *</span>}
            </label>
            {q.helper && <p className="ob-helper">{q.helper}</p>}

            {q.type === "textarea" ? (
              <textarea
                id={q.id}
                value={values[q.id] ?? ""}
                onChange={(e) => setValue(q.id, e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, [q.id]: true }))}
                placeholder={q.placeholder}
              />
            ) : q.type === "select" ? (
              <>
                <select
                  id={q.id}
                  value={values[q.id] ?? ""}
                  onChange={(e) => setValue(q.id, e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, [q.id]: true }))}
                >
                  <option value="">Choose…</option>
                  {q.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  {q.allowOther && <option value={OTHER_VALUE}>Other</option>}
                </select>

                {isOtherSelected && (
                  <input
                    type="text"
                    value={otherText[q.id] ?? ""}
                    onChange={(e) => setOther(q.id, e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, [q.id]: true }))}
                    placeholder={q.otherPlaceholder ?? "Please specify…"}
                    style={{ marginTop: 10 }}
                  />
                )}
                {isOtherSelected && showError && otherEmpty && (
                  <div className="ob-error">Please specify your answer.</div>
                )}
              </>
            ) : (
              <input
                id={q.id}
                type={q.type}
                value={values[q.id] ?? ""}
                onChange={(e) => setValue(q.id, e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, [q.id]: true }))}
                placeholder={q.placeholder}
              />
            )}

            {showError && !isOtherSelected && (
              <div className="ob-error">This field is required.</div>
            )}
          </div>
        );
      })}

      {error && (
        <div className="ob-warn" style={{ background: "#ffe6e6", borderColor: "#f5c2c2", color: "#7a0000" }}>
          {error}
        </div>
      )}

      <div className="ob-actions">
        <button className="ob-cta" onClick={submit} disabled={!canSubmit} type="button">
          <span>{submitting ? "Submitting…" : "Submit intake"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
