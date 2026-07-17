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

      {/* Message from the team */}
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
            We've got everything we need on our end, and you'll hear from us shortly to confirm your kick-off call.
          </p>
          <p style={{ margin: "0 0 14px" }}>
            If anything comes up in the meantime, you know where to find us — just drop a message in our Slack channel.
          </p>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Looking forward to working with you. Let's build something great together.
          </p>
        </div>
      </div>

      <p
        style={{
          textAlign: "center",
          fontSize: 17,
          fontWeight: 600,
          color: "#111315",
          margin: "8px auto 8px",
          maxWidth: 560,
        }}
      >
        We're looking forward to seeing you on the kick-off call.
      </p>

      <div className="ob-actions">
        <a href="https://pinformance-agency.com" className="ob-cta-secondary">
          Back to pinformance-agency.com
        </a>
      </div>
    </>
  );
}
