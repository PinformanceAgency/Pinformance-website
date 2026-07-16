"use client";

import { useState } from "react";
import VideoEmbed from "./VideoEmbed";
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

export default function StepAdmin({ onDone, config }: Props) {
  const [readContract, setReadContract] = useState(false);
  const [signed, setSigned] = useState(false);
  const canProceed = readContract && signed;

  return (
    <>
      <VideoEmbed url={config.videos.admin} title="Administration & billing" caption="Video · Administration" />

      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={readContract}
            onClick={() => setReadContract((v) => !v)}
            aria-label="Contract read"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>1. {config.links.contractPdfUrl ? "Read the contract" : "Watch the admin & billing intro"}</span>
        </div>
        <p className="ob-card-desc" style={{ marginLeft: 34 }}>
          {config.links.contractPdfUrl
            ? "Read the contract carefully. We'll cover it on the kickoff too, but it helps to be familiar with the content."
            : "Watch the video above to understand how our billing works."}
        </p>
        {config.links.contractPdfUrl && (
          <div style={{ marginTop: 14, marginLeft: 34 }}>
            <a href={config.links.contractPdfUrl} target="_blank" rel="noopener noreferrer" className="ob-cta-secondary">
              Download contract PDF ↗
            </a>
          </div>
        )}
      </div>

      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={signed}
            onClick={() => setSigned((v) => !v)}
            aria-label="Contract signed"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>2. Sign the contract via DocuSign</span>
        </div>
        <p className="ob-card-desc" style={{ marginLeft: 34 }}>
          Open DocuSign, sign digitally and you'll receive a copy in your email automatically. Check this off once you're done.
        </p>
        <div style={{ marginTop: 14, marginLeft: 34 }}>
          {config.links.docusignContract ? (
            <a href={config.links.docusignContract} target="_blank" rel="noopener noreferrer" className="ob-cta-secondary">
              Open DocuSign ↗
            </a>
          ) : (
            <div className="ob-warn">
              DocuSign PowerForm URL not set — configure it in <code>src/app/onboarding/config.ts</code>.
            </div>
          )}
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} disabled={!canProceed} type="button">
          <span>{canProceed ? "Continue to the kickoff call" : "Check both to continue"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
