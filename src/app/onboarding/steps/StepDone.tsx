import VideoEmbed from "./VideoEmbed";
import type { OnboardingConfig } from "../config";

interface Props {
  config: OnboardingConfig;
}

export default function StepDone({ config }: Props) {
  return (
    <>
      <VideoEmbed url={config.videos.thanks} title="Welcome on board" caption="Video · What happens next" />

      <div className="ob-card">
        <div className="ob-card-title">🎉 All set</div>
        <p className="ob-card-desc">
          Thanks for completing the onboarding. Our team gets straight to work on your account setup.
          On the kickoff we'll walk through where things stand, sharpen your goals, and launch the first campaign.
        </p>
      </div>

      <div className="ob-card">
        <div className="ob-card-title">What happens next</div>
        <ul style={{ margin: "8px 0 0 20px", color: "#6b7075", fontSize: 14.5, lineHeight: 1.7 }}>
          <li>Your media buyer reviews your account and creatives</li>
          <li>On the kickoff we align on your break-even and target ROAS</li>
          <li>We lock the gameplan for your first 30 days</li>
          <li>Ideally we're live within 24 hours after the kickoff</li>
        </ul>
      </div>

      <div className="ob-actions">
        <a href="https://pinformance-agency.com" className="ob-cta-secondary">
          Back to the site
        </a>
      </div>
    </>
  );
}
