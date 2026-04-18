import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pinformance Calculator — Pinterest Performance Advertising",
  description: "Bereken de kosten en opbrengst van Pinformance voor jouw brand.",
};

export default function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
