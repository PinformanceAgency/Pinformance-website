import VideoEmbed from "./VideoEmbed";
import type { OnboardingConfig } from "../config";

interface Props {
  onDone: () => void;
  config: OnboardingConfig;
}

export default function StepWelcome({ onDone, config }: Props) {
  return (
    <div>
      <VideoEmbed url={config.videos.welcome} title="Welkom bij Pinformance" />

      <div className="ob-team">
        <div className="ob-team-card">
          <div className="ob-team-role">Project Manager</div>
          <p className="ob-team-name">{config.team.pm.name}</p>
          <p className="ob-team-desc">
            Overziet de samenwerking, houdt de planning strak en springt in als het nodig is.
            Aanspreekpunt voor scope, planning en alles buiten de dagelijkse campagne-executie.
          </p>
        </div>
        <div className="ob-team-card">
          <div className="ob-team-role">Media Buyer</div>
          <p className="ob-team-name">Jouw persoonlijke media buyer</p>
          <p className="ob-team-desc">
            {config.team.mediaBuyerNote} Dagelijks in je account: audiences, creatives,
            optimalisaties, weekly updates.
          </p>
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onDone}>
          Ik heb de intro bekeken — laten we starten →
        </button>
      </div>
    </div>
  );
}
