interface Props {
  url: string;
  title?: string;
}

/**
 * Renders a Loom embed (or any iframe embed URL).
 * Falls back to a friendly placeholder if the URL is empty.
 */
export default function VideoEmbed({ url, title = "Onboarding video" }: Props) {
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
          Video-slot — plak de Loom-embed URL in <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, border: "1px solid #ececec" }}>src/app/onboarding/config.ts</code>
        </div>
      )}
    </div>
  );
}
