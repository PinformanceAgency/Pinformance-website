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

type CreativeChoice = "" | "own_system" | "use_trello";

export default function StepPinterest({ onDone, config }: Props) {
  const simpleSubs: Sub[] = [
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
  ];

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [creativeChoice, setCreativeChoice] = useState<CreativeChoice>("");
  const [internalSystemName, setInternalSystemName] = useState("");

  const creativesResolved =
    (creativeChoice === "own_system" && internalSystemName.trim().length > 0) ||
    (creativeChoice === "use_trello" && checked["creatives_trello"] === true);

  const allChecked = simpleSubs.every((s) => checked[s.id]) && creativesResolved;
  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));

  return (
    <>
      <VideoEmbed
        url={config.videos.pinterestSetup}
        title="Pinterest setup overview"
        caption="Video · Full Pinterest setup walkthrough"
      />
      <p style={{ color: "#6b7075", fontSize: 14.5, lineHeight: 1.55, textAlign: "center", margin: "-24px auto 32px", maxWidth: 560 }}>
        Watch the full walkthrough first — it covers all four steps below. Then work through the checklist at your own pace.
      </p>

      {simpleSubs.map((s, i) => (
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

      {/* Sub 4 — Creative workflow with branching */}
      <div className="ob-card">
        <div className="ob-card-title">
          <button
            type="button"
            className="ob-check"
            data-checked={creativesResolved}
            aria-label="Creative workflow resolved"
            style={{ cursor: "default" }}
            tabIndex={-1}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <span style={{ flex: 1 }}>4. Your creative workflow</span>
        </div>

        <p className="ob-card-desc" style={{ marginLeft: 34, marginBottom: 16 }}>
          Do you use an internal creative system (for example <strong>Atria</strong>, <strong>ClickUp</strong>, or a similar
          platform where your creatives already live)?
        </p>

        <div style={{ marginLeft: 34, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* YES */}
          <label
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "14px 16px",
              border: `1px solid ${creativeChoice === "own_system" ? "#F0021A" : "#e0e2e5"}`,
              borderRadius: 12,
              cursor: "pointer",
              background: creativeChoice === "own_system" ? "rgba(240,2,26,0.03)" : "#fff",
              transition: "border-color .15s, background .15s",
            }}
          >
            <input
              type="radio"
              name="creative-choice"
              checked={creativeChoice === "own_system"}
              onChange={() => setCreativeChoice("own_system")}
              style={{ marginTop: 3, accentColor: "#F0021A", width: 16, height: 16 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                Yes — we use an internal creative system
              </div>
              <div style={{ color: "#6b7075", fontSize: 14, lineHeight: 1.5 }}>
                We'll work directly in <em>your</em> platform (Atria, ClickUp, or similar). You can skip Trello — no action needed on our board.
              </div>
            </div>
          </label>

          {/* NO */}
          <label
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "14px 16px",
              border: `1px solid ${creativeChoice === "use_trello" ? "#F0021A" : "#e0e2e5"}`,
              borderRadius: 12,
              cursor: "pointer",
              background: creativeChoice === "use_trello" ? "rgba(240,2,26,0.03)" : "#fff",
              transition: "border-color .15s, background .15s",
            }}
          >
            <input
              type="radio"
              name="creative-choice"
              checked={creativeChoice === "use_trello"}
              onChange={() => setCreativeChoice("use_trello")}
              style={{ marginTop: 3, accentColor: "#F0021A", width: 16, height: 16 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                No — we work with Google Drive links or don't have a dedicated system
              </div>
              <div style={{ color: "#6b7075", fontSize: 14, lineHeight: 1.5 }}>
                Then you'll use <strong>our Trello board</strong>. Drop your creatives in the right column so we always know exactly where to find them.
              </div>
            </div>
          </label>
        </div>

        {/* Follow-up: YES branch → ask which system, so we know where to work */}
        {creativeChoice === "own_system" && (
          <div style={{ marginLeft: 34, marginTop: 16 }}>
            <div className="ob-field" style={{ marginBottom: 0 }}>
              <label htmlFor="internal-system">Which platform do you use? *</label>
              <p className="ob-helper">So we know where to log in and find your creatives.</p>
              <input
                id="internal-system"
                type="text"
                value={internalSystemName}
                onChange={(e) => setInternalSystemName(e.target.value)}
                placeholder="e.g. Atria, ClickUp, Notion…"
              />
            </div>
          </div>
        )}

        {/* Follow-up: NO branch → Trello link + checkbox */}
        {creativeChoice === "use_trello" && (
          <div style={{ marginLeft: 34, marginTop: 16 }}>
            {config.links.trelloCreativesBoard ? (
              <>
                <a
                  href={config.links.trelloCreativesBoard}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ob-cta-secondary"
                  style={{ marginBottom: 14 }}
                >
                  Open our Trello board ↗
                </a>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    marginTop: 14,
                    padding: "14px 16px",
                    border: "1px solid #e0e2e5",
                    borderRadius: 12,
                  }}
                >
                  <button
                    type="button"
                    className="ob-check"
                    data-checked={checked["creatives_trello"] ?? false}
                    onClick={() => toggle("creatives_trello")}
                    aria-label="Confirm creatives uploaded to Trello"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <span style={{ fontSize: 14, color: "#111315", fontWeight: 500 }}>
                    I've uploaded my creatives to the Trello board
                  </span>
                </div>
              </>
            ) : (
              <div className="ob-warn">
                Trello board link not yet set. Set <code>links.trelloCreativesBoard</code> in <code>src/app/onboarding/config.ts</code>.
                <br />
                For now: your Trello board will be shared with you in Slack after the kickoff.
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="ob-check"
                    data-checked={checked["creatives_trello"] ?? false}
                    onClick={() => toggle("creatives_trello")}
                    style={{ display: "inline-grid", verticalAlign: "middle", marginRight: 8 }}
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <span style={{ fontSize: 14, verticalAlign: "middle" }}>Acknowledged — I'll wait for the Trello link in Slack</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} disabled={!allChecked} type="button">
          <span>{allChecked ? "Continue to admin" : "Complete all steps to continue"}</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
