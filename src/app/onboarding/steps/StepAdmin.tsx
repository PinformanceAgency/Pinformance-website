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
      <VideoEmbed url={config.videos.admin} title="Administratie & facturering" caption="Video · Administratie" />

      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={readContract}
            onClick={() => setReadContract((v) => !v)}
            aria-label="Contract gelezen"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>1. {config.links.contractPdfUrl ? "Contract doorlezen" : "Intro over administratie & facturering bekijken"}</span>
        </div>
        <p className="ob-card-desc" style={{ marginLeft: 34 }}>
          {config.links.contractPdfUrl
            ? "Neem het contract vooraf goed door. We bespreken 'm ook op de kickoff, maar het is handig om alvast met de inhoud bekend te zijn."
            : "Bekijk de video hierboven zodat je weet hoe onze facturering werkt."}
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
            aria-label="Contract getekend"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>2. Contract tekenen via DocuSign</span>
        </div>
        <p className="ob-card-desc" style={{ marginLeft: 34 }}>
          Open DocuSign, teken digitaal en krijg automatisch een kopie in je mail. Vink dit blok af zodra je klaar bent.
        </p>
        <div style={{ marginTop: 14, marginLeft: 34 }}>
          {config.links.docusignContract ? (
            <a href={config.links.docusignContract} target="_blank" rel="noopener noreferrer" className="ob-cta-secondary">
              Open DocuSign ↗
            </a>
          ) : (
            <div className="ob-warn">
              DocuSign PowerForm URL nog niet ingesteld — zet 'm in <code>src/app/onboarding/config.ts</code>.
            </div>
          )}
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} disabled={!canProceed} type="button">
          <span>{canProceed ? "Door naar de kickoff call" : "Vink beide af om verder te gaan"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
