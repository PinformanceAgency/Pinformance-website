import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import StatsCounter from "./StatsCounter";
import ResultsCarousel from "./ResultsCarousel";
import ReviewsCarousel from "./ReviewsCarousel";

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

const CASES = [
  {
    name: "Celestia",
    img: "/ty-page/cases/celestia.png",
    desc: "We managed to grow the brand from €0 to over €4,000 daily revenue within one month. By implementing a clear Pinterest media buying strategy, we made Pinterest the best-performing platform for them.",
    stats: [
      ["+€354k", "Revenue"],
      ["2.55", "ROAS"],
      ["€29,48", "CPA"],
    ] as const,
  },
  {
    name: "Fit Cherries",
    img: "/ty-page/cases/fit-cherries.png",
    desc: "The brand owner was managing Pinterest themselves and stuck at $200 per day. We restructured the account and scaled it to $3K+ per day with a lower CPA than any other platform.",
    stats: [
      ["+€270k", "Revenue"],
      ["2.2", "ROAS"],
      ["€35", "CPA"],
    ] as const,
  },
  {
    name: "May Cosmetics",
    img: "/ty-page/cases/may-cosmetics.png",
    desc: "The brand wasn't yet on Pinterest, despite a strong fit with the audience's buying intent. We built a full-funnel structure mixing conversion, catalog, and consideration campaigns to keep CPA low.",
    stats: [
      ["+€288k", "Revenue"],
      ["2.48", "ROAS"],
      ["€16", "CPA"],
    ] as const,
  },
];

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
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />

      <style>{`
        .ty-container { width: 100%; max-width: 1180px; margin: 0 auto; padding: 0 20px; }
        .ty-hero-title { font-size: clamp(30px, 7vw, 56px); font-weight: 800; letter-spacing: -0.025em; line-height: 1.05; }
        .ty-section-eyebrow { font-size: 13px; font-weight: 600; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: 0.1em; }
        .ty-section-title { font-size: clamp(28px, 5vw, 44px); font-weight: 800; letter-spacing: -0.025em; line-height: 1.1; }
        .ty-stat-num { font-size: clamp(48px, 9vw, 96px); font-weight: 800; letter-spacing: -0.04em; line-height: 1; color: #fff; }
        .ty-stat-label { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 500; }

        .ty-stats-grid { display: grid; grid-template-columns: 1fr; gap: 28px; }
        @media (min-width: 720px) { .ty-stats-grid { grid-template-columns: repeat(3, 1fr); gap: 32px; } }

        .ty-case-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
        @media (min-width: 980px) { .ty-case-grid { grid-template-columns: repeat(3, 1fr); gap: 24px; } }

        .ty-case-card { background: #fff; border: 1px solid ${BRAND.border}; border-radius: 20px; overflow: hidden; box-shadow: 0 1px 2px rgba(17,19,21,0.04), 0 4px 16px rgba(17,19,21,0.05); transition: transform .2s ease, box-shadow .2s ease; }
        .ty-case-card:hover { transform: translateY(-4px); box-shadow: 0 8px 32px rgba(17,19,21,0.1); }

        .ty-ig-card { display: flex; flex-direction: column; gap: 18px; align-items: flex-start; }
        @media (min-width: 720px) { .ty-ig-card { flex-direction: row; align-items: center; justify-content: space-between; padding: 36px 40px !important; } }

        .ty-btn-primary:hover { background: ${BRAND.redDark}; transform: translateY(-1px); }
        .ty-scroll-cue:hover { background: #000; }
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
          <a href="https://pinformance-agency.com" aria-label="Pinformance Agency">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ty-page/logo-dark.svg" alt="Pinformance" style={{ height: 28, width: "auto", display: "block" }} />
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
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="ty-hero-title" style={{ margin: "0 0 18px" }}>
              You&apos;re booked.
              <br />
              <span style={{ color: BRAND.red }}>Your roadmap call is confirmed.</span>
            </h1>
            <p
              style={{
                fontSize: "clamp(15px, 2.4vw, 18px)",
                color: BRAND.muted,
                maxWidth: 620,
                margin: "0 auto 28px",
              }}
            >
              {INBOX_LINE} While you&apos;re here — scroll down to see what we&apos;ve been doing for brands like yours.
            </p>
            <a
              href="#cases"
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

        {/* STATS METER — animated counters, dark bar matching live site */}
        <section style={{ background: BRAND.ink, padding: "72px 0" }}>
          <div className="ty-container">
            <div className="ty-stats-grid">
              <StatsCounter target={23} suffix="M+" label="Revenue generated by our Pinterest campaigns" />
              <StatsCounter target={900} suffix="k+" label="Monthly Adspend" />
              <StatsCounter target={55} suffix="+" label="Successful collaboration with Brandowners" />
            </div>
          </div>
        </section>

        {/* CASE STUDIES — matching live site layout */}
        <section id="cases" style={{ padding: "96px 0 72px" }}>
          <div className="ty-container">
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div className="ty-section-eyebrow" style={{ marginBottom: 12 }}>Case studies</div>
              <h2 className="ty-section-title" style={{ margin: 0 }}>
                Real results from <span style={{ color: BRAND.red }}>Real Clients</span>
              </h2>
            </div>

            <div className="ty-case-grid">
              {CASES.map((c) => (
                <article key={c.name} className="ty-case-card">
                  <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: BRAND.bgSoft }}>
                    <Image
                      src={c.img}
                      alt={c.name}
                      fill
                      sizes="(max-width: 980px) 100vw, 380px"
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                  <div style={{ padding: 24 }}>
                    <h3
                      style={{
                        margin: "0 0 10px",
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: "-0.015em",
                      }}
                    >
                      {c.name}
                    </h3>
                    <p
                      style={{
                        margin: "0 0 22px",
                        color: BRAND.muted,
                        fontSize: 14.5,
                        lineHeight: 1.55,
                      }}
                    >
                      {c.desc}
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 12,
                        paddingTop: 18,
                        borderTop: `1px solid ${BRAND.border}`,
                      }}
                    >
                      {c.stats.map(([v, l]) => (
                        <div key={l} style={{ display: "flex", flexDirection: "column" }}>
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
                              fontSize: 11,
                              color: BRAND.muted,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              marginTop: 4,
                              fontWeight: 600,
                            }}
                          >
                            {l}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* GALLERY */}
        <section style={{ padding: "72px 0", background: BRAND.bgSoft }}>
          <div className="ty-container">
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div className="ty-section-eyebrow" style={{ marginBottom: 12 }}>Proof</div>
              <h2 className="ty-section-title" style={{ margin: "0 0 8px" }}>
                Inside the <span style={{ color: BRAND.red }}>accounts</span>
              </h2>
              <p style={{ color: BRAND.muted, margin: 0, fontSize: 15 }}>
                Screenshots from real client dashboards.
              </p>
            </div>

            {images.length === 0 ? (
              <div style={{ textAlign: "center", color: BRAND.muted, padding: "32px 0", fontSize: 14 }}>
                Drop your screenshots in{" "}
                <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, border: `1px solid ${BRAND.border}` }}>
                  /public/ty-page/results/
                </code>{" "}
                and redeploy.
              </div>
            ) : (
              <ResultsCarousel images={images} />
            )}
          </div>
        </section>

        {/* REVIEWS */}
        <section style={{ padding: "96px 0", background: BRAND.ink }}>
          <div className="ty-container">
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div
                className="ty-section-eyebrow"
                style={{ marginBottom: 12, color: "rgba(255,255,255,0.55)" }}
              >
                Reviews
              </div>
              <h2
                className="ty-section-title"
                style={{ margin: 0, color: "#fff" }}
              >
                What brand owners <span style={{ color: BRAND.red }}>say about us</span>
              </h2>
            </div>
            <ReviewsCarousel />
          </div>
        </section>

        {/* IG CTA */}
        <section style={{ padding: "24px 0 96px" }}>
          <div className="ty-container">
            <div
              className="ty-ig-card"
              style={{
                background: BRAND.ink,
                color: "#fff",
                borderRadius: 20,
                padding: 32,
                boxShadow: "0 8px 28px rgba(17,19,21,0.12)",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: BRAND.red,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Before our call
                </div>
                <h3
                  style={{
                    margin: "0 0 8px",
                    fontSize: "clamp(22px, 3.4vw, 28px)",
                    fontWeight: 700,
                    letterSpacing: "-0.015em",
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
                  padding: "14px 26px",
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
          <img src="/ty-page/logo-dark.svg" alt="Pinformance" style={{ height: 24, opacity: 0.85 }} />
          <p style={{ color: BRAND.muted, fontSize: 13, margin: 0 }}>
            © 2026 Pinformance Agency. We win when you win.
          </p>
        </div>
      </footer>
    </div>
  );
}
