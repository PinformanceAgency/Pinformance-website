"use client";

import { useState } from "react";
import VideoEmbed from "./VideoEmbed";
import type { OnboardingConfig } from "../config";

interface Props {
  onDone: () => void;
  config: OnboardingConfig;
}

export default function StepAdmin({ onDone, config }: Props) {
  const [readContract, setReadContract] = useState(false);
  const [signed, setSigned] = useState(false);

  const canProceed = readContract && signed;

  return (
    <div>
      <VideoEmbed url={config.videos.admin} title="Administratie & facturering" />

      {config.links.contractPdfUrl && (
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
            Contract doorlezen
          </div>
          <p className="ob-card-desc" style={{ marginLeft: 32 }}>
            Neem het contract vooraf goed door. We bespreken 'm ook op de kickoff, maar het is handig om alvast met de inhoud bekend te zijn.
          </p>
          <div style={{ marginTop: 14, marginLeft: 32 }}>
            <a href={config.links.contractPdfUrl} target="_blank" rel="noopener noreferrer" className="ob-btn ob-btn-ghost">
              Download contract PDF ↗
            </a>
          </div>
        </div>
      )}

      {!config.links.contractPdfUrl && (
        <div className="ob-card">
          <div className="ob-card-title">
            <button
              type="button"
              className="ob-check"
              data-checked={readContract}
              onClick={() => setReadContract((v) => !v)}
              aria-label="Voorwaarden gelezen"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            Ik heb de intro over administratie & facturering bekeken
          </div>
        </div>
      )}

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
          Teken het contract via DocuSign
        </div>
        <p className="ob-card-desc" style={{ marginLeft: 32 }}>
          Je opent DocuSign, tekent digitaal en krijgt automatisch een kopie in je mail. Vink dit blok af zodra je klaar bent.
        </p>
        <div style={{ marginTop: 14, marginLeft: 32 }}>
          {config.links.docusignContract ? (
            <a href={config.links.docusignContract} target="_blank" rel="noopener noreferrer" className="ob-btn ob-btn-dark">
              Open DocuSign contract ↗
            </a>
          ) : (
            <div className="ob-warn">
              DocuSign PowerForm URL nog niet ingesteld — zet 'm in <code>src/app/onboarding/config.ts</code>.
            </div>
          )}
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onDone} disabled={!canProceed}>
          {canProceed ? "Verder naar de kickoff call →" : "Vink beide af om verder te gaan"}
        </button>
      </div>
    </div>
  );
}
