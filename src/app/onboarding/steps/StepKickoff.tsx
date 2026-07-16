"use client";

import { useState } from "react";
import type { OnboardingConfig } from "../config";

interface Props {
  onDone: () => void;
  config: OnboardingConfig;
}

export default function StepKickoff({ onDone, config }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  if (!config.links.calendlyKickoff) {
    return (
      <div>
        <div className="ob-warn">
          Calendly URL voor kickoff nog niet ingesteld — zet <code>links.calendlyKickoff</code> in <code>src/app/onboarding/config.ts</code>.
        </div>
        <div className="ob-actions">
          <button className="ob-btn ob-btn-primary" onClick={onDone} disabled>
            Bevestig eerst je call
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ width: "100%", height: 720, borderRadius: 14, overflow: "hidden", border: "1px solid #ececec", marginBottom: 20 }}>
        <iframe
          src={config.links.calendlyKickoff}
          width="100%"
          height="100%"
          frameBorder={0}
          title="Kickoff call inplannen"
        />
      </div>

      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={confirmed}
            onClick={() => setConfirmed((v) => !v)}
            aria-label="Kickoff call ingepland"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          Ik heb mijn kickoff call ingepland
        </div>
        <p className="ob-card-desc" style={{ marginLeft: 32 }}>
          Bevestig hier zodra je een moment hebt gekozen. Je krijgt automatisch een agenda-uitnodiging en bevestiging in je mail.
        </p>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onDone} disabled={!confirmed}>
          Afronden →
        </button>
      </div>
    </div>
  );
}
