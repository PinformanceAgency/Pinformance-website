import type { Metadata } from "next";
import { OrganicSidebar } from "./OrganicSidebar";

export const metadata: Metadata = {
  title: "Organic — Pinformance Agency",
  description: "Organic workflow tool for the Pinformance team.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.ico" },
};

export default function OrganicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <OrganicSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
