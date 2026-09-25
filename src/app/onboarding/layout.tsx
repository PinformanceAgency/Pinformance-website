import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding | Pinformance Agency",
  description: "Complete your onboarding so we can go live fast.",
  robots: { index: false, follow: false },
  // No `icons` here: the root favicon.ico / icon.png / apple-icon.png are the
  // real logo. Pinning icons in this layout overrides them for this hostname.
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
