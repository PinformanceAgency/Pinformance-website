import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding — Pinformance Agency",
  description: "Doorloop de onboarding zodat we snel live kunnen.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/onboarding/favicon-light.jpg", media: "(prefers-color-scheme: light)", sizes: "32x32" },
      { url: "/onboarding/favicon-dark.jpg", media: "(prefers-color-scheme: dark)", sizes: "32x32" },
    ],
  },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
