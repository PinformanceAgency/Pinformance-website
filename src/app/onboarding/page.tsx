import OnboardingApp from "./OnboardingApp";

export const dynamic = "force-static";

export default function OnboardingPage() {
  return (
    <div
      style={{
        fontFamily:
          "Inter, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        color: "#111315",
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

      {/* HEADER */}
      <header
        style={{
          padding: "20px 0",
          borderBottom: "1px solid #ececec",
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "saturate(180%) blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="https://pinformance-agency.com" aria-label="Pinformance Agency">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/onboarding/logo-dark.svg" alt="Pinformance" style={{ height: 28, width: "auto", display: "block" }} />
          </a>
          <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: "#6b7075", fontWeight: 600 }}>
            Onboarding
          </span>
        </div>
      </header>

      <OnboardingApp />
    </div>
  );
}
