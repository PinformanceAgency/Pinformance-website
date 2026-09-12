import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Growth Engine™ — Pinformance",
  description: "Jouw roadmap van START naar schaalbaar — in 3 fases.",
};

export default function PitchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
