import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pinformance, salespresentatie",
  description:
    "Pinterest, en verder niets. Het kanaal, wie wij zijn, hoe wij werken, de cijfers, de garanties en het model.",
};

export default function PitchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
