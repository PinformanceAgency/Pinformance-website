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
  completed: string[];
  intakeSubmittedAt?: string;
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
  const totalSteps = STEPS.length;
  const progressPct = ((currentIdx + 1) / totalSteps) * 100;

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

  const goBack = () => {
    if (currentIdx === 0) return;
    setProgress((p) => ({ ...p, currentStep: STEPS[currentIdx - 1].id }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    if (typeof window !== "undefined" && confirm("Weet je zeker dat je opnieuw wil beginnen? Je huidige voortgang gaat verloren.")) {
      localStorage.removeItem(STORAGE_KEY);
      setProgress(DEFAULT_PROGRESS);
    }
  };

  if (!hydrated) {
    return (
      <div style={{ padding: "120px 20px", textAlign: "center", color: "#8a8e93", fontSize: 14 }}>
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
    <div className="ob-root">
      <style>{`
        /* =============================================
           Layout — Implement-style, centered single column
           ============================================= */
        .ob-root {
          background: #fff;
          color: #111315;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        /* Header */
        .ob-header { width: 100%; border-bottom: 1px solid #f0f0f1; background: #fff; }
        .ob-header-inner {
          max-width: 1080px; margin: 0 auto;
          padding: 0 24px;
          height: 64px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .ob-header-logo img { height: 26px; display: block; }
        .ob-step-counter {
          font-family: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #8a8e93;
        }

        /* Progress bar */
        .ob-progress-track { width: 100%; height: 4px; background: #f0f0f1; }
        .ob-progress-fill {
          height: 100%;
          background: #F0021A;
          transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Main */
        .ob-main { flex: 1; display: flex; align-items: flex-start; padding: 48px 0 40px; }
        @media (min-width: 720px) { .ob-main { padding: 72px 0 60px; align-items: center; } }

        .ob-container {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          padding: 0 24px;
          text-align: center;
        }

        /* Pill badge above headline */
        .ob-pill {
          display: inline-flex; align-items: center;
          padding: 8px 18px;
          border-radius: 999px;
          background: #F0021A;
          color: #fff;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 28px;
        }

        /* Headline */
        .ob-headline {
          font-size: clamp(38px, 8vw, 88px);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 0.95;
          margin: 0 0 24px;
          color: #111315;
        }
        .ob-headline .ob-headline-num { color: #F0021A; }

        /* Lead paragraph */
        .ob-lead {
          font-size: clamp(16px, 2.2vw, 20px);
          color: #6b7075;
          max-width: 620px;
          margin: 0 auto 44px;
          line-height: 1.5;
        }

        /* Step body */
        .ob-step-body { margin: 0 auto; max-width: 780px; text-align: left; }
        .ob-step-body-center { text-align: center; }

        /* Video slot */
        .ob-video {
          position: relative;
          width: 100%;
          max-width: 780px;
          margin: 0 auto 40px;
          aspect-ratio: 16 / 9;
          background: #faf9f6;
          border-radius: 20px;
          border: 1px solid #f0f0f1;
          overflow: hidden;
        }
        .ob-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        .ob-video-placeholder {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; color: #8a8e93; padding: 20px; text-align: center;
        }
        .ob-video-play-btn {
          width: 78px; height: 78px;
          border-radius: 50%;
          background: #111315;
          display: grid; place-items: center;
          border: 0;
          box-shadow: 0 20px 40px rgba(17,19,21,0.15);
          cursor: pointer;
          transition: transform .2s ease, background .2s ease;
        }
        .ob-video-play-btn:hover { transform: scale(1.05); background: #F0021A; }
        .ob-video-play-btn svg { width: 26px; height: 26px; color: #fff; margin-left: 4px; }
        .ob-video-caption {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #8a8e93;
        }

        /* Primary CTA button — big pill */
        .ob-cta {
          display: inline-flex; align-items: center; gap: 12px;
          padding: 18px 34px;
          border-radius: 999px;
          background: #F0021A;
          color: #fff;
          font-weight: 700;
          font-size: 16px;
          text-decoration: none;
          border: 0;
          cursor: pointer;
          transition: background .15s ease, transform .15s ease, opacity .15s ease;
          font-family: inherit;
        }
        .ob-cta:hover:not(:disabled) { background: #c80216; transform: translateY(-1px); }
        .ob-cta:disabled { background: #e0e2e5; color: #8a8e93; cursor: not-allowed; }
        .ob-cta svg { width: 18px; height: 18px; transition: transform .2s ease; }
        .ob-cta:hover:not(:disabled) svg { transform: translateX(4px); }

        .ob-cta-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 26px;
          border-radius: 999px;
          background: transparent;
          color: #111315;
          font-weight: 600;
          font-size: 15px;
          text-decoration: none;
          border: 1px solid #ececec;
          cursor: pointer;
          transition: background .15s ease;
          font-family: inherit;
        }
        .ob-cta-secondary:hover { background: #f5f5f5; }

        .ob-back-link {
          background: transparent;
          border: 0;
          color: #8a8e93;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 24px;
          display: inline-flex; align-items: center; gap: 6px;
          font-family: inherit;
        }
        .ob-back-link:hover { color: #111315; }

        .ob-actions {
          display: flex; flex-wrap: wrap; gap: 12px;
          justify-content: center;
          margin-top: 32px;
        }

        /* Cards used inside steps */
        .ob-card {
          background: #fff;
          border: 1px solid #f0f0f1;
          border-radius: 16px;
          padding: 22px;
          margin-bottom: 14px;
          text-align: left;
        }
        .ob-card-title {
          font-weight: 700; font-size: 16px; margin: 0 0 6px;
          display: flex; align-items: flex-start; gap: 12px;
        }
        .ob-card-desc { color: #6b7075; font-size: 14.5px; line-height: 1.55; margin: 0; }
        .ob-check {
          width: 22px; height: 22px; flex-shrink: 0;
          border-radius: 50%; border: 2px solid #e0e2e5; cursor: pointer;
          display: grid; place-items: center;
          background: #fff;
          margin-top: 1px;
          transition: background .15s ease, border-color .15s ease;
        }
        .ob-check[data-checked="true"] { background: #F0021A; border-color: #F0021A; }
        .ob-check[data-checked="true"] svg { display: block; }
        .ob-check svg { display: none; color: #fff; }

        /* Team cards */
        .ob-team { display: grid; grid-template-columns: 1fr; gap: 12px; margin: 0 auto 32px; max-width: 780px; text-align: left; }
        @media (min-width: 640px) { .ob-team { grid-template-columns: 1fr 1fr; } }
        .ob-team-card {
          background: #faf9f6;
          border: 1px solid #f0f0f1;
          border-radius: 16px;
          padding: 22px;
        }
        .ob-team-role {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: #F0021A;
          font-weight: 700;
          margin-bottom: 10px;
        }
        .ob-team-name { font-weight: 700; font-size: 16px; margin: 0 0 6px; }
        .ob-team-desc { color: #6b7075; font-size: 13.5px; line-height: 1.55; margin: 0; }

        /* Form fields */
        .ob-field { margin-bottom: 20px; text-align: left; }
        .ob-field label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 6px; color: #111315; }
        .ob-field .ob-helper { font-size: 13px; color: #8a8e93; margin: 0 0 8px; }
        .ob-field input, .ob-field textarea, .ob-field select {
          width: 100%; box-sizing: border-box;
          padding: 14px 16px;
          border: 1px solid #e0e2e5;
          border-radius: 12px;
          font-family: inherit;
          font-size: 15px;
          background: #fff;
          color: #111315;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .ob-field input:focus, .ob-field textarea:focus, .ob-field select:focus {
          outline: none;
          border-color: #F0021A;
          box-shadow: 0 0 0 3px rgba(240,2,26,0.1);
        }
        .ob-field textarea { resize: vertical; min-height: 110px; }
        .ob-field .ob-error { color: #F0021A; font-size: 13px; margin-top: 6px; }

        .ob-warn {
          background: #fff8e6;
          border: 1px solid #fce4a2;
          color: #7a5c00;
          padding: 14px 18px;
          border-radius: 12px;
          font-size: 14px;
          margin-bottom: 20px;
          text-align: left;
        }

        /* Footer */
        .ob-footer {
          border-top: 1px solid #f0f0f1;
          padding: 20px 0;
          background: #fff;
        }
        .ob-footer-inner {
          max-width: 1080px; margin: 0 auto;
          padding: 0 24px;
          display: flex; flex-direction: column; gap: 8px;
          align-items: center;
        }
        @media (min-width: 720px) {
          .ob-footer-inner { flex-direction: row; justify-content: space-between; }
        }
        .ob-footer-copy { font-size: 12px; color: #8a8e93; margin: 0; }
        .ob-footer-step {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #8a8e93;
          background: transparent; border: 0; cursor: pointer;
          padding: 0;
        }
        .ob-footer-step:hover { color: #111315; }
      `}</style>

      {/* HEADER */}
      <header className="ob-header">
        <div className="ob-header-inner">
          <a href="https://pinformance-agency.com" className="ob-header-logo" aria-label="Pinformance">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/onboarding/logo-dark.svg" alt="Pinformance" />
          </a>
          <span className="ob-step-counter">
            Stap {currentIdx + 1} / {totalSteps}
          </span>
        </div>
      </header>

      {/* PROGRESS BAR */}
      <div className="ob-progress-track" role="progressbar" aria-valuenow={currentIdx + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
        <div className="ob-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* MAIN — centered single column */}
      <main className="ob-main">
        <div className="ob-container">
          {currentIdx > 0 && (
            <button className="ob-back-link" onClick={goBack} type="button">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Terug
            </button>
          )}

          <div className="ob-pill">Stap {currentStep.number} · {currentStep.short}</div>

          <h1 className="ob-headline">
            {currentStep.title}<span className="ob-headline-num">.</span>
          </h1>

          <p className="ob-lead">{currentStep.desc}</p>

          <div className="ob-step-body">{stepBody}</div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="ob-footer">
        <div className="ob-footer-inner">
          <p className="ob-footer-copy">© 2026 Pinformance Agency</p>
          <button className="ob-footer-step" onClick={reset} type="button" title="Opnieuw beginnen">
            Onboarding · {currentIdx + 1} van {totalSteps}
          </button>
        </div>
      </footer>
    </div>
  );
}
