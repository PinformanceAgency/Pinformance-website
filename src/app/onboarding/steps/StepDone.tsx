import VideoEmbed from "./VideoEmbed";
import type { OnboardingConfig } from "../config";

interface Props {
  config: OnboardingConfig;
}

export default function StepDone({ config }: Props) {
  return (
    <>
      <VideoEmbed url={config.videos.thanks} title="Welkom aan boord" caption="Video · Wat er nu gebeurt" />

      <div className="ob-card">
        <div className="ob-card-title">🎉 Alles staat</div>
        <p className="ob-card-desc">
          Bedankt voor het doorlopen van de onboarding. Ons team gaat direct aan de slag met je account-setup.
          Op de kickoff nemen we samen door hoe alles ervoor staat, stellen we je doelen scherp en zetten we de eerste campagne live.
        </p>
      </div>

      <div className="ob-card">
        <div className="ob-card-title">Wat er nu gebeurt</div>
        <ul style={{ margin: "8px 0 0 20px", color: "#6b7075", fontSize: 14.5, lineHeight: 1.7 }}>
          <li>Je media buyer neemt je account en creatives door</li>
          <li>Op de kickoff bespreken we je break-even en target ROAS</li>
          <li>We lockeren het gameplan voor je eerste 30 dagen</li>
          <li>Idealiter zijn we binnen 24 uur na de kickoff live</li>
        </ul>
      </div>

      <div className="ob-actions">
        <a href="https://pinformance-agency.com" className="ob-cta-secondary">
          Terug naar de site
        </a>
      </div>
    </>
  );
}
