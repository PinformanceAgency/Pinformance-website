import type { Metadata } from "next";
import { Source_Serif_4, Inter } from "next/font/google";
import { OrganicSidebar } from "./OrganicSidebar";

/**
 * Two families, used with intent.
 *
 * Display — Source Serif 4. A transitional serif with enough contrast to
 * read as editorial and enough weight to hold a 56px figure without
 * looking thin. This is the single highest-leverage choice in the design:
 * it is what makes the surface read as a report rather than a tool.
 *
 * Interface — Inter, already the dashboard's face, with tabular figures
 * switched on so numeric columns align.
 */
const displaySerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-o-serif",
  display: "swap",
});

const interfaceSans = Inter({
  subsets: ["latin"],
  variable: "--font-o-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Organic — Pinformance Agency",
  description: "Organic workflow tool for the Pinformance team.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.ico" },
};

export default function OrganicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${displaySerif.variable} ${interfaceSans.variable} o-root flex h-screen overflow-hidden`}>
      <OrganicSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-7">{children}</div>
      </main>
    </div>
  );
}
