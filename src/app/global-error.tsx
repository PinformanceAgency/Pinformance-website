"use client";

/**
 * The boundary of last resort.
 *
 * `src/app/organic/error.tsx` catches a throw inside the organic segment's
 * pages, and it is what makes most failures legible. What it cannot catch —
 * by design, in Next — is a throw in the LAYOUT of its own segment. And
 * `src/app/organic/layout.tsx` is not a passive shell: it loads the client
 * sidebar, which reads the database. So on a day the pooler refuses
 * connections, the page's own boundary never runs and what a media buyer
 * gets is Next's bare "Application error: a client-side exception has
 * occurred" — a white screen with no reference, no explanation and no way
 * back except reloading, sometimes twice.
 *
 * That is the shape of every "the screen goes white" report this app has
 * had, and the segment boundary added on 04-09-2026 only covered half of
 * it. This covers the other half, for every hostname in the repo — the
 * dashboard, organic, onboarding, the calculator.
 *
 * It replaces the whole document, so it carries its own <html> and <body>
 * and cannot use the app's fonts or Tailwind: this file must render when
 * everything else has already failed. Inline styles only, no imports, no
 * data. The digest is the point — it is what ties a report from the team to
 * a line in the Vercel logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#fafafa", color: "#171717" }}>
        <div style={{ maxWidth: 560, margin: "12vh auto", padding: "0 24px" }}>
          <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 10, padding: 20 }}>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#991b1b" }}>
              This page could not be loaded
            </h1>
            <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "#7f1d1d" }}>
              Nothing you typed has been sent anywhere and nothing was saved. This is
              almost always the database being briefly unreachable — try again in a
              moment. If it keeps happening, pass on the reference below, which points
              straight at the failure in the logs.
            </p>
            {error.digest && (
              <p style={{ margin: "12px 0 0", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#b91c1c" }}>
                reference: {error.digest}
              </p>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={reset}
                style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: "#171717", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Reload the page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
