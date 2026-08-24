import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Organic — Pinformance Agency",
  description: "Organic workflow tool for the Pinformance team.",
  robots: { index: false, follow: false },
};

export default function OrganicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            <span className="text-primary">Pinformance</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-foreground">Organic</span>
          </Link>
          <span className="text-xs text-muted-foreground">Internal workflow tool</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
