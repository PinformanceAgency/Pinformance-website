import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pinformance — Salespresentatie",
  description:
    "Pinterest, en verder niets. Het kanaal, wie wij zijn, hoe wij werken, de cijfers en het model.",
};

export default function PitchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
