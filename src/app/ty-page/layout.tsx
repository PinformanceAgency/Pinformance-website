import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're booked — Pinformance Agency",
  description: "Your Pinformance roadmap call is confirmed.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      {
        url: "/ty-page/favicon-light.jpg",
        media: "(prefers-color-scheme: light)",
        sizes: "32x32",
      },
      {
        url: "/ty-page/favicon-dark.jpg",
        media: "(prefers-color-scheme: dark)",
        sizes: "32x32",
      },
    ],
  },
};

export default function TyPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
