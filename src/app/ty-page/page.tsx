import fs from "node:fs";
import path from "node:path";
import Image from "next/image";

// ============================================================
//  CONFIG — Edit these values
// ============================================================
const INSTAGRAM_URL = "https://www.instagram.com/rensvanderzwart/";
const INBOX_LINE =
  "Check your inbox for the confirmation and calendar invite.";
// ============================================================

const BRAND = {
  red: "#F0021A",
  redDark: "#c80216",
  ink: "#111315",
  bgSoft: "#F5F5F5",
  muted: "#6b7075",
  border: "#ececec",
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

function getResultImages(): string[] {
  try {
    const dir = path.join(process.cwd(), "public", "ty-page", "results");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );
  } catch {
    return [];
  }
}

export const dynamic = "force-static";

export default function TyPage() {
  const images = getResultImages();

  return (
    <div
      style={{
        fontFamily:
          "Inter, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        color: BRAND.ink,
        background: "#fff",
        minHeight: "100vh",
      }}
    >
      {/* Inter font */}
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin=""
      />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      <style>{`
        .ty-container { width: 100%; max-width: 1080px; margin: 0 auto; padding: 0 20px; }
        .ty-hero-title { font-size: clamp(28px, 6.5vw, 48px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
        .ty-section-title { font-size: clamp(24px, 4.4vw, 34px); font-weight: 800; letter-spacing: -0.02em; }
        .ty-stat-value { font-size: clamp(22px, 4.8vw, 32px); font-weight: 800; letter-spacing: -0.02em; }
        .ty-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .ty-case-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .ty-case-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(17,19,21,0.08); }
        .ty-ig-card { display: flex; flex-direction: column; gap: 18px; align-items: flex-start; }
        .ty-btn-primary:hover { background: ${BRAND.redDark}; transform: translateY(-1px); }
        .ty-scroll-cue:hover { background: #000; }
        @media (min-width: 720px) {
          .ty-case-grid { grid-template-columns: repeat(3, 1fr); gap: 18px; }
          .ty-ig-card { flex-direction: row; align-items: center; justify-content: space-between; padding: 32px 36px !important; }
        }
      `}</style>

      {/* HEADER */}
      <header
        style={{
          padding: "20px 0",
          borderBottom: `1px solid ${BRAND.border}`,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "saturate(180%) blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div className="ty-container" style={{ display: "flex", alignItems: "center" }}>
          <a
            href="https://pinformance-agency.com"
            aria-label="Pinformance Agency"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ty-page/logo.svg"
              alt="Pinformance"
              style={{ height: 28, width: "auto", display: "block" }}
            />
          </a>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section style={{ padding: "64px 0 48px", textAlign: "center" }}>
          <div className="ty-container">
            <div
              aria-hidden
              style={{
                width: 56,
                height: 56,
                margin: "0 auto 20px",
                borderRadius: "50%",
                background: "rgba(240,2,26,0.08)",
                color: BRAND.red,
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="ty-hero-title" style={{ margin: "0 0 18px" }}>
              You&apos;re booked.
              <br />
              <span style={{ color: BRAND.red }}>
                Your roadmap call is confirmed.
              </span>
            </h1>
            <p
              style={{
                fontSize: "clamp(15px, 2.4vw, 18px)",
                color: BRAND.muted,
                maxWidth: 620,
                margin: "0 auto 28px",
              }}
            >
              {INBOX_LINE} While you&apos;re here — scroll down to see what
              we&apos;ve been doing for brands like yours.
            </p>
            <a
              href="#results"
              className="ty-scroll-cue"
              style={{
                display: "inline-block",
                padding: "12px 22px",
                borderRadius: 999,
                background: BRAND.ink,
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                transition: "background .15s ease, transform .15s ease",
              }}
            >
              See results ↓
            </a>
          </div>
        </section>

        {/* STATS */}
        <section style={{ padding: "28px 0 8px" }}>
          <div className="ty-container">
            <div className="ty-stats-grid">
              {[
                { v: "€16M+", l: "Revenue Generated" },
                { v: "50+", l: "Brands Scaled" },
                { v: "5+ yrs", l: "Pinterest Expertise" },
              ].map((s) => (
                <div
                  key={s.l}
                  style={{
                    background: BRAND.bgSoft,
                    borderRadius: 16,
                    padding: "22px 16px",
                    textAlign: "center",
                  }}
                >
                  <div className="ty-stat-value">{s.v}</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: BRAND.muted,
                      marginTop: 4,
                      fontWeight: 500,
                    }}
                  >
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CASES */}
        <section id="results" style={{ padding: "64px 0 24px" }}>
          <div className="ty-container">
            <h2
              className="ty-section-title"
              style={{ margin: "0 0 6px", textAlign: "center" }}
            >
              Recent wins
            </h2>
            <p
              style={{
                textAlign: "center",
                color: BRAND.muted,
                margin: "0 0 32px",
                fontSize: 15,
              }}
            >
              Three brands we&apos;ve scaled on Pinterest — real numbers, real
              accounts.
            </p>

            <div className="ty-case-grid">
              {[
                {
                  name: "Celestia",
                  desc: "From €0 to €4,000+ daily revenue within one month.",
                  stats: [
                    ["+€354k", "Revenue"],
                    ["2.55", "ROAS"],
                    ["€29.48", "CPA"],
                  ],
                },
                {
                  name: "Fit Cherries",
                  desc: "Restructured a stuck account, scaled to $3K+/day at a lower CPA than any other platform.",
                  stats: [
                    ["+€270k", "Revenue"],
                    ["2.2", "ROAS"],
                    ["€35", "CPA"],
                  ],
                },
                {
                  name: "May Cosmetics",
                  desc: "Full-funnel build for a brand new to Pinterest.",
                  stats: [
                    ["+€288k", "Revenue"],
                    ["2.48", "ROAS"],
                    ["€16", "CPA"],
                  ],
                },
              ].map((c) => (
                <article
                  key={c.name}
                  className="ty-case-card"
                  style={{
                    background: "#fff",
                    border: `1px solid ${BRAND.border}`,
                    borderRadius: 16,
                    padding: 22,
                    boxShadow:
                      "0 1px 2px rgba(17,19,21,0.04), 0 4px 12px rgba(17,19,21,0.04)",
                    transition: "transform .18s ease, box-shadow .18s ease",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 18,
                      marginBottom: 6,
                    }}
                  >
                    {c.name}
                  </div>
                  <p
                    style={{
                      color: BRAND.muted,
                      fontSize: 14.5,
                      margin: "0 0 16px",
                    }}
                  >
                    {c.desc}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 10,
                      paddingTop: 14,
                      borderTop: `1px solid ${BRAND.border}`,
                    }}
                  >
                    {c.stats.map(([v, l]) => (
                      <div
                        key={l}
                        style={{ display: "flex", flexDirection: "column" }}
                      >
                        <strong
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: BRAND.red,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {v}
                        </strong>
                        <span
                          style={{
                            fontSize: 12,
                            color: BRAND.muted,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginTop: 2,
                          }}
                        >
                          {l}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* GALLERY */}
        <section style={{ padding: "56px 0", background: BRAND.bgSoft }}>
          <div className="ty-container">
            <h2
              className="ty-section-title"
              style={{ margin: "0 0 6px", textAlign: "center" }}
            >
              Inside the accounts
            </h2>
            <p
              style={{
                textAlign: "center",
                color: BRAND.muted,
                margin: "0 0 32px",
                fontSize: 15,
              }}
            >
              Screenshots from real client dashboards.
            </p>

            {images.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: BRAND.muted,
                  padding: "32px 0",
                  fontSize: 14,
                }}
              >
                Drop your screenshots in{" "}
                <code
                  style={{
                    background: "#fff",
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: `1px solid ${BRAND.border}`,
                  }}
                >
                  /public/ty-page/results/
                </code>{" "}
                and redeploy.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                  maxWidth: 760,
                  margin: "0 auto",
                }}
              >
                {images.map((file, i) => (
                  <Image
                    key={file}
                    src={`/ty-page/results/${file}`}
                    alt={`Pinformance client result ${i + 1}`}
                    width={1500}
                    height={1000}
                    sizes="(max-width: 760px) 100vw, 760px"
                    style={{
                      width: "100%",
                      height: "auto",
                      borderRadius: 10,
                      boxShadow:
                        "0 1px 2px rgba(17,19,21,0.04), 0 4px 12px rgba(17,19,21,0.04)",
                      background: "#fff",
                    }}
                    priority={i < 2}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* TESTIMONIAL */}
        <section style={{ padding: "56px 0", textAlign: "center" }}>
          <div className="ty-container">
            <blockquote
              style={{
                margin: "0 auto",
                maxWidth: 700,
                fontSize: "clamp(18px, 3vw, 22px)",
                fontWeight: 500,
                lineHeight: 1.45,
                fontStyle: "italic",
              }}
            >
              &ldquo;Omnichannel without Pinterest is incomplete. Pinformance
              fixed that for us.&rdquo;
              <cite
                style={{
                  display: "block",
                  marginTop: 14,
                  fontStyle: "normal",
                  fontSize: 14,
                  color: BRAND.muted,
                  fontWeight: 600,
                }}
              >
                — Kain Kolenbrander, Founder, May Cosmetics
              </cite>
            </blockquote>
          </div>
        </section>

        {/* IG CTA */}
        <section style={{ padding: "24px 0 72px" }}>
          <div className="ty-container">
            <div
              className="ty-ig-card"
              style={{
                background: BRAND.ink,
                color: "#fff",
                borderRadius: 16,
                padding: 28,
                boxShadow: "0 8px 24px rgba(17,19,21,0.08)",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: BRAND.red,
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  Before our call
                </div>
                <h3
                  style={{
                    margin: "0 0 6px",
                    fontSize: "clamp(20px, 3.4vw, 26px)",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Get to know us on Instagram
                </h3>
                <p style={{ margin: 0, color: "#bfc3c7", fontSize: 14.5 }}>
                  Daily Pinterest strategy, behind-the-scenes, and client wins.
                </p>
              </div>
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ty-btn-primary"
                style={{
                  display: "inline-block",
                  padding: "14px 24px",
                  borderRadius: 999,
                  background: BRAND.red,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: "none",
                  transition: "background .15s ease, transform .15s ease",
                }}
              >
                Follow on Instagram
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer
        style={{
          padding: "32px 0",
          borderTop: `1px solid ${BRAND.border}`,
          background: "#fff",
        }}
      >
        <div
          className="ty-container"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            textAlign: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ty-page/logo.svg"
            alt="Pinformance"
            style={{ height: 24, opacity: 0.85 }}
          />
          <p style={{ color: BRAND.muted, fontSize: 13, margin: 0 }}>
            © 2026 Pinformance Agency. We win when you win.
          </p>
        </div>
      </footer>
    </div>
  );
}
