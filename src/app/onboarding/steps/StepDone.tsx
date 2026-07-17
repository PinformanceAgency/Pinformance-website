import VideoEmbed from "./VideoEmbed";
import type { OnboardingConfig } from "../config";

interface Props {
  config: OnboardingConfig;
}

export default function StepDone({ config }: Props) {
  return (
    <>
      {/* Celebration moment */}
      <div
        style={{
          textAlign: "center",
          padding: "8px 0 32px",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            margin: "0 auto 20px",
            borderRadius: "50%",
            background: "rgba(240,2,26,0.08)",
            color: "#F0021A",
            display: "grid",
            placeItems: "center",
          }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#111315", margin: 0 }}>
          🎉 Onboarding complete
        </p>
      </div>

      <VideoEmbed url={config.videos.thanks} title="Welcome on board" caption="Video · A quick word from Tristan" />

      {/* Personal message */}
      <div
        className="ob-card"
        style={{
          background: "#faf9f6",
          border: "1px solid #f0f0f1",
          padding: "28px 30px",
        }}
      >
        <div style={{ color: "#111315", fontSize: 15.5, lineHeight: 1.7 }}>
          <p style={{ margin: "0 0 14px" }}>
            We've got everything we need on our end, and you'll hear from me shortly to confirm your kick-off call.
          </p>
          <p style={{ margin: "0 0 14px" }}>
            If anything comes up in the meantime, you know where to find me — just drop a message in our Slack channel.
          </p>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Looking forward to working with you. Let's build something great together.
          </p>
        </div>

        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid #f0f0f1",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "#111315",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.04em",
            }}
            aria-hidden
          >
            T
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#111315" }}>Tristan</div>
            <div style={{ fontSize: 12.5, color: "#8a8e93" }}>Project Manager · Pinformance</div>
          </div>
        </div>
      </div>

      {/* What's next */}
      <div className="ob-card">
        <div className="ob-card-title">
          <span style={{ flex: 1 }}>What happens next</span>
        </div>
        <ul style={{ margin: "8px 0 0 20px", color: "#6b7075", fontSize: 14.5, lineHeight: 1.7 }}>
          <li>Your custom NDA and Service Agreement will land in your inbox</li>
          <li>Your media buyer starts reviewing your account and creatives</li>
          <li>On the kickoff we go through the docs, sign live, and align on your break-even + target ROAS</li>
          <li>We lock the gameplan for your first 30 days</li>
          <li>Ideally we're live within 24 hours after the kickoff</li>
        </ul>
      </div>

      <div className="ob-actions">
        <a href="https://pinformance-agency.com" className="ob-cta-secondary">
          Back to pinformance-agency.com
        </a>
      </div>
    </>
  );
}
