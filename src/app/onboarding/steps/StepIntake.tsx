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

export default function StepIntake({ onDone, config }: Props) {
  const questions = config.intake.questions;
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const missing = useMemo(() => {
    return questions
      .filter((q) => (q.required ?? true) && !(values[q.id] ?? "").trim())
      .map((q) => q.id);
  }, [questions, values]);

  const canSubmit = missing.length === 0 && !submitting;

  const setValue = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  const submit = async () => {
    if (!canSubmit) {
      setTouched(Object.fromEntries(questions.map((q) => [q.id, true])));
      return;
    }
    setSubmitting(true);
    setError(null);

    const answers: Record<string, string> = {};
    for (const q of questions) answers[q.entryId] = values[q.id] ?? "";
    const labelled: Record<string, string> = {};
    for (const q of questions) labelled[q.label] = values[q.id] ?? "";

    try {
      const res = await fetch("/api/onboarding/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: answers,
          labelled,
          formResponseUrl: config.intake.formResponseUrl,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Fout (${res.status})`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout bij versturen");
      setSubmitting(false);
    }
  };

  if (!config.intake.formResponseUrl) {
    return (
      <div className="ob-warn">
        <strong>Intake nog niet geconfigureerd.</strong>
        <br />
        Zet in <code>src/app/onboarding/config.ts</code> de <code>intake.formResponseUrl</code> en de <code>entryId</code> per vraag.
      </div>
    );
  }

  return (
    <>
      {questions.map((q) => {
        const showError = (touched[q.id] ?? false) && missing.includes(q.id);
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
              <select
                id={q.id}
                value={values[q.id] ?? ""}
                onChange={(e) => setValue(q.id, e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, [q.id]: true }))}
              >
                <option value="">Kies…</option>
                {q.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
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
            {showError && <div className="ob-error">Dit veld is verplicht.</div>}
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
          <span>{submitting ? "Versturen…" : "Verstuur intake"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
