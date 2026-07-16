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

interface Sub {
  id: string;
  title: string;
  desc: string;
  video: string;
  link?: { label: string; url: string };
}

export default function StepPinterest({ onDone, config }: Props) {
  const subs: Sub[] = [
    {
      id: "business",
      title: "Set up your Pinterest Business account",
      desc: "Create (or upgrade to) a Pinterest Business account. The video walks you through it step by step.",
      video: config.videos.pinterestBusiness,
      link: config.links.pinterestBusinessSignup
        ? { label: "Go to Pinterest Business", url: config.links.pinterestBusinessSignup }
        : undefined,
    },
    {
      id: "access",
      title: "Grant us access to your account",
      desc: "Add us as an admin in your Business Manager so we can build and optimize campaigns.",
      video: config.videos.pinterestAccess,
    },
    {
      id: "tracking",
      title: "Connect your tracking",
      desc: "Install the Pinterest Tag and connect conversion tracking so we optimize on real events.",
      video: config.videos.pinterestTracking,
    },
    {
      id: "creatives",
      title: "Upload your creatives in Trello",
      desc: config.links.trelloCreativesBoard
        ? "Go to the Trello board and drop your creatives in the right column."
        : "You'll be assigned a Trello board after intake — link follows in Slack.",
      video: "",
      link: config.links.trelloCreativesBoard
        ? { label: "Open Trello board", url: config.links.trelloCreativesBoard }
        : undefined,
    },
  ];

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = subs.every((s) => checked[s.id]);
  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));

  return (
    <>
      {config.videos.pinterestSetup && (
        <VideoEmbed url={config.videos.pinterestSetup} title="Pinterest setup overview" caption="Video 2 · Setup overview" />
      )}

      {subs.map((s, i) => (
        <div key={s.id} className="ob-card">
          <div className="ob-card-title">
            <button
              type="button"
              className="ob-check"
              data-checked={checked[s.id] ?? false}
              onClick={() => toggle(s.id)}
              aria-label={`Mark ${s.title} as done`}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <span style={{ flex: 1 }}>{i + 1}. {s.title}</span>
          </div>
          <p className="ob-card-desc" style={{ marginLeft: 34 }}>{s.desc}</p>
          {s.video && (
            <div style={{ marginTop: 14, marginLeft: 34 }}>
              <VideoEmbed url={s.video} title={s.title} />
            </div>
          )}
          {s.link && (
            <div style={{ marginTop: 14, marginLeft: 34 }}>
              <a href={s.link.url} target="_blank" rel="noopener noreferrer" className="ob-cta-secondary">
                {s.link.label} ↗
              </a>
            </div>
          )}
        </div>
      ))}

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} disabled={!allChecked} type="button">
          <span>{allChecked ? "Continue to admin" : "Check off all steps to continue"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
