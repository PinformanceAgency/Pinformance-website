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
  // Eén video over contracten en facturatie samen, dus één bevestiging. Er
  // stonden hier twee kaarten met twee vinkjes toen dit nog twee Looms waren.
  const [watched, setWatched] = useState(false);
  const canProceed = watched;

  return (
    <>
      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={watched}
            onClick={() => setWatched((v) => !v)}
            aria-label="Contracts and billing video watched"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>Contracts &amp; billing</span>
        </div>

        <div style={{ marginLeft: 34, marginBottom: 16 }}>
          <VideoEmbed
            url={config.videos.contracts}
            title="Contracts & billing"
            caption="Video · Contracts and billing"
          />
        </div>

        <div style={{ marginLeft: 34, color: "var(--muted)", fontSize: 14.5, lineHeight: 1.65 }}>
          <p style={{ margin: "0 0 10px" }}>
            Once you&apos;ve finished the full onboarding, we prepare two <strong>custom-made</strong> documents
            for your brand: an <strong>NDA</strong> and a <strong>Service Agreement</strong>. You&apos;ll receive both
            in your email so you can read through them at your own pace.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <strong>It would be perfect if you could sign them before the kickoff call.</strong> That way we
            can get started right away, and we spend the call on the things that actually make an impact
            instead of on paperwork.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            The NDA covers confidentiality on both sides. The Service Agreement outlines exactly what we do,
            how we work, and what you can expect from us. Anything you&apos;d like to go through before you
            sign? Send us a message. We&apos;d rather answer it now than have you sign something you&apos;re
            unsure about.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            On <strong>billing</strong>: you&apos;ll receive your invoice <strong>once a month</strong>, sent directly
            to your email. Once received, you have <strong>7 days</strong> to complete the payment. You&apos;ll always
            get a clear breakdown of exactly what&apos;s included, no surprises.
          </p>
          <p style={{ margin: 0 }}>
            Questions about the documents or an invoice? Drop a message in Slack and we&apos;ll sort it for you.
          </p>
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} disabled={!canProceed} type="button">
          <span>{canProceed ? "Continue to kickoff call" : "Watch the video to continue"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
