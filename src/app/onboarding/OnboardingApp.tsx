"use client";

import { useEffect, useMemo, useState } from "react";
import { ONBOARDING_CONFIG } from "./config";
import { STEPS, STEP_IDS } from "./steps";
import StepWelcome from "./steps/StepWelcome";
import StepIntake from "./steps/StepIntake";
import StepPinterest from "./steps/StepPinterest";
import StepAdmin from "./steps/StepAdmin";
import StepKickoff from "./steps/StepKickoff";
import StepDone from "./steps/StepDone";

const STORAGE_KEY = "pinformance.onboarding.v1";

interface Progress {
  currentStep: string;
  completed: string[];        // step ids
  intakeSubmittedAt?: string; // ISO
}

const DEFAULT_PROGRESS: Progress = {
  currentStep: "welcome",
  completed: [],
};

function loadProgress(): Progress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Progress;
    if (!STEP_IDS.includes(parsed.currentStep)) return DEFAULT_PROGRESS;
    return parsed;
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function saveProgress(p: Progress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export default function OnboardingApp() {
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProgress(loadProgress());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveProgress(progress);
  }, [progress, hydrated]);

  const currentIdx = useMemo(
    () => Math.max(0, STEP_IDS.indexOf(progress.currentStep)),
    [progress.currentStep]
  );
  const currentStep = STEPS[currentIdx];

  const isUnlocked = (idx: number) => {
    if (idx === 0) return true;
    // A step is unlocked if all preceding steps are completed
    return STEPS.slice(0, idx).every((s) => progress.completed.includes(s.id));
  };

  const goToStep = (idx: number) => {
    if (idx < 0 || idx >= STEPS.length) return;
    if (!isUnlocked(idx)) return;
    setProgress((p) => ({ ...p, currentStep: STEPS[idx].id }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const completeCurrent = (extra?: Partial<Progress>) => {
    setProgress((p) => {
      const completed = p.completed.includes(currentStep.id)
        ? p.completed
        : [...p.completed, currentStep.id];
      const nextIdx = Math.min(STEPS.length - 1, currentIdx + 1);
      return {
        ...p,
        ...extra,
        completed,
        currentStep: STEPS[nextIdx].id,
      };
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    if (typeof window !== "undefined" && confirm("Weet je zeker dat je opnieuw wil beginnen? Je huidige voortgang gaat verloren.")) {
      localStorage.removeItem(STORAGE_KEY);
      setProgress(DEFAULT_PROGRESS);
    }
  };

  // Don't render step content until hydrated (avoids flash of wrong step + SSR mismatch)
  if (!hydrated) {
    return (
      <div style={{ padding: "80px 20px", textAlign: "center", color: "#6b7075", fontSize: 14 }}>
        Laden…
      </div>
    );
  }

  const stepBody = (() => {
    switch (currentStep.id) {
      case "welcome":   return <StepWelcome onDone={() => completeCurrent()} config={ONBOARDING_CONFIG} />;
      case "intake":    return <StepIntake onDone={() => completeCurrent({ intakeSubmittedAt: new Date().toISOString() })} config={ONBOARDING_CONFIG} />;
      case "pinterest": return <StepPinterest onDone={() => completeCurrent()} config={ONBOARDING_CONFIG} />;
      case "admin":     return <StepAdmin onDone={() => completeCurrent()} config={ONBOARDING_CONFIG} />;
      case "kickoff":   return <StepKickoff onDone={() => completeCurrent()} config={ONBOARDING_CONFIG} />;
      case "done":      return <StepDone config={ONBOARDING_CONFIG} />;
      default:          return null;
    }
  })();

  return (
    <div className="ob-shell">
      <style>{`
        .ob-shell { display: grid; grid-template-columns: 1fr; gap: 0; }
        @media (min-width: 960px) {
          .ob-shell { grid-template-columns: 300px 1fr; }
        }
        .ob-sidebar {
          background: #111315;
          color: #fff;
          padding: 32px 24px;
        }
        @media (min-width: 960px) {
          .ob-sidebar {
            min-height: calc(100vh - 74px);
            position: sticky;
            top: 74px;
            height: calc(100vh - 74px);
            overflow-y: auto;
          }
        }
        .ob-sidebar-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.5); font-weight: 600; margin-bottom: 20px; }
        .ob-step-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .ob-step {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 12px 14px;
          border-radius: 10px;
          cursor: pointer;
          background: transparent;
          border: 1px solid transparent;
          text-align: left;
          width: 100%;
          color: rgba(255,255,255,0.75);
          font-size: 14px;
          transition: background .15s ease, color .15s ease, border-color .15s ease;
        }
        .ob-step:hover:not(:disabled) { background: rgba(255,255,255,0.04); color: #fff; }
        .ob-step[data-active="true"] { background: rgba(240,2,26,0.08); border-color: rgba(240,2,26,0.3); color: #fff; }
        .ob-step:disabled { cursor: not-allowed; opacity: 0.45; }
        .ob-badge {
          flex-shrink: 0;
          width: 28px; height: 28px;
          border-radius: 50%;
          background: rgba(255,255,255,0.08);
          display: grid; place-items: center;
          font-size: 12px; font-weight: 700;
          color: #fff;
        }
        .ob-step[data-active="true"] .ob-badge { background: #F0021A; }
        .ob-step[data-done="true"] .ob-badge { background: #16a34a; }
        .ob-step-title { font-weight: 600; line-height: 1.35; }
        .ob-step-sub { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px; }

        .ob-content { padding: 40px 24px 80px; max-width: 820px; }
        @media (min-width: 960px) { .ob-content { padding: 56px 48px 96px; } }

        .ob-content h1 { font-size: clamp(26px, 4.4vw, 36px); font-weight: 800; letter-spacing: -0.02em; margin: 0 0 8px; line-height: 1.15; }
        .ob-eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #F0021A; font-weight: 700; margin-bottom: 10px; }
        .ob-lead { color: #6b7075; margin: 0 0 32px; font-size: 15.5px; line-height: 1.55; max-width: 640px; }

        .ob-video { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #f5f5f5; border-radius: 14px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 2px rgba(17,19,21,0.04), 0 6px 20px rgba(17,19,21,0.06); }
        .ob-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        .ob-video-placeholder { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; color: #6b7075; font-size: 14px; padding: 20px; }

        .ob-actions { display: flex; align-items: center; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
        .ob-btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 999px; font-weight: 700; font-size: 15px; text-decoration: none; border: 0; cursor: pointer; transition: transform .15s ease, background .15s ease, opacity .15s ease; }
        .ob-btn-primary { background: #F0021A; color: #fff; }
        .ob-btn-primary:hover:not(:disabled) { background: #c80216; transform: translateY(-1px); }
        .ob-btn-primary:disabled { background: #f5f5f5; color: #999; cursor: not-allowed; }
        .ob-btn-ghost { background: transparent; color: #111315; border: 1px solid #ececec; }
        .ob-btn-ghost:hover { background: #f5f5f5; }
        .ob-btn-dark { background: #111315; color: #fff; }
        .ob-btn-dark:hover { background: #000; transform: translateY(-1px); }

        .ob-card { background: #fff; border: 1px solid #ececec; border-radius: 14px; padding: 22px; margin-bottom: 18px; }
        .ob-card-title { font-weight: 700; font-size: 16px; margin: 0 0 6px; display: flex; align-items: center; gap: 10px; }
        .ob-card-desc { color: #6b7075; font-size: 14.5px; line-height: 1.55; margin: 0; }
        .ob-check {
          width: 20px; height: 20px; flex-shrink: 0;
          border-radius: 50%; border: 2px solid #ececec; cursor: pointer;
          display: grid; place-items: center;
          background: #fff;
        }
        .ob-check[data-checked="true"] { background: #16a34a; border-color: #16a34a; }
        .ob-check[data-checked="true"] svg { display: block; }
        .ob-check svg { display: none; color: #fff; }

        .ob-team { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 24px; }
        @media (min-width: 640px) { .ob-team { grid-template-columns: 1fr 1fr; } }
        .ob-team-card { background: #f8f9fb; border: 1px solid #ececec; border-radius: 14px; padding: 18px; }
        .ob-team-name { font-weight: 700; font-size: 15px; margin: 0 0 4px; }
        .ob-team-role { font-size: 12px; color: #F0021A; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 8px; }
        .ob-team-desc { font-size: 13.5px; color: #6b7075; margin: 0; line-height: 1.5; }

        .ob-field { margin-bottom: 18px; }
        .ob-field label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 6px; color: #111315; }
        .ob-field .ob-helper { font-size: 13px; color: #6b7075; margin: 0 0 8px; }
        .ob-field input, .ob-field textarea, .ob-field select {
          width: 100%; box-sizing: border-box;
          padding: 12px 14px;
          border: 1px solid #ececec;
          border-radius: 10px;
          font-family: inherit;
          font-size: 15px;
          background: #fff;
          color: #111315;
          transition: border-color .15s ease;
        }
        .ob-field input:focus, .ob-field textarea:focus, .ob-field select:focus { outline: none; border-color: #F0021A; }
        .ob-field textarea { resize: vertical; min-height: 100px; }
        .ob-field .ob-error { color: #F0021A; font-size: 13px; margin-top: 6px; }

        .ob-warn { background: #fff8e6; border: 1px solid #fce4a2; color: #7a5c00; padding: 14px 18px; border-radius: 12px; font-size: 14px; margin-bottom: 20px; }

        .ob-reset { margin-top: 24px; font-size: 12px; color: rgba(255,255,255,0.4); background: transparent; border: 0; cursor: pointer; text-decoration: underline; padding: 0; }
        .ob-reset:hover { color: rgba(255,255,255,0.7); }
      `}</style>

      {/* SIDEBAR / STEPPER */}
      <aside className="ob-sidebar">
        <div className="ob-sidebar-title">Onboarding · {progress.completed.length}/{STEPS.length - 1} klaar</div>
        <ul className="ob-step-list">
          {STEPS.map((s, idx) => {
            const done = progress.completed.includes(s.id);
            const active = idx === currentIdx;
            const unlocked = isUnlocked(idx);
            return (
              <li key={s.id}>
                <button
                  className="ob-step"
                  data-active={active}
                  data-done={done}
                  disabled={!unlocked}
                  onClick={() => goToStep(idx)}
                  aria-current={active ? "step" : undefined}
                >
                  <span className="ob-badge">
                    {done ? (
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : unlocked ? (
                      s.number
                    ) : (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    )}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <span className="ob-step-title">{s.short}</span>
                    <span className="ob-step-sub">Stap {s.number}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button className="ob-reset" onClick={reset}>Opnieuw beginnen</button>
      </aside>

      {/* MAIN CONTENT */}
      <section className="ob-content">
        <div className="ob-eyebrow">Stap {currentStep.number} van {STEPS.length}</div>
        <h1>{currentStep.title}</h1>
        <p className="ob-lead">{currentStep.desc}</p>
        {stepBody}
      </section>
    </div>
  );
}
