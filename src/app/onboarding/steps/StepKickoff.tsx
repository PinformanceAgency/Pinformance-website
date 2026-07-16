"use client";

import { useState } from "react";
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

export default function StepKickoff({ onDone, config }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  if (!config.links.calendlyKickoff) {
    return (
      <>
        <div className="ob-warn">
          Kickoff Calendly URL not set — configure <code>links.calendlyKickoff</code> in <code>src/app/onboarding/config.ts</code>.
        </div>
        <div className="ob-actions">
          <button className="ob-cta" disabled type="button">
            <span>Confirm your call first</span>
            <ArrowIcon />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ width: "100%", height: 720, borderRadius: 20, overflow: "hidden", border: "1px solid #f0f0f1", marginBottom: 20 }}>
        <iframe
          src={config.links.calendlyKickoff}
          width="100%"
          height="100%"
          frameBorder={0}
          title="Book your kickoff call"
        />
      </div>

      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={confirmed}
            onClick={() => setConfirmed((v) => !v)}
            aria-label="Kickoff call booked"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>I've booked my kickoff call</span>
        </div>
        <p className="ob-card-desc" style={{ marginLeft: 34 }}>
          Confirm here once you've picked a slot. You'll receive a calendar invite in your email automatically.
        </p>
      </div>

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} disabled={!confirmed} type="button">
          <span>Finish</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
