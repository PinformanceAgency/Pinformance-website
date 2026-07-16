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
      title: "Pinterest Business account opzetten",
      desc: "Maak (of upgrade naar) een Pinterest Business account. De video laat stap-voor-stap zien hoe je dat doet.",
      video: config.videos.pinterestBusiness,
      link: config.links.pinterestBusinessSignup
        ? { label: "Naar Pinterest Business", url: config.links.pinterestBusinessSignup }
        : undefined,
    },
    {
      id: "access",
      title: "Geef ons toegang tot je account",
      desc: "Voeg ons als admin toe in je Business Manager zodat wij campagnes kunnen bouwen en optimaliseren.",
      video: config.videos.pinterestAccess,
    },
    {
      id: "tracking",
      title: "Verbind je tracking",
      desc: "Installeer de Pinterest Tag en verbind conversion tracking, zodat we op echte events optimaliseren.",
      video: config.videos.pinterestTracking,
    },
    {
      id: "creatives",
      title: "Upload je creatives in Trello",
      desc: config.links.trelloCreativesBoard
        ? "Ga naar het Trello board en drop je creatives in de juiste kolom."
        : "Je krijgt een Trello board toegewezen na de intake — link volgt in Slack.",
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
              aria-label={`Markeer ${s.title} als klaar`}
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
          <span>{allChecked ? "Door naar administratie" : "Vink alle stappen af"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
