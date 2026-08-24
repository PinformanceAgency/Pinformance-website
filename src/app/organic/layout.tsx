import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { OrganicSidebar } from "./OrganicSidebar";
import { loadClientNav, loadSwitchableClients } from "@/lib/organic/nav";

/**
 * One family, the dashboard's.
 *
 * This app used to load Source Serif 4 for headings and headline figures.
 * It was the single loudest way the organic app looked like a different
 * product from the media-buying dashboard, so it is gone — everything is
 * Inter with tabular figures, exactly as the dashboard sets it.
 */
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
    <div className={`${interfaceSans.variable} o-root flex h-screen overflow-hidden`}>
      <OrganicSidebar clients={clients} nav={nav} />
      <main className="flex-1 overflow-y-auto">
        {/* Same container as the dashboard: p-6, max-w-7xl, centred. */}
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
