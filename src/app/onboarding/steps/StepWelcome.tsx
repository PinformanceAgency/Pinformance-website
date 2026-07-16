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

export default function StepWelcome({ onDone, config }: Props) {
  return (
    <>
      <VideoEmbed url={config.videos.welcome} title="Welkom bij Pinformance" caption="Video 1 · Tristan's intro" />

      <div className="ob-team">
        <div className="ob-team-card">
          <div className="ob-team-role">Project Manager</div>
          <p className="ob-team-name">{config.team.pm.name}</p>
          <p className="ob-team-desc">
            Overziet de samenwerking, houdt de planning strak en springt in als het nodig is. Aanspreekpunt voor scope, planning en alles buiten de dagelijkse campagne-executie.
          </p>
        </div>
        <div className="ob-team-card">
          <div className="ob-team-role">Media Buyer</div>
          <p className="ob-team-name">Jouw persoonlijke media buyer</p>
          <p className="ob-team-desc">
            {config.team.mediaBuyerNote} Dagelijks in je account: audiences, creatives, optimalisaties en weekly updates.
          </p>
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} type="button">
          <span>Door naar stap 2</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
