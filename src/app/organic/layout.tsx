import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organic — Pinformance Agency",
  description: "Organic app for Pinformance clients.",
  robots: { index: false, follow: false },
};

export default function OrganicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
