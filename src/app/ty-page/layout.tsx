import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're booked — Pinformance Agency",
  description: "Your Pinformance roadmap call is confirmed.",
  robots: { index: false, follow: false },
};

export default function TyPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
