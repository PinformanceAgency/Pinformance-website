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
      <VideoEmbed url={config.videos.welcome} title="Welcome to Pinformance" caption="Video 1 · Tristan's intro" />

      <div className="ob-actions">
        <button className="ob-cta" onClick={onDone} type="button">
          <span>Continue to step 2</span>
          <ArrowIcon />
        </button>
      </div>
    </>
  );
}
