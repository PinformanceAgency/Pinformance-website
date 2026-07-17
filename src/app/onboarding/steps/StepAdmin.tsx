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
  const [contractsWatched, setContractsWatched] = useState(false);
  const [billingWatched, setBillingWatched] = useState(false);
  const canProceed = contractsWatched && billingWatched;

  return (
    <>
      {/* CONTRACTS */}
      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={contractsWatched}
            onClick={() => setContractsWatched((v) => !v)}
            aria-label="Contracts video watched"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>1. Contracts</span>
        </div>

        <div style={{ marginLeft: 34, marginBottom: 16 }}>
          <VideoEmbed url={config.videos.contracts} title="Contracts — NDA + Service Agreement" caption="Loom 3 · Contracts" />
        </div>

        <div style={{ marginLeft: 34, color: "#6b7075", fontSize: 14.5, lineHeight: 1.65 }}>
          <p style={{ margin: "0 0 10px" }}>
            Once you've completed the intake in the previous step, you'll receive two documents in your email:
            an <strong>NDA</strong> and a <strong>Service Agreement</strong>.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <strong>No need to sign anything beforehand</strong> — we go through both documents together on the
            kickoff call and you sign them then. Just make sure you've read through them so you know what's in there
            before we get on the call.
          </p>
          <p style={{ margin: 0 }}>
            The NDA covers confidentiality on both sides. The Service Agreement outlines exactly what we do,
            how we work, and what you can expect. Questions before the call? Just drop a message in Slack.
          </p>
        </div>
      </div>

      {/* BILLING */}
      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={billingWatched}
            onClick={() => setBillingWatched((v) => !v)}
            aria-label="Billing video watched"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>2. Billing</span>
        </div>

        <div style={{ marginLeft: 34, marginBottom: 16 }}>
          <VideoEmbed url={config.videos.billing} title="Billing — how invoicing works" caption="Loom 4 · Billing" />
        </div>

        <div style={{ marginLeft: 34, color: "#6b7075", fontSize: 14.5, lineHeight: 1.65 }}>
          <p style={{ margin: "0 0 10px" }}>
            Quick walkthrough of how billing works at Pinformance.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            You'll receive your invoice <strong>once a month</strong>, sent directly to your email.
            Once received, you have <strong>7 days</strong> to complete the payment. You'll always get a
            clear breakdown of exactly what's included — no surprises.
          </p>
          <p style={{ margin: 0 }}>
            Any question about an invoice? Reach out in Slack and we'll sort it for you.
          </p>
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} disabled={!canProceed} type="button">
          <span>{canProceed ? "Continue to kickoff call" : "Watch both videos to continue"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
