interface Props {
  url: string;
  title?: string;
  caption?: string;
  /** Still frame shown before play. Optional; without it the browser shows
   *  the first frame once it has the metadata. */
  poster?: string;
}

/** Een bestand dat we zelf hosten tegenover een embed van een dienst.
 *  Een mp4 in een <iframe> werkt half: de browser zet er zijn eigen kale
 *  speler in, zonder poster, zonder preload-controle, en per browser anders. */
const isFile = (url: string): boolean =>
  /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);

export default function VideoEmbed({ url, title = "Onboarding video", caption, poster }: Props) {
  return (
    <div className="ob-video">
      {url ? (
        isFile(url) ? (
          // preload="metadata" is hier niet cosmetisch: de onboarding heeft
          // acht video's, en "auto" zou ze alle acht gaan binnenhalen zodra
          // iemand de pagina opent.
          <video
            src={url}
            title={title}
            poster={poster}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
          />
        ) : (
          <iframe
            src={url}
            title={title}
            allow="fullscreen; picture-in-picture"
            allowFullScreen
          />
        )
      ) : (
        <div className="ob-video-placeholder">
          <button type="button" className="ob-video-play-btn" aria-label="Video placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </button>
          <p className="ob-video-caption">
            {caption ?? "Video slot · paste the video URL in config.ts"}
          </p>
        </div>
      )}
    </div>
  );
}
