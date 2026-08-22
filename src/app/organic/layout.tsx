import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Organic — Pinformance Agency",
  description: "Organic workflow tool for the Pinformance team.",
  robots: { index: false, follow: false },
};

export default function OrganicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Pinformance <span className="text-neutral-400">/</span> Organic
          </Link>
          <span className="text-xs text-neutral-500">Internal workflow tool</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
