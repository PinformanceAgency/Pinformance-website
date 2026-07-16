"use client";

import { useState } from "react";
import VideoEmbed from "./VideoEmbed";
import type { OnboardingConfig } from "../config";

interface Props {
  onDone: () => void;
  config: OnboardingConfig;
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
      desc: "Maak (of upgrade naar) een Pinterest Business account. In de video zie je stap-voor-stap hoe je dat doet.",
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
      desc: "Installeer de Pinterest Tag en verbind conversion tracking, zodat we optimaliseren op echte events.",
      video: config.videos.pinterestTracking,
    },
    {
      id: "creatives",
      title: "Upload je creatives in Trello",
      desc: config.links.trelloCreativesBoard
        ? "Ga naar het Trello board en drop je creatives in de juiste kolom. Meer instructies staan op het board zelf."
        : "Je krijgt een Trello board toegewezen na de intake — daar upload je je creatives. Link volgt in Slack.",
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
    <div>
      {config.videos.pinterestSetup && (
        <VideoEmbed url={config.videos.pinterestSetup} title="Pinterest setup overview" />
      )}

      {subs.map((s) => (
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
            {s.title}
          </div>
          <p className="ob-card-desc" style={{ marginLeft: 32 }}>{s.desc}</p>
          {s.video && (
            <div style={{ marginTop: 14, marginLeft: 32 }}>
              <VideoEmbed url={s.video} title={s.title} />
            </div>
          )}
          {s.link && (
            <div style={{ marginTop: 14, marginLeft: 32 }}>
              <a href={s.link.url} target="_blank" rel="noopener noreferrer" className="ob-btn ob-btn-ghost">
                {s.link.label} ↗
              </a>
            </div>
          )}
        </div>
      ))}

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onDone} disabled={!allChecked}>
          {allChecked ? "Verder naar administratie →" : "Vink alle stappen af om verder te gaan"}
        </button>
      </div>
    </div>
  );
}
