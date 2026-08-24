import type { Metadata } from "next";
import { headers } from "next/headers";
import { Source_Serif_4, Inter } from "next/font/google";
import { OrganicSidebar } from "./OrganicSidebar";
import { loadClientNav, loadSwitchableClients } from "@/lib/organic/nav";

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

/** /client/<uuid>/… and /report/<uuid> both scope the sidebar to a store. */
const ORG_IN_PATH =
  /^\/(?:client|report)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export default async function OrganicLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware on the hostname rewrite — a root layout cannot see
  // the params of nested routes, so the path arrives as a header instead.
  // Absent only when /organic/* is hit directly rather than through the
  // organic hostname; the sidebar then falls back to its picker state,
  // which is degraded but not broken.
  const h = await headers();
  const orgId = ORG_IN_PATH.exec(h.get("x-organic-path") ?? "")?.[1] ?? null;

  const [clients, nav] = await Promise.all([
    loadSwitchableClients(),
    orgId ? loadClientNav(orgId) : Promise.resolve(null),
  ]);

  return (
    <div className={`${displaySerif.variable} ${interfaceSans.variable} o-root flex h-screen overflow-hidden`}>
      <OrganicSidebar clients={clients} nav={nav} />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-7">{children}</div>
      </main>
    </div>
  );
}
