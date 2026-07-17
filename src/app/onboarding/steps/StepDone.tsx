import VideoEmbed from "./VideoEmbed";
import type { OnboardingConfig } from "../config";

interface Props {
  config: OnboardingConfig;
}

export default function StepDone({ config }: Props) {
  return (
    <>
      <style>{`
        .ob-done-eyebrow {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #F0021A;
          font-weight: 700;
        }
        .ob-done-ornament {
          display: flex; align-items: center; gap: 14px;
          color: rgba(255,255,255,0.35);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          margin: 0 auto 24px;
          justify-content: center;
          font-weight: 600;
        }
        .ob-done-ornament::before, .ob-done-ornament::after {
          content: "";
          flex: 1; max-width: 60px;
          height: 1px;
          background: rgba(255,255,255,0.2);
        }
        .ob-done-hero {
          background: linear-gradient(180deg, #111315 0%, #0a0b0d 100%);
          color: #fff;
          border-radius: 24px;
          padding: 56px 40px;
          position: relative;
          overflow: hidden;
          text-align: center;
          box-shadow: 0 20px 60px -20px rgba(17,19,21,0.35);
        }
        .ob-done-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 15% 20%, rgba(240,2,26,0.18), transparent 45%),
            radial-gradient(circle at 85% 90%, rgba(240,2,26,0.10), transparent 45%);
          pointer-events: none;
        }
        .ob-done-hero-inner { position: relative; }
        .ob-done-quote {
          font-size: clamp(24px, 3.8vw, 36px);
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 28px;
          max-width: 640px;
          margin-left: auto; margin-right: auto;
        }
        .ob-done-quote .accent { color: #F0021A; }
        .ob-done-body { color: rgba(255,255,255,0.72); font-size: 15.5px; line-height: 1.7; max-width: 520px; margin: 0 auto 32px; text-align: left; }
        .ob-done-body p { margin: 0 0 12px; }
        .ob-done-signature {
          display: inline-flex; align-items: center; gap: 12px;
          padding: 10px 20px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .ob-done-signature-name {
          font-weight: 700;
          font-size: 13px;
          color: #fff;
          letter-spacing: 0.02em;
        }
        .ob-done-signature-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #F0021A;
        }
        .ob-done-signature-tag {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
          font-weight: 600;
        }

        .ob-done-check-badge {
          width: 88px; height: 88px;
          margin: 0 auto 22px;
          border-radius: 50%;
          background: rgba(240,2,26,0.08);
          color: #F0021A;
          display: grid; place-items: center;
          position: relative;
        }
        .ob-done-check-badge::before {
          content: "";
          position: absolute; inset: -6px;
          border-radius: 50%;
          border: 1px solid rgba(240,2,26,0.15);
        }

        .ob-done-tagline-card {
          background: #faf9f6;
          border: 1px solid #f0f0f1;
          border-radius: 20px;
          padding: 36px 32px;
          text-align: center;
          margin-top: 20px;
        }
        .ob-done-tagline {
          font-weight: 700;
          color: #111315;
          font-size: clamp(20px, 3vw, 26px);
          margin: 0;
          line-height: 1.3;
          letter-spacing: -0.015em;
        }
        .ob-done-tagline .accent { color: #F0021A; }

        .ob-done-brandmark {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid #f0f0f1;
        }
        .ob-done-brandmark-name {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #111315;
          font-weight: 700;
        }
        .ob-done-brandmark-tag {
          color: #8a8e93;
          font-size: 13.5px;
          font-weight: 500;
        }
        .ob-done-brandmark-tag .accent { color: #F0021A; font-weight: 700; }
      `}</style>

      {/* Celebration moment */}
      <div style={{ textAlign: "center", padding: "8px 0 20px" }}>
        <div className="ob-done-check-badge" aria-hidden>
          <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="ob-done-eyebrow" style={{ marginBottom: 10 }}>
          Onboarding complete
        </div>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#111315", margin: 0, letterSpacing: "-0.015em" }}>
          You&apos;re all set.
        </p>
      </div>

      <VideoEmbed url={config.videos.thanks} title="Welcome on board" caption="Video · A quick word from Tristan" />

      {/* Signature message — dark premium block */}
      <div className="ob-done-hero">
        <div className="ob-done-hero-inner">
          <div className="ob-done-ornament">Signed off</div>

          <p className="ob-done-quote">
            Looking forward to working with you.
            <br />
            <span className="accent">Let&apos;s build something great together.</span>
          </p>

          <div className="ob-done-body">
            <p>
              We&apos;ve got everything we need on our end, and you&apos;ll hear from us shortly to
              confirm your kick-off call.
            </p>
            <p>
              If anything comes up in the meantime, you know where to find us — just drop a message
              in our Slack channel.
            </p>
          </div>

          <div className="ob-done-signature">
            <span className="ob-done-signature-tag">Team</span>
            <span className="ob-done-signature-dot" />
            <span className="ob-done-signature-name">Pinformance Agency</span>
          </div>
        </div>
      </div>

      {/* Closing tagline — light off-white card for color contrast */}
      <div className="ob-done-tagline-card">
        <p className="ob-done-tagline">
          We&apos;re looking forward to seeing you on the <span className="accent">kick-off call</span>.
        </p>
      </div>

      {/* Brandmark */}
      <div className="ob-done-brandmark">
        <div className="ob-done-brandmark-name">Pinformance · Agency</div>
        <div className="ob-done-brandmark-tag">
          We win <span className="accent">when you win</span>.
        </div>
      </div>

      <div className="ob-actions">
        <a href="https://pinformance-agency.com" className="ob-cta-secondary">
          Back to pinformance-agency.com
        </a>
      </div>
    </>
  );
}
