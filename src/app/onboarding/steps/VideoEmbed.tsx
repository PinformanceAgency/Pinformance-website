interface Props {
  url: string;
  title?: string;
  caption?: string;
}

export default function VideoEmbed({ url, title = "Onboarding video", caption }: Props) {
  return (
    <div className="ob-video">
      {url ? (
        <iframe
          src={url}
          title={title}
          allow="fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="ob-video-placeholder">
          <button type="button" className="ob-video-play-btn" aria-label="Video placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </button>
          <p className="ob-video-caption">
            {caption ?? "Video slot · paste Loom embed URL in config.ts"}
          </p>
        </div>
      )}
    </div>
  );
}
